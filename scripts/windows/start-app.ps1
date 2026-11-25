param(
    [switch]$SkipBuild,
    [switch]$OpenBrowser,
    [string]$BindAddress = "127.0.0.1",
    [int]$Port = 8000,
    [string]$PublicUrl = ""
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
if (-not $PublicUrl) {
    $PublicUrl = "http://127.0.0.1:$Port"
}
$env:PUBLIC_BASE_URL = $PublicUrl
if ($PublicUrl -match '^https://') {
    $env:SECURE_COOKIES = "true"
    $env:TRUST_PROXY_HEADERS = "true"
}
else {
    $env:SECURE_COOKIES = "false"
    $env:TRUST_PROXY_HEADERS = "false"
}

if ($OpenBrowser) {
    $browserCommand = "for (`$i = 0; `$i -lt 60; `$i++) { try { `$r = Invoke-WebRequest 'http://127.0.0.1:$Port/health' -UseBasicParsing -TimeoutSec 2; if (`$r.StatusCode -eq 200) { Start-Process '$PublicUrl'; break } } catch {}; Start-Sleep -Milliseconds 500 }"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile", "-Command", $browserCommand | Out-Null
}

Set-Location (Join-Path $Root "backend")
Write-Host "SI PILOT : $PublicUrl"
Write-Host "Écoute : $BindAddress`:$Port"
Write-Host "Documentation API : $PublicUrl/api/docs"
& .\.venv\Scripts\uvicorn.exe app.main:app --host $BindAddress --port $Port
