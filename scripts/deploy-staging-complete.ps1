# ====================================
# MERAVIE BACKEND - COMPLETE STAGING DEPLOYMENT (PowerShell)
# ====================================

$ErrorActionPreference = "Stop"

$REGION = "eu-central-1"
$ACCOUNT_ID = "684160547814"
$PROJECT = "meravie"
$ENV = "staging"
$ECR_REPO = "$PROJECT-backend-$ENV"
$ECS_CLUSTER = "$PROJECT-$ENV"
$ECS_SERVICE = "$PROJECT-backend-service"
$ECS_TASK_FAMILY = "$PROJECT-backend-task"

Write-Host "🚀 Starting complete staging deployment..." -ForegroundColor Green
Write-Host "Region: $REGION"
Write-Host "Account: $ACCOUNT_ID"
Write-Host ""

# ====================================
# STEP 1: Upload Secrets to Parameter Store
# ====================================
Write-Host "📦 STEP 1: Uploading secrets to Parameter Store..." -ForegroundColor Cyan

Get-Content .env | ForEach-Object {
    $line = $_.Trim()

    if ($line -match "^#" -or $line -eq "") {
        return
    }

    if ($line -match "^([^=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()

        if ($value -eq "") {
            return
        }

        Write-Host "  📤 $key" -ForegroundColor Gray

        try {
            aws ssm put-parameter `
                --name "/$PROJECT/$ENV/$key" `
                --value "$value" `
                --type "SecureString" `
                --region $REGION `
                --overwrite `
                --no-cli-pager 2>$null
        }
        catch {
            Write-Host "  ⚠️ Failed: $key" -ForegroundColor Yellow
        }
    }
}

Write-Host "✅ Secrets uploaded!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 2: Create ECR Repository
# ====================================
Write-Host "📦 STEP 2: Creating ECR repository..." -ForegroundColor Cyan

try {
    aws ecr describe-repositories --repository-names $ECR_REPO --region $REGION --no-cli-pager 2>$null
    Write-Host "  ECR repository already exists" -ForegroundColor Gray
}
catch {
    aws ecr create-repository --repository-name $ECR_REPO --region $REGION --no-cli-pager
}

$ECR_URI = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO"
Write-Host "✅ ECR Repository: $ECR_URI" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 3: Build and Push Docker Image
# ====================================
Write-Host "🐳 STEP 3: Building Docker image..." -ForegroundColor Cyan

docker build -t "${ECR_REPO}:latest" .

Write-Host "🔐 Logging into ECR..." -ForegroundColor Cyan
$LOGIN_PASSWORD = aws ecr get-login-password --region $REGION
$LOGIN_PASSWORD | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

Write-Host "📤 Pushing image to ECR..." -ForegroundColor Cyan
docker tag "${ECR_REPO}:latest" "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"

Write-Host "✅ Docker image pushed!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 4: Create CloudWatch Log Group
# ====================================
Write-Host "📊 STEP 4: Creating CloudWatch log group..." -ForegroundColor Cyan

try {
    aws logs create-log-group --log-group-name "/ecs/$ECR_REPO" --region $REGION --no-cli-pager 2>$null
}
catch {
    Write-Host "  Log group already exists" -ForegroundColor Gray
}

Write-Host "✅ Log group ready!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 5: Create ECS Cluster
# ====================================
Write-Host "🎯 STEP 5: Creating ECS cluster..." -ForegroundColor Cyan

try {
    aws ecs create-cluster --cluster-name $ECS_CLUSTER --region $REGION --no-cli-pager 2>$null
}
catch {
    Write-Host "  Cluster already exists" -ForegroundColor Gray
}

Write-Host "✅ ECS Cluster created!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 6: Create IAM Roles (if not exist)
# ====================================
Write-Host "🔐 STEP 6: Checking IAM roles..." -ForegroundColor Cyan

# Task Execution Role
try {
    aws iam get-role --role-name ecsTaskExecutionRole --no-cli-pager 2>$null
}
catch {
    $TRUST_POLICY = @'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
'@
    aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document $TRUST_POLICY --no-cli-pager
}

aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>$null
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess 2>$null

# Task Role
try {
    aws iam get-role --role-name ecsTaskRole --no-cli-pager 2>$null
}
catch {
    $TRUST_POLICY = @'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ecs-tasks.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
'@
    aws iam create-role --role-name ecsTaskRole --assume-role-policy-document $TRUST_POLICY --no-cli-pager
}

Write-Host "✅ IAM Roles ready!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 7: Register Task Definition
# ====================================
Write-Host "📋 STEP 7: Registering ECS task definition..." -ForegroundColor Cyan

$TASK_DEF = @"
{
  "family": "$ECS_TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskRole",
  "containerDefinitions": [{
    "name": "$PROJECT-backend",
    "image": "${ECR_URI}:latest",
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
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/$PROJECT/$ENV/DATABASE_URL"},
      {"name": "JWT_SECRET", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/$PROJECT/$ENV/JWT_SECRET"},
      {"name": "STRIPE_SECRET_KEY", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/$PROJECT/$ENV/STRIPE_SECRET_KEY"},
      {"name": "REDIS_HOST", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/$PROJECT/$ENV/REDIS_HOST"},
      {"name": "REDIS_PORT", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/$PROJECT/$ENV/REDIS_PORT"},
      {"name": "REDIS_PASSWORD", "valueFrom": "arn:aws:ssm:${REGION}:${ACCOUNT_ID}:parameter/$PROJECT/$ENV/REDIS_PASSWORD"}
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
"@

$TASK_DEF | Out-File -FilePath "$env:TEMP\task-def.json" -Encoding UTF8

aws ecs register-task-definition --cli-input-json "file://$env:TEMP\task-def.json" --region $REGION --no-cli-pager

Write-Host "✅ Task definition registered!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 8: Get Default VPC and Subnets
# ====================================
Write-Host "🌐 STEP 8: Getting VPC configuration..." -ForegroundColor Cyan

$VPC_ID = aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region $REGION

$SUBNETS = aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text --region $REGION
$SUBNETS = $SUBNETS -replace '\s+', ','

Write-Host "  VPC: $VPC_ID" -ForegroundColor Gray
Write-Host "  Subnets: $SUBNETS" -ForegroundColor Gray
Write-Host ""

# ====================================
# STEP 9: Create Security Group
# ====================================
Write-Host "🔒 STEP 9: Creating security group..." -ForegroundColor Cyan

$SG_ID = aws ec2 describe-security-groups --filters "Name=group-name,Values=$PROJECT-$ENV-sg" "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[0].GroupId" --output text --region $REGION 2>$null

if ($SG_ID -eq "None" -or [string]::IsNullOrEmpty($SG_ID)) {
    $SG_ID = aws ec2 create-security-group --group-name "$PROJECT-$ENV-sg" --description "Security group for $PROJECT $ENV" --vpc-id $VPC_ID --region $REGION --output text --no-cli-pager

    aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $REGION --no-cli-pager

    Write-Host "  Created: $SG_ID" -ForegroundColor Gray
}
else {
    Write-Host "  Existing: $SG_ID" -ForegroundColor Gray
}

Write-Host "✅ Security group ready!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 10: Create ECS Service
# ====================================
Write-Host "🚀 STEP 10: Creating ECS service..." -ForegroundColor Cyan

try {
    aws ecs create-service `
        --cluster $ECS_CLUSTER `
        --service-name $ECS_SERVICE `
        --task-definition $ECS_TASK_FAMILY `
        --desired-count 1 `
        --launch-type FARGATE `
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" `
        --region $REGION `
        --no-cli-pager 2>$null
}
catch {
    aws ecs update-service `
        --cluster $ECS_CLUSTER `
        --service $ECS_SERVICE `
        --task-definition $ECS_TASK_FAMILY `
        --force-new-deployment `
        --region $REGION `
        --no-cli-pager
}

Write-Host "✅ ECS Service deployed!" -ForegroundColor Green
Write-Host ""

# ====================================
# STEP 11: Get Task Public IP
# ====================================
Write-Host "⏳ Waiting for task to start (60 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 60

$TASK_ARN = aws ecs list-tasks --cluster $ECS_CLUSTER --service-name $ECS_SERVICE --desired-status RUNNING --query "taskArns[0]" --output text --region $REGION

if ($TASK_ARN -ne "None" -and ![string]::IsNullOrEmpty($TASK_ARN)) {
    $ENI_ID = aws ecs describe-tasks --cluster $ECS_CLUSTER --tasks $TASK_ARN --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text --region $REGION

    $PUBLIC_IP = aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --query "NetworkInterfaces[0].Association.PublicIp" --output text --region $REGION

    Write-Host ""
    Write-Host "======================================" -ForegroundColor Green
    Write-Host "✅ DEPLOYMENT COMPLETED!" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Application URL: http://${PUBLIC_IP}:3000" -ForegroundColor Cyan
    Write-Host "🏥 Health Check: http://${PUBLIC_IP}:3000/health" -ForegroundColor Cyan
    Write-Host "📊 API Docs: http://${PUBLIC_IP}:3000/api" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📋 CloudWatch Logs:" -ForegroundColor Yellow
    Write-Host "   aws logs tail /ecs/$ECR_REPO --follow --region $REGION" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🔍 Task ARN: $TASK_ARN" -ForegroundColor Gray
    Write-Host "🆔 Public IP: $PUBLIC_IP" -ForegroundColor Gray
    Write-Host ""
}
else {
    Write-Host "⚠️ Task not running yet. Check:" -ForegroundColor Yellow
    Write-Host "   aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $REGION" -ForegroundColor Gray
}

Write-Host "======================================" -ForegroundColor Green
Write-Host "🎉 Staging is LIVE!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
