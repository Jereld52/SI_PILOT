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

## Contrats et prestataires

- Contrats rattachés à un fournisseur : référence, objet, catégorie, dates, durée, montants HT/TTC,
  TVA, coût annuel et mensuel.
- Préavis en jours, reconduction tacite et responsable interne.
- Calcul de l'échéance, de la date limite de résiliation et du niveau d'alerte
  (critique ≤ 30 j, avertissement ≤ 90 j, vigilance ≤ 180 j).
- Filtre « échéance 90 jours » et lien direct depuis les alertes du tableau de bord.
- Résiliation sans suppression : le contrat passe au statut « résilié ».

## Budget informatique

- Un exercice budgétaire par année, avec statuts brouillon, voté et clôturé.
- Lignes budgétaires par catégorie, avec montants prévus et votés.
- Engagements : devis, commandes, livraisons et facturation, avec fournisseur et date.
- Factures : numéro, dates, montants, TVA, statut et paiement.
- Calcul automatique du budget engagé, facturé, payé et du disponible réel.
- Contrôle de cohérence : une ligne utilisée par des engagements ou factures ne peut pas être
  supprimée ; un budget clôturé n'est plus modifiable.
- Validation d'un budget en brouillon, avec traçabilité du valideur et de la date.

## Infrastructure et réseau

- Inventaire des serveurs, VM, switches, routeurs, pare-feu, NAS, points d'accès et onduleurs.
- Rattachement facultatif à un équipement du parc, à un site et à un responsable.
- Adresse IP, MAC, système, rôle, criticité, statut et configuration.
- Dépendances entre équipements (réseau, alimentation, stockage, authentification, applicatif)
  pour l'analyse d'impact.
- Supervision : contrôles ping, SNMP, HTTP, TCP ou agent. Aucune sonde n'est lancée par
  l'application ; un contrôle doit être explicitement autorisé avant activation.
- Historique des résultats de supervision et dernière vérification par équipement.

## Cybersécurité

- Incidents : référence `INC-AAAA-NNNN`, gravité, catégorie, détection, responsable, mesures,
  retour d'expérience et clôture sans suppression.
- Actions correctives ou préventives : priorité, échéance, responsable, preuve et rattachement
  à un incident ou à un équipement.
- Vulnérabilités : CVE, score CVSS, gravité, équipement, source, remédiation et échéance.
- Sauvegardes : exécution, résultat, taille, durée et test de restauration.
- Certificats : validité, émetteur, responsable, renouvellement automatique et alerte à 30/90/180 jours.
- Audits : audit interne, externe, test d'intrusion ou conformité, avec constats.
- Vue d'ensemble : incidents ouverts, actions en retard, vulnérabilités critiques, certificats à
  échéance et dernière sauvegarde.

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
- `GET /contracts`, `GET /contracts/meta`, `GET/POST/PATCH /contracts/{id}`,
  `DELETE /contracts/{id}` (résiliation)
- `GET /budget-categories`, `GET/POST /budgets`, `GET/PATCH /budgets/{id}`,
  `POST /budgets/{id}/validate`
- `POST /budgets/{id}/lines`, `PATCH/DELETE /budget-lines/{id}`
- `POST /budgets/{id}/commitments`, `PATCH/DELETE /budget-commitments/{id}`
- `POST /budgets/{id}/invoices`, `PATCH/DELETE /budget-invoices/{id}`
- `GET/POST /infrastructure/equipments`, `GET/PATCH/DELETE /infrastructure/equipments/{id}`
- `GET/POST /infrastructure/dependencies`, `DELETE /infrastructure/dependencies/{id}`
- `GET/POST /infrastructure/checks`, `PATCH/DELETE /infrastructure/checks/{id}`,
  `POST /infrastructure/checks/{id}/authorize`, `GET/POST /infrastructure/checks/{id}/results`
- `GET /security/overview`, `GET/POST /security/incidents`, `GET/PATCH/DELETE /security/incidents/{id}`
- `GET/POST /security/actions`, `GET/PATCH/DELETE /security/actions/{id}`
- `GET/POST /security/vulnerabilities`, `PATCH/DELETE /security/vulnerabilities/{id}`
- `GET/POST /security/backups`, `PATCH/DELETE /security/backups/{id}`
- `GET/POST /security/certificates`, `PATCH/DELETE /security/certificates/{id}`
- `GET/POST /security/audits`, `PATCH/DELETE /security/audits/{id}`

## Vérifications

```text
pytest -q       39 passed
ruff check      All checks passed
mypy app        Success: no issues found in 112 source files
npm run build   TypeScript + Vite OK
```

Les tests couvrent les fournisseurs, licences, stock, contrats, budget, le cycle de vie complet
d'une demande, les interventions et les principaux objets RGPD.

## Limites connues

- Les exports portent sur le parc et les lignes mobiles ; les exports tickets/RGPD restent à ajouter.
- Les pièces jointes des tickets et des contrats ne sont pas encore exposées.
- Le registre RGPD ne gère pas encore les modèles de registre par service.
- Le budget ne gère pas encore les marchés publics ni les subventions.
- La supervision prépare les contrôles mais n'exécute aucune sonde réseau active.
- La cartographie est une liste de dépendances, sans rendu graphique interactif.
- Les projets, la documentation, le calendrier et SylvIA restent à livrer.
