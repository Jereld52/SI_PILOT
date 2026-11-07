param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Host.UI.RawUI.WindowTitle = "SI PNFor PILOTE"

$existing = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Start-Process "http://127.0.0.1:8000"
    Write-Host "SI PNFor PILOTE est déjà démarré. Ouverture du navigateur..."
    Start-Sleep -Seconds 2
    exit 0
}

Write-Host "Démarrage de SI PNFor PILOTE..."
if ($SkipBuild) {
    & (Join-Path $PSScriptRoot "start-app.ps1") -OpenBrowser -SkipBuild
}
else {
    & (Join-Path $PSScriptRoot "start-app.ps1") -OpenBrowser
}
