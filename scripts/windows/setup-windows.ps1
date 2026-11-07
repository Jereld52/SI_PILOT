param(
    [switch]$SkipPrereqs,
    [string]$PostgresVersion = "17.7"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Runtime = Join-Path $Root ".runtime"
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$PgDir = Join-Path $Runtime "pgsql"
$PgData = Join-Path $Runtime "pgdata"
$PgZip = Join-Path $Runtime "postgresql-$PostgresVersion.zip"
$PgPasswordFile = Join-Path $Runtime "pg_password.txt"
$PgBin = Join-Path $PgDir "bin"

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
        [Environment]::GetEnvironmentVariable("Path", "User")
}

function Install-WithWinget([string]$Id, [string]$Scope = "user") {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget est requis pour installer $Id. Installez-le manuellement."
    }
    Write-Host "Installation de $Id ..."
    winget install --id $Id -e --scope $Scope --silent --accept-source-agreements --accept-package-agreements
    Refresh-Path
}

Refresh-Path

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.13 est requis. Installez-le puis relancez ce script."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    if ($SkipPrereqs) { throw "Node.js est absent. Relancez sans -SkipPrereqs ou installez Node.js LTS." }
    Install-WithWinget "OpenJS.NodeJS.LTS"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm est introuvable après installation de Node.js."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    if (-not $SkipPrereqs) {
        try { Install-WithWinget "Git.Git" } catch { Write-Warning "Git non installé : $($_.Exception.Message)" }
    }
}

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

if (-not (Test-Path (Join-Path $PgBin "initdb.exe"))) {
    if (-not (Test-Path $PgZip)) {
        Write-Host "Téléchargement de PostgreSQL $PostgresVersion ..."
        curl.exe -L --fail --retry 3 -o $PgZip "https://get.enterprisedb.com/postgresql/postgresql-$PostgresVersion-1-windows-x64-binaries.zip"
        if ($LASTEXITCODE -ne 0) { throw "Téléchargement de PostgreSQL impossible." }
    }
    Write-Host "Extraction de PostgreSQL ..."
    tar -xf $PgZip -C $Runtime
    if ($LASTEXITCODE -ne 0) { throw "Extraction de PostgreSQL impossible." }
}

if (-not (Test-Path $PgData)) {
    Write-Host "Initialisation du cluster PostgreSQL ..."
    $password = & python -c "import secrets; print(secrets.token_urlsafe(24))"
    [System.IO.File]::WriteAllText($PgPasswordFile, $password, [System.Text.UTF8Encoding]::new($false))
    & (Join-Path $PgBin "initdb.exe") -D $PgData -U pnfor --pwfile=$PgPasswordFile `
        --auth-host=scram-sha-256 --auth-local=trust --encoding=UTF8 --locale=C
    if ($LASTEXITCODE -ne 0) { throw "Initialisation de PostgreSQL impossible." }
}

$pgPassword = (Get-Content $PgPasswordFile -Raw).Trim()
$env:PGPASSWORD = $pgPassword

& (Join-Path $PSScriptRoot "start-postgres.ps1")

$psql = Join-Path $PgBin "psql.exe"
$createdb = Join-Path $PgBin "createdb.exe"
$exists = (& $psql -h 127.0.0.1 -p 5433 -U pnfor -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='si_pnfor'").Trim()
if ($exists -ne "1") {
    Write-Host "Création de la base si_pnfor ..."
    & $createdb -h 127.0.0.1 -p 5433 -U pnfor si_pnfor
    if ($LASTEXITCODE -ne 0) { throw "Création de la base impossible." }
}

$envFile = Join-Path $Backend ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "Génération de backend\.env ..."
    $secret = & python -c "import secrets; print(secrets.token_urlsafe(64))"
    $fernetKey = & python -c "import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
    $content = Get-Content (Join-Path $Backend ".env.example") -Raw
    $content = $content -replace "(?m)^SECRET_KEY=.*$", "SECRET_KEY=$secret"
    $content = $content -replace "(?m)^FIELD_ENCRYPTION_KEY=.*$", "FIELD_ENCRYPTION_KEY=$fernetKey"
    $content = $content -replace "(?m)^DATABASE_URL=.*$", "DATABASE_URL=postgresql+psycopg://pnfor:$pgPassword@127.0.0.1:5433/si_pnfor"
    [System.IO.File]::WriteAllText($envFile, $content, [System.Text.UTF8Encoding]::new($false))
}

$venvPython = Join-Path $Backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "Création de l'environnement Python ..."
    python -m venv (Join-Path $Backend ".venv")
}
& $venvPython -m pip install --upgrade pip
& (Join-Path $Backend ".venv\Scripts\pip.exe") install -r (Join-Path $Backend "requirements-dev.txt")
if ($LASTEXITCODE -ne 0) { throw "Installation des dépendances Python impossible." }

Push-Location $Backend
try {
    & .\.venv\Scripts\alembic.exe upgrade head
    if ($LASTEXITCODE -ne 0) { throw "Migration Alembic impossible." }
    & .\.venv\Scripts\python.exe -m app.cli seed
    if ($LASTEXITCODE -ne 0) { throw "Initialisation des référentiels impossible." }
}
finally {
    Pop-Location
}

Push-Location $Frontend
try {
    if (Test-Path "package-lock.json") {
        npm ci --no-audit --no-fund
    }
    else {
        npm install --no-audit --no-fund
    }
    if ($LASTEXITCODE -ne 0) { throw "Installation des dépendances frontend impossible." }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Compilation du frontend impossible." }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Installation terminée."
Write-Host "Créer le compte administrateur :"
Write-Host "  cd backend"
Write-Host "  .\.venv\Scripts\python.exe -m app.cli create-admin --email admin@pnfor.fr --first-name Admin --last-name 'SI PNFor' --generate"
Write-Host ""
Write-Host "Démarrer l'application : scripts\windows\start-app.ps1 -OpenBrowser"
Write-Host "Développer : scripts\windows\start-dev.ps1"
