# Phase 3 — Parc enrichi, QR, exports, achats, support et RGPD

Cette tranche complète les modules métier livrés après le socle et l'inventaire initial.

## Parc informatique enrichi

- Les données source WAPT sont conservées dans `assets.external_data_json`.
- La fiche équipement expose : statut WAPT, joignabilité, dernière connexion, dernier utilisateur,
  domaine, groupes et l'ensemble des colonnes source.
- La liste du parc affiche le système, l'adresse IP, l'état WAPT, le dernier utilisateur et la
  dernière connexion.
- Chaque équipement possède un `qr_token` opaque. Le QR ouvre `/parc?qr=<token>` après
  authentification ; aucun accès anonyme n'est possible.
- Le QR peut être régénéré : l'ancien lien ne pointe alors plus vers la fiche.

## Exports

- `GET /api/v1/exports/assets?format=xlsx|pdf`
- `GET /api/v1/exports/mobile-lines?format=xlsx|pdf`
- Les exports sont audités (nombre de lignes et format).
- Les secrets mobiles (PIN/PUK) ne sont jamais inclus.

## Fournisseurs, licences et stock

- Fournisseurs : coordonnées, SIRET, contact principal, contacts secondaires, actif/inactif,
  nombre d'équipements et de licences rattachés.
- Licences : éditeur, type, sièges, sièges utilisés, dates, coût annuel, notes, actif/inactif.
- Contrôle : les sièges utilisés ne peuvent pas dépasser les sièges disponibles.
- Stock : mouvements d'entrée, de sortie et d'ajustement, liés à un équipement ou à une catégorie.
  Une entrée replace l'équipement en stock ; une sortie le passe en service.
- Synthèse du stock par catégorie : en stock, en service, maintenance, en panne.

## Demandes IT et interventions

- Références automatiques `DEM-AAAA-NNNN` et `INT-AAAA-NNNN`.
- Cycle de vie : nouveau, à qualifier, en cours, en attente, résolu, clos.
- Priorités avec délais de réponse et de résolution ; échéance calculée automatiquement.
- Assignation à un utilisateur, commentaires publics ou internes, temps passé.
- Historique des changements (statut, priorité, assignation, catégorie, équipements).
- Liaison à un ou plusieurs équipements.
- Interventions : type, statut, planification, technicien, prestataire, coût, durée,
  compte rendu et rattachement à une demande ou à un équipement.

## RGPD et rôle DPO

- Nouveau rôle système `dpo` (Délégué à la protection des données) avec accès au registre,
  aux demandes, aux droits, aux violations, à l'audit et aux documents, sans accès d'exploitation.
- Registre des traitements : finalité, base légale, catégories de données, personnes concernées,
  destinataires, sous-traitants, conservation, mesures de sécurité, revues.
- Registre des collectes : formulaire, enquête, liste de contacts, inscription, événement, ad hoc.
- Demandes DPO : demandeur, objet, réponse, recommandations, échéance.
- Droits des personnes : accès, rectification, effacement, opposition, portabilité, limitation.
  Échéance par défaut à 30 jours.
- Violations de données : gravité, personnes affectées, containment, notification CNIL et
  information des personnes.
- Vue d'ensemble : indicateurs et échéances à 30 jours.

## API ajoutée

- `GET/PATCH /assets/{id}`, `GET /assets/by-qr/{token}`, `GET /assets/{id}/qr`,
  `POST /assets/{id}/qr/regenerate`
- `GET /suppliers`, `GET/POST/PATCH /suppliers/{id}`
- `GET/POST/PATCH /licenses`, `/licenses/{id}`
- `GET/POST /stock/movements`, `GET /stock/summary`
- `GET/POST /tickets`, `GET /tickets/meta`, `GET /tickets/assignees`, `GET/PATCH /tickets/{id}`,
  `POST /tickets/{id}/assign|transition|comments|time-entries`
- `GET/POST /interventions`, `GET/PATCH /interventions/{id}`
- `GET /rgpd/overview`
- `GET/POST /rgpd/processing-activities`, `PATCH/DELETE /rgpd/processing-activities/{id}`
- `GET/POST /rgpd/collections`, `PATCH/DELETE /rgpd/collections/{id}`
- `GET/POST /rgpd/requests`, `PATCH /rgpd/requests/{id}`
- `GET/POST /rgpd/rights-requests`, `PATCH /rgpd/rights-requests/{id}`
- `GET/POST /rgpd/breaches`, `PATCH /rgpd/breaches/{id}`

## Vérifications

```text
pytest -q       34 passed
ruff check      All checks passed
mypy app        Success: no issues found in 100 source files
npm run build   TypeScript + Vite OK
```

Les tests couvrent les fournisseurs, licences, stock, le cycle de vie complet d'une demande,
les interventions et les principaux objets RGPD.

## Limites connues

- Les exports portent sur le parc et les lignes mobiles ; les exports tickets/RGPD restent à ajouter.
- Les pièces jointes des tickets ne sont pas encore exposées.
- Le registre RGPD ne gère pas encore les modèles de registre par service.
- Les contrats, le budget, l'infrastructure, la cybersécurité, les projets, la documentation et le
  calendrier restent à livrer.
