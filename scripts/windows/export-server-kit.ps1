param(
    [string]$OutputDir = "",
    [switch]$SkipBuild,
    [switch]$SkipBackup,
    [string]$PublicUrl = "",
    [string]$SecretsFile = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Runtime = Join-Path $Root ".runtime"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
$EnvFile = Join-Path $Backend ".env"

if (-not $OutputDir) {
    $OutputDir = Join-Path $Runtime "export"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stage = Join-Path $OutputDir "SI-PILOT-server-$stamp"
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$migration = Join-Path $stage "migration"
New-Item -ItemType Directory -Force -Path $migration | Out-Null

function Copy-Tree {
    param(
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludeDirs = @(),
        [string[]]$ExcludeFiles = @()
    )
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $arguments = @($Source, $Destination, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
    if ($ExcludeDirs.Count -gt 0) {
        $arguments += "/XD"
        $arguments += $ExcludeDirs
    }
    if ($ExcludeFiles.Count -gt 0) {
        $arguments += "/XF"
        $arguments += $ExcludeFiles
    }
    & robocopy @arguments | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "Copie impossible : $Source vers $Destination (robocopy $LASTEXITCODE)."
    }
}

if (-not $SkipBuild) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm est requis pour compiler le frontend. Utilisez -SkipBuild si dist existe déjà."
    }
    Push-Location $Frontend
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Compilation du frontend impossible." }
    }
    finally {
        Pop-Location
    }
}
if (-not (Test-Path (Join-Path $Frontend "dist\index.html"))) {
    throw "Frontend compilé introuvable. Lancez npm run build ou retirez -SkipBuild."
}

Write-Host "Copie du code ..."
Copy-Tree `
    -Source $Backend `
    -Destination (Join-Path $stage "backend") `
    -ExcludeDirs @(".venv", "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", "data") `
    -ExcludeFiles @(".env", "*.db", "*.log")
Copy-Tree `
    -Source (Join-Path $Frontend "dist") `
    -Destination (Join-Path $stage "frontend\dist")
Copy-Tree `
    -Source (Join-Path $Root "scripts") `
    -Destination (Join-Path $stage "scripts")
Copy-Tree `
    -Source (Join-Path $Root "docs") `
    -Destination (Join-Path $stage "docs")
Copy-Tree `
    -Source (Join-Path $Root "infra") `
    -Destination (Join-Path $stage "infra") `
    -ExcludeDirs @("__pycache__") `
    -ExcludeFiles @(".env")
Copy-Item (Join-Path $Root "README.md") (Join-Path $stage "README.md") -Force

Write-Host "Préparation des secrets de migration ..."
$secretLines = @()
if ($SecretsFile) {
    if (-not (Test-Path $SecretsFile)) { throw "Fichier de secrets introuvable : $SecretsFile" }
    $secretLines = Get-Content $SecretsFile
}
elseif (Test-Path $EnvFile) {
    $secretLines = Get-Content $EnvFile | Where-Object {
        $_ -match '^\s*(SECRET_KEY|FIELD_ENCRYPTION_KEY)\s*='
    }
}
if ($secretLines.Count -gt 0) {
    $secretLines | Set-Content (Join-Path $migration "secrets.env") -Encoding utf8
    Write-Warning "Le kit contient migration\secrets.env (SECRET_KEY, FIELD_ENCRYPTION_KEY). Protégez-le."
}

$backupIncluded = $false
if (-not $SkipBackup) {
    if (Test-Path $VenvPython) {
        Write-Host "Création de la sauvegarde complète pour la migration ..."
        try {
            & (Join-Path $PSScriptRoot "start-postgres.ps1")
            Push-Location $Backend
            try {
                $archive = & $VenvPython -c "from app.db.session import SessionLocal; from app.services.backup_service import create_full_archive; db = SessionLocal(); path = create_full_archive(db, include_uploads=True); db.close(); print(path)"
            }
            finally {
                Pop-Location
            }
            if ($LASTEXITCODE -ne 0 -or -not $archive -or -not (Test-Path $archive)) {
                throw "La sauvegarde complète n'a pas pu être créée."
            }
            Copy-Item $archive (Join-Path $migration "si-pilot-backup.zip") -Force
            $backupIncluded = $true
            Write-Host "Sauvegarde incluse : $(Split-Path $archive -Leaf)"
        }
        catch {
            Write-Warning "Sauvegarde non incluse : $($_.Exception.Message)"
            Write-Warning "Créez-la depuis Administration → Sauvegarde et copiez-la dans migration\."
        }
    }
    else {
        Write-Warning "Environnement Python absent. Sauvegarde non incluse."
    }
}

$manifest = [ordered]@{
    format = "si-pilot-server-kit"
    version = 1
    created_at = (Get-Date).ToUniversalTime().ToString("o")
    source_root = $Root
    public_url = $PublicUrl
    backup_included = $backupIncluded
    secrets_included = ($secretLines.Count -gt 0)
}
$manifest | ConvertTo-Json | Set-Content (Join-Path $stage "EXPORT_MANIFEST.json") -Encoding utf8

$urlText = if ($PublicUrl) { $PublicUrl } else { "http://NOM-DU-SERVEUR:8000" }
$instructions = @'
# Kit serveur SI PILOT

Ce dossier contient l'application prête à être installée sur un serveur Windows.
Le frontend est déjà compilé : Node.js n'est pas nécessaire sur le serveur.

## 1. Installation

Copier le dossier sur le serveur, par exemple `C:\SI_PILOT`, puis dans une console
PowerShell administrateur :

```powershell
cd C:\SI_PILOT
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-windows.ps1 -SkipFrontend -SecretsFile .\migration\secrets.env
```

Le script installe Python, PostgreSQL portable, les dépendances, la base et applique les
clés de chiffrement d'origine.

## 2. Démarrage

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-app.ps1 -BindAddress 0.0.0.0 -Port 8000 -PublicUrl "__URL__"
```

## 3. Restauration des données

1. Ouvrir __URL__ et créer le premier administrateur si la base est vide.
2. Aller dans **Administration → Sauvegarde**.
3. Restaurer `migration\si-pilot-backup.zip`.
4. Se reconnecter avec un compte existant de l'ancienne installation.

Si le kit ne contient pas de sauvegarde, créez-la depuis l'ancienne installation
(Administration → Sauvegarde) et copiez-la dans `migration\`.

## 4. Service 24/7

Une fois l'application vérifiée :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-server.ps1 -Port 8000 -PublicUrl "__URL__"
```

La tâche planifiée démarre SI PILOT au boot, redémarre en cas d'échec et ouvre le port
dans le pare-feu (profil domaine/privé).

## 5. HTTPS

Pour HTTPS, placer un reverse proxy (IIS, Nginx, Caddy) devant le port 8000, puis :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-server.ps1 -BindAddress 127.0.0.1 -Port 8000 -PublicUrl "https://si-pilot.votre-domaine.interne"
```

Ne pas exposer directement l'application sur Internet sans VPN ou reverse proxy TLS.

## 6. Journal

```text
C:\SI_PILOT\.runtime\server.log
```

## 7. Sauvegardes

La veille automatique peut créer des archives planifiées. Vérifier que le répertoire
`BACKUP_DIR` est sauvegardé ou répliqué sur un autre support.
'@
$instructions = $instructions.Replace("__URL__", $urlText)
$instructions | Set-Content (Join-Path $stage "INSTALL_SERVER.md") -Encoding utf8

$zip = Join-Path $OutputDir "SI-PILOT-server-$stamp.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Write-Host "Compression du kit ..."
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -CompressionLevel Fastest

$sizeMb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ""
Write-Host "Kit serveur créé : $zip" -ForegroundColor Green
Write-Host "Taille : $sizeMb Mo"
Write-Host "Sauvegarde incluse : $backupIncluded"
Write-Host "Secrets inclus : $($secretLines.Count -gt 0)"
Write-Host "Instructions : INSTALL_SERVER.md dans l'archive."
