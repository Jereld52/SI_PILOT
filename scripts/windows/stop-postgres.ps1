$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PgCtl = Join-Path $Root ".runtime\pgsql\bin\pg_ctl.exe"
$PgData = Join-Path $Root ".runtime\pgdata"

if (-not (Test-Path $PgCtl)) {
    throw "PostgreSQL portable introuvable."
}

& $PgCtl -D $PgData status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "PostgreSQL n'est pas démarré."
    exit 0
}

& $PgCtl -D $PgData stop -m fast
if ($LASTEXITCODE -ne 0) {
    throw "Échec de l'arrêt de PostgreSQL."
}
Write-Host "PostgreSQL arrêté."
