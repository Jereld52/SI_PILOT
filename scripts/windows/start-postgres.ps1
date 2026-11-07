param(
    [int]$Port = 5433
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PgBin = Join-Path $Root ".runtime\pgsql\bin"
$PgData = Join-Path $Root ".runtime\pgdata"
$PgLog = Join-Path $Root ".runtime\postgres.log"
$PgCtl = Join-Path $PgBin "pg_ctl.exe"

if (-not (Test-Path $PgCtl)) {
    throw "PostgreSQL portable introuvable. Exécutez scripts\windows\setup-windows.ps1."
}
if (-not (Test-Path $PgData)) {
    throw "Cluster PostgreSQL introuvable. Exécutez scripts\windows\setup-windows.ps1."
}

& $PgCtl -D $PgData status *> $null
if ($LASTEXITCODE -eq 0) {
    Write-Host "PostgreSQL est déjà démarré sur le port $Port."
    exit 0
}

& $PgCtl -D $PgData -l $PgLog -o "-p $Port -c listen_addresses=127.0.0.1" start
if ($LASTEXITCODE -ne 0) {
    throw "Échec du démarrage de PostgreSQL. Consultez $PgLog."
}
Write-Host "PostgreSQL démarré sur 127.0.0.1:$Port."
