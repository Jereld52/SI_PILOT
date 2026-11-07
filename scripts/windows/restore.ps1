param(
    [Parameter(Mandatory = $true)]
    [string]$DumpFile,
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PgBin = Join-Path $Root ".runtime\pgsql\bin"
$PgRestore = Join-Path $PgBin "pg_restore.exe"
$PasswordFile = Join-Path $Root ".runtime\pg_password.txt"

if (-not (Test-Path $DumpFile)) { throw "Fichier de sauvegarde introuvable : $DumpFile" }
if (-not $Force) {
    Write-Warning "Cette opération écrase la base si_pnfor. Relancez avec -Force après avoir vérifié le fichier."
    exit 1
}
if (-not $env:PGPASSWORD) {
    if (Test-Path $PasswordFile) {
        $env:PGPASSWORD = (Get-Content $PasswordFile -Raw).Trim()
    }
    else {
        throw "PGPASSWORD non défini."
    }
}

Write-Host "Sauvegarde de sécurité avant restauration..."
& (Join-Path $PSScriptRoot "backup.ps1") -OutputDir (Join-Path $Root ".runtime\backups\before-restore")

Write-Host "Restauration de $DumpFile ..."
& $PgRestore -h 127.0.0.1 -p 5433 -U pnfor -d si_pnfor --clean --if-exists --no-owner $DumpFile
if ($LASTEXITCODE -ne 0) { throw "Échec de pg_restore." }

Write-Host "Restauration terminée. Vérifiez l'application et le journal d'audit."
