# ====================================
# Upload Secrets to AWS Parameter Store (PowerShell)
# ====================================

$Region = "eu-central-1"
$Env = "staging"
$Prefix = "/meravie/$Env"

Write-Host "🔐 Uploading secrets to AWS Parameter Store..." -ForegroundColor Green
Write-Host "Region: $Region"
Write-Host "Environment: $Env"
Write-Host "Prefix: $Prefix"
Write-Host ""

# Read .env file
Get-Content .env | ForEach-Object {
    $line = $_.Trim()

    # Skip comments and empty lines
    if ($line -match "^#" -or $line -eq "") {
        return
    }

    # Parse key=value
    if ($line -match "^([^=]+)=(.*)$") {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()

        if ($value -eq "") {
            return
        }

        Write-Host "📤 Uploading: $key" -ForegroundColor Cyan

        try {
            aws ssm put-parameter `
                --name "$Prefix/$key" `
                --value "$value" `
                --type "SecureString" `
                --region $Region `
                --overwrite `
                --no-cli-pager 2>$null
        }
        catch {
            Write-Host "⚠️ Failed to upload $key" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "✅ Secrets upload completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Verify with:"
Write-Host "aws ssm get-parameters-by-path --path $Prefix --region $Region"
