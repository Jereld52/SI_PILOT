param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Tessdata = Join-Path $Root "backend\tessdata"
$Tesseract = "C:\Program Files\Tesseract-OCR\tesseract.exe"

if (-not (Test-Path $Tesseract)) {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "winget introuvable. Installez Tesseract-OCR manuellement depuis https://github.com/UB-Mannheim/tesseract/wiki"
    }
    Write-Host "Installation de Tesseract OCR..."
    winget install --id UB-Mannheim.TesseractOCR --accept-package-agreements --accept-source-agreements --silent
}

if (-not (Test-Path $Tesseract)) {
    throw "Tesseract reste introuvable après installation. Vérifiez C:\Program Files\Tesseract-OCR."
}

New-Item -ItemType Directory -Force -Path $Tessdata | Out-Null

$engSource = "C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata"
$engTarget = Join-Path $Tessdata "eng.traineddata"
if ((Test-Path $engSource) -and ($Force -or -not (Test-Path $engTarget))) {
    Copy-Item $engSource $engTarget -Force
}

$fraTarget = Join-Path $Tessdata "fra.traineddata"
if ($Force -or -not (Test-Path $fraTarget)) {
    Write-Host "Téléchargement de la langue française..."
    Invoke-WebRequest `
        -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/fra.traineddata" `
        -OutFile $fraTarget `
        -UseBasicParsing `
        -TimeoutSec 180
}

$previous = $env:TESSDATA_PREFIX
$env:TESSDATA_PREFIX = $Tessdata
try {
    & $Tesseract --list-langs
}
finally {
    $env:TESSDATA_PREFIX = $previous
}

Write-Host ""
Write-Host "OCR prêt."
Write-Host "Tesseract : $Tesseract"
Write-Host "Langues   : $Tessdata"
Write-Host "Redémarrez SI PILOT puis vérifiez Administration → Paramètres → OCR."
