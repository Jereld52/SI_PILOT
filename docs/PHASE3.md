# Phase 3 — Référentiels, agents, parc et imports CSV

## Livré

### Référentiels administratifs

- Écran **Administration → Référentiels**.
- Services : code, nom, actif.
- Sites : code, nom, adresse, ville, bâtiment, étage, bureau, notes, actif.
- Catégories d'équipements : nom, préfixe, modèle de numérotation, mode de séquence,
  durée de vie, indicateurs poste/infrastructure/réseau, actif.
- Permissions : `referentials.read`, `referentials.manage`.

### Agents

- Écran **Agents** : recherche, filtres service/statut, pagination.
- Création et modification : identité, e-mail, téléphone, service, site, fonction, login,
  dates d'arrivée/départ, statut, notes.
- Archivage : passage au statut « parti » avec date du jour, sans suppression d'historique.
- Import CSV avec modèle téléchargeable.

### Parc informatique

- Écran **Parc informatique** : recherche, filtres catégorie/état/service, pagination.
- Création et modification complètes : nom, catégorie, marque, modèle, série, MAC, IP,
  machine, OS, dates, prix, état, condition, agent, service, site, criticité, commentaires.
- Affectation, retour au stock, changement d'état et historique des affectations.
- Archivage (réforme) sans suppression physique.
- Numéro d'inventaire généré automatiquement ou saisi manuellement.
- Aperçu du prochain numéro avant création.
- Import CSV avec modèle téléchargeable.

### Nommage personnalisable par catégorie

Chaque catégorie possède :

- `tag_prefix` : préfixe, par exemple `PC`, `PORT`, `IMP` ;
- `tag_template` : modèle, par exemple `PNFOR-{PREFIX}-{YEAR}-{SEQ:4}` ;
- `tag_sequence_mode` : `year` (remise à zéro annuelle) ou `global`.

Variables : `{PREFIX}`, `{CATEGORY}`, `{YEAR}`, `{SEQ}` ou `{SEQ:4}`.
Le modèle doit contenir `{SEQ...}` pour garantir l'unicité. Les numéros existants ne sont jamais
modifiés lorsqu'un modèle change.

Exemples par défaut :

| Catégorie | Préfixe | Numéro |
|---|---|---|
| PC fixe | PC | `PNFOR-PC-2026-0001` |
| PC portable | PORT | `PNFOR-PORT-2026-0001` |
| Imprimante | IMP | `PNFOR-IMP-2026-0001` |
| Serveur | SRV | `PNFOR-SRV-2026-0001` |

### Téléphonie mobile

- Nouvel écran **Téléphonie mobile** : 82 lignes importées depuis
  `modeles/lignes_mobiles.xlsx`.
- Tableau : numéro, titulaire, fonction, statut, forfait, terminal, fin d'engagement.
- Fiche détaillée : contrat, CF, dates, IMEI, format SIM, hors-forfait, ligne principale.
- Filtres statut, forfait, ligne principale/secondaire, recherche.
- Import XLSX/CSV.
- Tous les éléments du fichier sont repris : RIO, EID, N° CSIM, QR de carte SIM et codes
  PIN/PUK.
- Les **PIN et PUK sont chiffrés au repos** avec Fernet (`FIELD_ENCRYPTION_KEY`) et ne figurent
  jamais dans les réponses standard ni dans les journaux.
- Consultation et modification des codes via des endpoints dédiés, permissions
  `mobile_lines.secrets.read` / `mobile_lines.secrets.manage`, réponses `Cache-Control: no-store`
  et audit de chaque accès.
- Le fichier XLSX source n'est pas conservé dans les uploads de l'application après import.

### Import WAPT des postes

Le fichier `modeles/PC-PNfor.csv` (export WAPT) est reconnu automatiquement :

- détection des colonnes `Machine`, `Numéro de série`, `Système d'exploitation`, `DN dans l'AD` ;
- catégorie déduite des OU Active Directory (`Desktops`, `Laptops`, `Servers`) ;
- nom court de la machine, hostname FQDN, marque, modèle, série, MAC, IP ;
- statut WAPT `OK` → en service, `ERROR` → en panne ;
- UUID WAPT conservé comme identifiant externe pour éviter les doublons ;
- donnée source WAPT complète conservée dans `assets.external_data_json` ;
- **import appliqué : 69 postes créés**, 0 erreur, 0 doublon ;
- répartition obtenue : 2 PC fixes, 67 portables ; 58 en service, 10 en stock, 1 en panne.

### Imports CSV

- Modèles téléchargeables depuis l'interface.
- Séparateur `;` ou `,` détecté automatiquement.
- Encodage UTF-8 (BOM accepté), 2 000 lignes maximum, 5 Mo maximum.
- Prévisualisation obligatoire avant écriture.
- Détection des doublons : e-mail agent, login, numéro d'inventaire, série, MAC, IP, nom machine.
- Ligne d'exemple ignorée automatiquement.
- Aucune donnée existante écrasée.
- Rapport ligne par ligne : valide, doublon, erreur, ignorée.
- Application par lots avec savepoints ; une erreur n'annule pas les lignes déjà créées.
- Audit : `import_preview`, `import_applied`, et création des entités.

#### Colonnes du modèle Agents

```text
nom;prenom;email_pro;telephone;service_code;fonction;site_code;login;date_arrivee;date_depart;statut;notes
```

Codes de service et de site obligatoirement existants s'ils sont renseignés. Statuts acceptés :
`active`, `arriving`, `departed`, `suspended` (ou équivalents français).

#### Colonnes du modèle Équipements

```text
nom;numero_inventaire;categorie_code;marque;modele;numero_serie;mac;ip;nom_machine;os;version_os;
date_achat;date_mise_en_service;fin_garantie;prix;agent_email;service_code;site_code;etat;commentaires
```

- `numero_inventaire` vide → génération selon le modèle de la catégorie.
- `categorie_code` obligatoire et existant.
- `agent_email` facultatif ; s'il est renseigné, l'agent doit exister.
- Dates acceptées : `JJ/MM/AAAA`, `AAAA-MM-JJ`, `JJ-MM-AAAA`.
- Prix : `850.00` ou `850,00`.
- États acceptés : `in_service`, `in_stock`, `maintenance`, `broken`, `to_renew`, `retired`
  (ou équivalents français).

## API ajoutée

- `GET/POST/PATCH /services`, `/locations`, `/asset-categories`
- `GET/POST/PATCH/DELETE /agents`, `GET /agents/{id}/assets`
- `GET/POST/PATCH/DELETE /assets`, `GET /assets/next-tag`, `GET /assets/{id}/history`
- `POST /assets/{id}/assign`, `/return`, `/status`
- `GET /mobile-lines`, `GET /mobile-lines/meta`, `GET/PATCH /mobile-lines/{id}`
- `GET/PUT /mobile-lines/{id}/secrets` (PIN/PUK chiffrés, accès audité)
- `GET /imports/templates/{entity_type}`, `POST /imports/preview`,
  `POST /imports/{job_id}/apply`, `GET /imports`

## Vérifications

```text
pytest -q       29 passed
ruff check      All checks passed
mypy app        Success: no issues found in 77 source files
npm run build   TypeScript + Vite OK
```

Tests fonctionnels manuels : création service/site, modification du modèle PC,
création agent, création équipement avec numéro généré, historique d'affectation,
import agent, import équipement, détection de doublon, écrans Agents/Parc/Référentiels,
import WAPT des 69 postes, import XLSX des 82 lignes mobiles, révélation chiffrée
des PIN/PUK, écran Téléphonie mobile.

## Limites de cette tranche

- Import XLSX activé pour les lignes mobiles uniquement ; agents et équipements restent en CSV.
- Score de renouvellement non encore calculé dans l'interface.
- Pas encore de mise à jour de masse ni de fusion de doublons.
- Les comptes applicatifs ne sont pas encore reliés aux fiches agents.
- Les contrats, le budget, l'infrastructure, la cybersécurité, les projets, la documentation et le
  calendrier ont depuis été livrés ; voir le détail dans `PHASE3_MODULES.md`.

## Tranche suivante

Les éléments ci-dessous sont désormais livrés et documentés dans
[`PHASE3_MODULES.md`](PHASE3_MODULES.md) :

1. QR code et fiche équipement authentifiée.
2. Fournisseurs et licences.
3. Mouvements de stock.
4. Exports XLSX/PDF du parc et des lignes mobiles.
5. Demandes IT, interventions et RGPD/DPO.
