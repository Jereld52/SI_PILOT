param(
    [string]$OutputDir = "",
    [switch]$ApplyRetention,
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $OutputDir) { $OutputDir = Join-Path $Root ".runtime\backups" }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$PgBin = Join-Path $Root ".runtime\pgsql\bin"
$PgDump = Join-Path $PgBin "pg_dump.exe"
$PasswordFile = Join-Path $Root ".runtime\pg_password.txt"

if (-not (Test-Path $PgDump)) { throw "pg_dump introuvable." }
if (-not $env:PGPASSWORD) {
    if (Test-Path $PasswordFile) {
        $env:PGPASSWORD = (Get-Content $PasswordFile -Raw).Trim()
    }
    else {
        throw "PGPASSWORD non défini et fichier .runtime\pg_password.txt absent."
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dump = Join-Path $OutputDir "si_pnfor-$stamp.dump"

& $PgDump -h 127.0.0.1 -p 5433 -U pnfor -d si_pnfor -Fc -f $dump
if ($LASTEXITCODE -ne 0) { throw "Échec de pg_dump." }

$uploads = Join-Path $Root "backend\data\uploads"
if (Test-Path $uploads) {
    $archive = Join-Path $OutputDir "uploads-$stamp.zip"
    Compress-Archive -Path (Join-Path $uploads "*") -DestinationPath $archive -Force
    Get-FileHash $archive -Algorithm SHA256 | ForEach-Object { "$($_.Hash)  $(Split-Path $archive -Leaf)" } |
        Set-Content "$archive.sha256" -Encoding ascii
}

Get-FileHash $dump -Algorithm SHA256 | ForEach-Object { "$($_.Hash)  $(Split-Path $dump -Leaf)" } |
    Set-Content "$dump.sha256" -Encoding ascii

Write-Host "Sauvegarde créée : $dump"
Write-Host "Empreinte SHA-256 : $dump.sha256"

if ($ApplyRetention) {
    $limit = (Get-Date).AddDays(-$RetentionDays)
    Get-ChildItem $OutputDir -Filter "si_pnfor-*.dump" |
        Where-Object { $_.LastWriteTime -lt $limit } |
        ForEach-Object {
            Write-Host "Suppression de l'ancienne sauvegarde : $($_.Name)"
            Remove-Item $_.FullName -Force
            Remove-Item "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
        }
}
else {
    Write-Host "Rétention non appliquée. Utilisez -ApplyRetention pour supprimer les sauvegardes de plus de $RetentionDays jours."
}
