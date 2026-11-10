# Sauvegarde et restauration

## 1. Objectifs proposés

| Élément | Valeur cible |
|---|---|
| RPO (perte de données maximale) | 24 h |
| RTO (temps de remise en service) | 4 h |
| Rétention quotidienne | 30 jours |
| Rétention mensuelle | 12 mois (à mettre en place) |
| Copie hors site | à définir avec l'établissement |
| Chiffrement | obligatoire pour la copie hors site |

## 2. Contenu sauvegardé

1. Base PostgreSQL `si_pnfor` : `pg_dump -Fc`.
2. Fichiers utilisateurs : `backend/data/uploads` (pièces jointes, documents).
3. Configuration : `backend/.env`, `infra/.env` (à stocker dans un coffre de secrets, pas dans
   la sauvegarde standard). **La clé `FIELD_ENCRYPTION_KEY` doit être sauvegardée séparément** :
   sans elle, les PIN/PUK des lignes mobiles sont irrécupérables.
4. Journal d'audit : inclus dans la base ; export séparé recommandé.

## 2 bis. Sauvegarde et restauration depuis l'interface

**Administration → Sauvegarde** (permission `admin.backup.manage`) permet de :

- télécharger la configuration en JSON (paramètres et secrets chiffrés) ;
- télécharger un dump PostgreSQL au format custom ;
- télécharger une archive ZIP complète : `database.dump`, `config.json`, `manifest.json` et
  répertoire `uploads/` ;
- importer une configuration JSON sans toucher aux données métier ;
- restaurer une base depuis un `.dump`, `.sql` ou une archive ZIP, après saisie de `RESTAURER`.

La restauration crée automatiquement une sauvegarde de sécurité dans `.runtime/backups` avant
l'opération. Les fichiers produits restent dans ce dossier et sont listés dans la page.

> La clé `FIELD_ENCRYPTION_KEY` n'est jamais incluse dans les exports. Conservez-la séparément.

## 3. Sauvegarde Windows

```powershell
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\backup.ps1
```

Résultat dans `.runtime\backups` :

- `si_pnfor-YYYYMMDD-HHMMSS.dump` (format custom PostgreSQL) ;
- `si_pnfor-...dump.sha256` ;
- `uploads-YYYYMMDD-HHMMSS.zip` et son empreinte.

Appliquer la rétention :

```powershell
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\backup.ps1 -ApplyRetention
```

Planification : tâche quotidienne à 22 h, puis copie du dossier vers un NAS ou un stockage
hors site chiffré.

## 4. Sauvegarde Docker

```powershell
docker compose -f infra/compose.prod.yml exec -T db pg_dump -U pnfor -d si_pnfor -Fc > si_pnfor.dump
docker run --rm -v si-pnfor-pilote_uploads:/data -v ${PWD}:/backup alpine tar czf /backup/uploads.tgz -C /data .
```

## 5. Restauration Windows

> Opération destructive : elle écrase la base courante.

```powershell
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\restore.ps1 `
  -DumpFile C:\SI_PILOT\.runtime\backups\si_pnfor-20261107-220000.dump `
  -Force
```

Le script crée d'abord une sauvegarde de sécurité dans
`.runtime\backups\before-restore`, puis exécute `pg_restore --clean --if-exists --no-owner`.

Après restauration :

1. vérifier `/api/v1/health/ready` ;
2. se connecter et contrôler le tableau de bord ;
3. consulter le journal d'audit ;
4. vérifier quelques pièces jointes ;
5. documenter l'opération.

## 6. Test de restauration trimestriel

1. Choisir une sauvegarde récente.
2. Restaurer sur une base de recette (`si_pnfor_restore_test`), jamais directement en production.
3. Vérifier le nombre de tables, les utilisateurs, les tickets, les contrats.
4. Mesurer la durée et comparer au RTO.
5. Consigner le résultat.

## 7. Bonnes pratiques

- Ne jamais stocker les sauvegardes sur le même disque que la base.
- Chiffrer les copies hors site.
- Vérifier les empreintes SHA-256.
- Tester la restauration, pas seulement la sauvegarde.
- Conserver une sauvegarde avant toute migration Alembic.
- Protéger l'accès au dossier de sauvegarde (droits NTFS).
