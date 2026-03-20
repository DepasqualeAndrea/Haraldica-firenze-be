#!/bin/bash

# ====================================
# Upload Secrets to AWS Parameter Store
# ====================================

set -e

REGION="eu-central-1"
ENV="staging"
PREFIX="/meravie/$ENV"

echo "🔐 Uploading secrets to AWS Parameter Store..."
echo "Region: $REGION"
echo "Environment: $ENV"
echo "Prefix: $PREFIX"
echo ""

# Read .env file and upload each secret
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue

  # Remove leading/trailing whitespace
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)

  # Skip empty values
  [[ -z "$value" ]] && continue

  # Upload to Parameter Store
  echo "📤 Uploading: $key"

  aws ssm put-parameter \
    --name "$PREFIX/$key" \
    --value "$value" \
    --type "SecureString" \
    --region "$REGION" \
    --overwrite \
    --no-cli-pager \
    2>/dev/null || echo "⚠️ Failed to upload $key"

done < .env

echo ""
echo "✅ Secrets upload completed!"
echo ""
echo "Verify with:"
echo "aws ssm get-parameters-by-path --path $PREFIX --region $REGION"
