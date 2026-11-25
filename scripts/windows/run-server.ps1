param(
    [string]$BindAddress = "0.0.0.0",
    [int]$Port = 8000,
    [string]$PublicUrl = ""
)

$ErrorActionPreference = "Continue"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$LogDir = Join-Path $Root ".runtime"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir "server.log"

if (Test-Path $Log) {
    $size = (Get-Item $Log).Length
    if ($size -gt 10MB) {
        Move-Item -Force $Log "$Log.1"
    }
}

Set-Location $Root
& (Join-Path $PSScriptRoot "start-app.ps1") -SkipBuild -BindAddress $BindAddress -Port $Port -PublicUrl $PublicUrl *>> $Log
