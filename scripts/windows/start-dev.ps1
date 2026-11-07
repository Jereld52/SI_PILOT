$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

& (Join-Path $PSScriptRoot "start-postgres.ps1")

$apiCommand = "Set-Location '$Root\backend'; .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload"
$webCommand = "Set-Location '$Root\frontend'; npm run dev"

Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $apiCommand | Out-Null
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $webCommand | Out-Null

Write-Host ""
Write-Host "API      : http://127.0.0.1:8000/api/docs"
Write-Host "Frontend : http://127.0.0.1:5173"
Write-Host "Deux fenêtres PowerShell ont été ouvertes. Fermez-les pour arrêter les services."
