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
    $browserCommand = "for (`$i = 0; `$i -lt 60; `$i++) { try { `$r = Invoke-WebRequest 'http://127.0.0.1:8000/health' -UseBasicParsing -TimeoutSec 2; if (`$r.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:8000'; break } } catch {}; Start-Sleep -Milliseconds 500 }"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile", "-Command", $browserCommand | Out-Null
}

Set-Location (Join-Path $Root "backend")
Write-Host "SI PILOT : http://127.0.0.1:8000"
Write-Host "Documentation API : http://127.0.0.1:8000/api/docs"
& .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
