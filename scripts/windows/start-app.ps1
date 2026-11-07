param(
    [switch]$SkipBuild,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Dist = Join-Path $Root "frontend\dist"

& (Join-Path $PSScriptRoot "start-postgres.ps1")

if (-not $SkipBuild) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $npm) {
        throw "npm introuvable. Installez Node.js LTS ou exécutez setup-windows.ps1."
    }
    Push-Location (Join-Path $Root "frontend")
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Échec de la compilation du frontend." }
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path (Join-Path $Dist "index.html"))) {
    throw "Frontend compilé introuvable. Exécutez npm run build dans frontend."
}

$env:SERVE_FRONTEND = "true"
$env:FRONTEND_DIST = $Dist
$env:APP_ENV = "production"
$env:SECURE_COOKIES = "false"

if ($OpenBrowser) {
    Start-Process "http://127.0.0.1:8000"
}

Set-Location (Join-Path $Root "backend")
Write-Host "SI PNFor PILOTE : http://127.0.0.1:8000"
Write-Host "Documentation API : http://127.0.0.1:8000/api/docs"
& .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
