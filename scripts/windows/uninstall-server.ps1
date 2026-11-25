param(
    [string]$TaskName = "SI PILOT",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Ce script doit être lancé dans une console PowerShell administrateur."
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Tâche planifiée supprimée : $TaskName"
}
else {
    Write-Host "Tâche planifiée absente : $TaskName"
}

$ruleName = "SI PILOT (TCP $Port)"
if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $ruleName
    Write-Host "Règle de pare-feu supprimée : $ruleName"
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
    try {
        Stop-Process -Id $listener.OwningProcess -Force
        Write-Host "Processus arrêté : $($listener.OwningProcess)"
    }
    catch {
        Write-Warning "Impossible d'arrêter le processus $($listener.OwningProcess)."
    }
}

Write-Host "SI PILOT n'est plus configuré comme service de démarrage automatique."
