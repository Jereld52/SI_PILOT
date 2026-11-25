param(
    [string]$BindAddress = "0.0.0.0",
    [int]$Port = 8000,
    [string]$PublicUrl = "",
    [string]$TaskName = "SI PILOT",
    [string]$FirewallProfile = "Domain,Private",
    [switch]$AllowPublicNetwork
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Backend = Join-Path $Root "backend"
$Dist = Join-Path $Root "frontend\dist"
$RunScript = Join-Path $PSScriptRoot "run-server.ps1"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
$EnvFile = Join-Path $Backend ".env"

$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ce script doit être lancé dans une console PowerShell administrateur."
}
if (-not (Test-Path $VenvPython)) {
    throw "Environnement Python introuvable. Exécutez d'abord scripts\windows\setup-windows.ps1."
}
if (-not (Test-Path $EnvFile)) {
    throw "backend\.env introuvable. Exécutez d'abord scripts\windows\setup-windows.ps1."
}
if (-not (Test-Path (Join-Path $Dist "index.html"))) {
    throw "Frontend compilé introuvable. Lancez npm run build dans frontend ou utilisez le kit serveur."
}
if (-not $PublicUrl) {
    $PublicUrl = "http://$($env:COMPUTERNAME):$Port"
}

$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$RunScript`" " +
    "-BindAddress `"$BindAddress`" -Port $Port -PublicUrl `"$PublicUrl`""
$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument $arguments `
    -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup$taskPrincipal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -match "python|uvicorn") {
        Write-Host "Arrêt de l'instance existante sur le port $Port (PID $($process.Id)) ..."
        Stop-Process -Id $process.Id -Force
        Start-Sleep -Seconds 2
    }
    else {
        throw "Le port $Port est utilisé par un autre programme ($($process.ProcessName)). Libérez-le avant de continuer."
    }
}

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $taskPrincipal `
    -Settings $settings `
    -Description "SI PILOT - application web accessible en continu" `
    -Force | Out-Null

$ruleName = "SI PILOT (TCP $Port)"
$existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Remove-NetFirewallRule -DisplayName $ruleName
}
$profile = if ($AllowPublicNetwork) { "Any" } else { $FirewallProfile }
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Action Allow `
    -Profile $profile | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5

$healthUrl = "http://127.0.0.1:$Port/health"
$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $response = Invoke-WebRequest $healthUrl -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            break
        }
    }
    catch {
        Start-Sleep -Seconds 1
    }
}

Write-Host ""
if ($healthy) {
    Write-Host "SI PILOT est démarré en tâche de fond." -ForegroundColor Green
}
else {
    Write-Host "La tâche est installée, mais l'application ne répond pas encore." -ForegroundColor Yellow
    Write-Host "Consultez le journal : $Root\.runtime\server.log"
}
Write-Host "URL : $PublicUrl"
Write-Host "Tâche planifiée : $TaskName (démarrage automatique, redémarrage en cas d'échec)"
Write-Host "Pare-feu : TCP $Port ($profile)"
Write-Host ""
Write-Host "Pour utiliser HTTPS, placez un reverse proxy devant le port $Port,"
Write-Host "puis relancez ce script avec -PublicUrl https://votre-nom.interne -BindAddress 127.0.0.1"
