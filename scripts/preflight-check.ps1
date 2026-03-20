# ====================================
# PRE-FLIGHT CHECK - Verifica Prerequisiti
# ====================================

Write-Host "🔍 Verifico prerequisiti per deployment..." -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# ====================================
# 1. AWS CLI
# ====================================
Write-Host "1️⃣ AWS CLI..." -ForegroundColor Yellow

try {
    $awsIdentity = aws sts get-caller-identity --region eu-central-1 2>&1 | ConvertFrom-Json
    Write-Host "   ✅ AWS CLI configurato" -ForegroundColor Green
    Write-Host "      Account: $($awsIdentity.Account)" -ForegroundColor Gray
    Write-Host "      User: $($awsIdentity.Arn)" -ForegroundColor Gray
}
catch {
    Write-Host "   ❌ AWS CLI non configurato o non funzionante" -ForegroundColor Red
    Write-Host "      Esegui: aws configure" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host ""

# ====================================
# 2. Docker
# ====================================
Write-Host "2️⃣ Docker..." -ForegroundColor Yellow

try {
    $dockerVersion = docker --version 2>&1
    Write-Host "   ✅ Docker installato: $dockerVersion" -ForegroundColor Green

    # Prova a verificare se Docker daemon è in esecuzione
    try {
        docker ps 2>&1 | Out-Null
        Write-Host "   ✅ Docker daemon in esecuzione" -ForegroundColor Green
    }
    catch {
        Write-Host "   ⚠️ Docker daemon NON in esecuzione" -ForegroundColor Red
        Write-Host "      AZIONE RICHIESTA: Avvia Docker Desktop manualmente" -ForegroundColor Yellow
        Write-Host "      Percorso: C:\Program Files\Docker\Docker\Docker Desktop.exe" -ForegroundColor Gray
        $allGood = $false
    }
}
catch {
    Write-Host "   ❌ Docker non installato" -ForegroundColor Red
    Write-Host "      Scarica da: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host ""

# ====================================
# 3. .env File
# ====================================
Write-Host "3️⃣ Environment Variables (.env)..." -ForegroundColor Yellow

if (Test-Path .env) {
    Write-Host "   ✅ File .env trovato" -ForegroundColor Green

    # Verifica variabili critiche
    $envContent = Get-Content .env
    $requiredVars = @(
        'DATABASE_URL',
        'JWT_SECRET',
        'STRIPE_SECRET_KEY',
        'REDIS_HOST',
        'REDIS_PORT',
        'REDIS_PASSWORD'
    )

    $missingVars = @()
    foreach ($var in $requiredVars) {
        $found = $envContent | Where-Object { $_ -match "^$var=" }
        if (-not $found) {
            $missingVars += $var
        }
    }

    if ($missingVars.Count -eq 0) {
        Write-Host "   ✅ Tutte le variabili critiche presenti" -ForegroundColor Green
    }
    else {
        Write-Host "   ⚠️ Variabili mancanti: $($missingVars -join ', ')" -ForegroundColor Yellow
        $allGood = $false
    }
}
else {
    Write-Host "   ❌ File .env non trovato" -ForegroundColor Red
    Write-Host "      Copia .env.example a .env e compila i valori" -ForegroundColor Yellow
    $allGood = $false
}

Write-Host ""

# ====================================
# 4. Git (opzionale per CI/CD)
# ====================================
Write-Host "4️⃣ Git (opzionale)..." -ForegroundColor Yellow

try {
    $gitVersion = git --version 2>&1
    Write-Host "   ✅ Git installato: $gitVersion" -ForegroundColor Green

    # Verifica remote GitHub
    try {
        $gitRemote = git remote get-url origin 2>&1
        if ($gitRemote -match "github.com") {
            Write-Host "   ✅ GitHub remote configurato: $gitRemote" -ForegroundColor Green
        }
        else {
            Write-Host "   ⚠️ GitHub remote non configurato (non critico)" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "   ⚠️ Git repository non inizializzato (non critico)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "   ⚠️ Git non installato (non critico per deployment manuale)" -ForegroundColor Yellow
}

Write-Host ""

# ====================================
# 5. Node.js (per build locale)
# ====================================
Write-Host "5️⃣ Node.js..." -ForegroundColor Yellow

try {
    $nodeVersion = node --version 2>&1
    Write-Host "   ✅ Node.js installato: $nodeVersion" -ForegroundColor Green

    if (Test-Path package.json) {
        Write-Host "   ✅ package.json trovato" -ForegroundColor Green

        if (Test-Path node_modules) {
            Write-Host "   ✅ node_modules presente" -ForegroundColor Green
        }
        else {
            Write-Host "   ⚠️ node_modules mancante (Docker lo installerà)" -ForegroundColor Yellow
        }
    }
}
catch {
    Write-Host "   ⚠️ Node.js non installato (non critico, Docker lo usa)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "✅ TUTTI I PREREQUISITI SODDISFATTI!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 Pronto per deployment! Esegui:" -ForegroundColor Cyan
    Write-Host "   .\scripts\deploy-staging-complete.ps1" -ForegroundColor White
}
else {
    Write-Host "⚠️ ALCUNI PREREQUISITI MANCANTI" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📋 Completa le azioni richieste sopra prima di deployare." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "AZIONE PIÙ COMUNE:" -ForegroundColor Cyan
    Write-Host "  1. Avvia Docker Desktop" -ForegroundColor White
    Write-Host "  2. Attendi che sia pronto (icona Docker nella system tray)" -ForegroundColor White
    Write-Host "  3. Rilancia questo script per verificare" -ForegroundColor White
}

Write-Host "======================================" -ForegroundColor Cyan
