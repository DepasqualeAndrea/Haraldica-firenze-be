#!/bin/bash

# ====================================
# MERAVIE BACKEND - COMPLETE STAGING DEPLOYMENT
# ====================================

set -e

REGION="eu-central-1"
ACCOUNT_ID="684160547814"
PROJECT="meravie"
ENV="staging"
ECR_REPO="${PROJECT}-backend-${ENV}"
ECS_CLUSTER="${PROJECT}-${ENV}"
ECS_SERVICE="${PROJECT}-backend-service"
ECS_TASK_FAMILY="${PROJECT}-backend-task"

echo "🚀 Starting complete staging deployment..."
echo "Region: $REGION"
echo "Account: $ACCOUNT_ID"
echo ""

# ====================================
# STEP 1: Upload Secrets to Parameter Store
# ====================================
echo "📦 STEP 1: Uploading secrets to Parameter Store..."

while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  [[ -z "$value" ]] && continue

  echo "  📤 $key"
  aws ssm put-parameter \
    --name "/$PROJECT/$ENV/$key" \
    --value "$value" \
    --type "SecureString" \
    --region "$REGION" \
    --overwrite \
    --no-cli-pager 2>/dev/null || true
done < .env

echo "✅ Secrets uploaded!"
echo ""

# ====================================
# STEP 2: Create ECR Repository
# ====================================
echo "📦 STEP 2: Creating ECR repository..."

aws ecr describe-repositories \
  --repository-names "$ECR_REPO" \
  --region "$REGION" 2>/dev/null || \
aws ecr create-repository \
  --repository-name "$ECR_REPO" \
  --region "$REGION" \
  --no-cli-pager

ECR_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO"
echo "✅ ECR Repository: $ECR_URI"
echo ""

# ====================================
# STEP 3: Build and Push Docker Image
# ====================================
echo "🐳 STEP 3: Building Docker image..."

docker build -t "$ECR_REPO:latest" .

echo "🔐 Logging into ECR..."
aws ecr get-login-password --region "$REGION" | \
  docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "📤 Pushing image to ECR..."
docker tag "$ECR_REPO:latest" "$ECR_URI:latest"
docker push "$ECR_URI:latest"

echo "✅ Docker image pushed!"
echo ""

# ====================================
# STEP 4: Create CloudWatch Log Group
# ====================================
echo "📊 STEP 4: Creating CloudWatch log group..."

aws logs create-log-group \
  --log-group-name "/ecs/$ECR_REPO" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null || echo "  Log group already exists"

echo "✅ Log group ready!"
echo ""

# ====================================
# STEP 5: Create ECS Cluster
# ====================================
echo "🎯 STEP 5: Creating ECS cluster..."

aws ecs create-cluster \
  --cluster-name "$ECS_CLUSTER" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null || echo "  Cluster already exists"

echo "✅ ECS Cluster created!"
echo ""

# ====================================
# STEP 6: Create IAM Roles (if not exist)
# ====================================
echo "🔐 STEP 6: Checking IAM roles..."

# Task Execution Role
aws iam get-role --role-name ecsTaskExecutionRole 2>/dev/null || \
aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' --no-cli-pager

aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy \
  2>/dev/null || true

aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess \
  2>/dev/null || true

# Task Role
aws iam get-role --role-name ecsTaskRole 2>/dev/null || \
aws iam create-role \
  --role-name ecsTaskRole \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' --no-cli-pager

echo "✅ IAM Roles ready!"
echo ""

# ====================================
# STEP 7: Register Task Definition
# ====================================
echo "📋 STEP 7: Registering ECS task definition..."

# Update task definition with correct image URI
cat > /tmp/task-def.json <<EOF
{
  "family": "$ECS_TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskRole",
  "containerDefinitions": [{
    "name": "$PROJECT-backend",
    "image": "$ECR_URI:latest",
    "essential": true,
    "portMappings": [{
      "containerPort": 3000,
      "protocol": "tcp"
    }],
    "healthCheck": {
      "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
      "interval": 30,
      "timeout": 5,
      "retries": 3,
      "startPeriod": 60
    },
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "PORT", "value": "3000"}
    ],
    "secrets": [
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/$PROJECT/$ENV/DATABASE_URL"},
      {"name": "JWT_SECRET", "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/$PROJECT/$ENV/JWT_SECRET"},
      {"name": "STRIPE_SECRET_KEY", "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/$PROJECT/$ENV/STRIPE_SECRET_KEY"},
      {"name": "REDIS_HOST", "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/$PROJECT/$ENV/REDIS_HOST"},
      {"name": "REDIS_PORT", "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/$PROJECT/$ENV/REDIS_PORT"},
      {"name": "REDIS_PASSWORD", "valueFrom": "arn:aws:ssm:$REGION:$ACCOUNT_ID:parameter/$PROJECT/$ENV/REDIS_PASSWORD"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/$ECR_REPO",
        "awslogs-region": "$REGION",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
EOF

aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def.json \
  --region "$REGION" \
  --no-cli-pager

echo "✅ Task definition registered!"
echo ""

# ====================================
# STEP 8: Get Default VPC and Subnets
# ====================================
echo "🌐 STEP 8: Getting VPC configuration..."

VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" \
  --output text \
  --region "$REGION")

SUBNETS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].SubnetId" \
  --output text \
  --region "$REGION" | tr '\t' ',')

echo "  VPC: $VPC_ID"
echo "  Subnets: $SUBNETS"
echo ""

# ====================================
# STEP 9: Create Security Group
# ====================================
echo "🔒 STEP 9: Creating security group..."

SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=$PROJECT-$ENV-sg" "Name=vpc-id,Values=$VPC_ID" \
  --query "SecurityGroups[0].GroupId" \
  --output text \
  --region "$REGION" 2>/dev/null)

if [ "$SG_ID" == "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$PROJECT-$ENV-sg" \
    --description "Security group for $PROJECT $ENV" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --output text \
    --no-cli-pager)

  # Allow inbound HTTP
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 3000 \
    --cidr 0.0.0.0/0 \
    --region "$REGION" \
    --no-cli-pager

  echo "  Created: $SG_ID"
else
  echo "  Existing: $SG_ID"
fi

echo "✅ Security group ready!"
echo ""

# ====================================
# STEP 10: Create ECS Service
# ====================================
echo "🚀 STEP 10: Creating ECS service..."

aws ecs create-service \
  --cluster "$ECS_CLUSTER" \
  --service-name "$ECS_SERVICE" \
  --task-definition "$ECS_TASK_FAMILY" \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null || \
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$ECS_TASK_FAMILY" \
  --force-new-deployment \
  --region "$REGION" \
  --no-cli-pager

echo "✅ ECS Service deployed!"
echo ""

# ====================================
# STEP 11: Get Task Public IP
# ====================================
echo "⏳ Waiting for task to start (60 seconds)..."
sleep 60

TASK_ARN=$(aws ecs list-tasks \
  --cluster "$ECS_CLUSTER" \
  --service-name "$ECS_SERVICE" \
  --desired-status RUNNING \
  --query "taskArns[0]" \
  --output text \
  --region "$REGION")

if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
  ENI_ID=$(aws ecs describe-tasks \
    --cluster "$ECS_CLUSTER" \
    --tasks "$TASK_ARN" \
    --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" \
    --output text \
    --region "$REGION")

  PUBLIC_IP=$(aws ec2 describe-network-interfaces \
    --network-interface-ids "$ENI_ID" \
    --query "NetworkInterfaces[0].Association.PublicIp" \
    --output text \
    --region "$REGION")

  echo ""
  echo "======================================"
  echo "✅ DEPLOYMENT COMPLETED!"
  echo "======================================"
  echo ""
  echo "🌐 Application URL: http://$PUBLIC_IP:3000"
  echo "🏥 Health Check: http://$PUBLIC_IP:3000/health"
  echo "📊 API Docs: http://$PUBLIC_IP:3000/api"
  echo ""
  echo "📋 CloudWatch Logs:"
  echo "   aws logs tail /ecs/$ECR_REPO --follow --region $REGION"
  echo ""
  echo "🔍 Task ARN: $TASK_ARN"
  echo "🆔 Public IP: $PUBLIC_IP"
  echo ""
else
  echo "⚠️ Task not running yet. Check:"
  echo "   aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $REGION"
fi

echo "======================================"
echo "🎉 Staging is LIVE!"
echo "======================================"
