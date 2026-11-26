# OCR des documents

SI PILOT utilise **Tesseract OCR** en local pour lire :

- les PDF scannés sans texte ;
- les images (PNG, JPG, TIFF, BMP, WebP) ;
- les PDF contenant du texte insuffisant.

L'OCR ne remplace pas l'analyse IA : il produit le texte, puis l'assistant IA extrait les
métadonnées (type, fournisseur, dates, montants, référence, engagement).

## Installation Windows

Un script est fourni :

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-ocr.ps1
```

Il installe Tesseract si nécessaire et prépare les langues française et anglaise dans
`backend\tessdata`.

## Installation manuelle

1. Installer Tesseract OCR (UB-Mannheim) :
   `winget install UB-Mannheim.TesseractOCR`
2. Vérifier le chemin :
   `C:\Program Files\Tesseract-OCR\tesseract.exe`
3. Placer les fichiers de langue dans `backend\tessdata` :
   - `eng.traineddata`
   - `fra.traineddata`
4. Redémarrer SI PILOT.

## Configuration

**Administration → Paramètres → OCR**

- activer ou désactiver l'OCR ;
- indiquer le chemin de `tesseract.exe` si la détection automatique échoue ;
- choisir les langues (`fra+eng`, `fra`, `eng`) ;
- limiter le nombre de pages analysées ;
- régler la résolution de rendu (DPI) ;
- indiquer le dossier `tessdata` si nécessaire.

Les valeurs vides utilisent la détection automatique.

## Limites

- L'OCR est volontairement limité aux premières pages configurées.
- La qualité dépend de la résolution du scan.
- Les tableaux complexes, tampons manuscrits et documents très dégradés peuvent mal être lus.
- Les montants, dates et références doivent toujours être vérifiés avant validation.

## Historique

L'import intelligent conserve un historique des documents analysés :

- fichier, type, fournisseur, référence, montant ;
- statut : analysé, intégré ou erreur ;
- destination créée ;
- utilisation de l'OCR ;
- date et message d'erreur éventuel.

L'historique est consultable directement en bas de la page **Assistant IA → Import intelligent**.
