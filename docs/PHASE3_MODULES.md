# Phase 3 — Parc enrichi, QR, exports, achats, support et RGPD

Cette tranche complète les modules métier livrés après le socle et l'inventaire initial.

## Tickets simplifiés, exports et statistiques

- Création de ticket recentrée sur l'objet, la description, la catégorie, la priorité et le
  demandeur ; les options d'assignation, d'origine et d'équipement sont repliées.
- Actions rapides dans la fiche : prendre en charge, marquer résolu, clore.
- Historique complet conservé : statut, priorité, assignation, catégorie, commentaires et temps.
- Export des tickets en XLSX ou PDF avec granularité **jour, semaine, mois ou année** :
  synthèse par période, tickets créés/résolus/clos, temps passé, délai moyen, respect du SLA,
  répartitions par statut, priorité, catégorie, assigné et service, puis détail des tickets.
- Page **Statistiques consolidée** avec dates de début/fin et granularité :
  indicateurs clés, activité des tickets, interventions et incidents de sécurité, répartitions
  parc/contrats/projets/téléphonie/documents, et budget par catégorie.
- Export complet des statistiques en XLSX multi-feuilles ou PDF.
- Nouvelle permission `statistics.read` pour les rôles administrateur, responsable informatique,
  technicien et lecteur.

## Stock IT

- Module dédié aux accessoires et consommables : claviers, souris, écrans, casques, stations
  d'accueil, webcams, câbles, adaptateurs, toners, papier, batteries et divers.
- Fiche article : référence interne automatique `STK-AAAA-NNNN`, catégorie, marque, modèle,
  fournisseur, emplacement, unité, quantité, seuil d'alerte, prix unitaire et notes.
- Quantité mise à jour uniquement par mouvements :
  - entrée en stock ;
  - sortie avec bénéficiaire facultatif ;
  - ajustement d'inventaire avec quantité constatée.
- Refus automatique d'une sortie supérieure au stock disponible.
- Alertes visuelles sous le seuil et articles épuisés.
- Vue d'ensemble : nombre d'articles, unités, valeur estimée, alertes et articles à réapprovisionner.
- Historique complet des mouvements avec quantité après mouvement, motif, référence et opérateur.
- Archivage sans suppression de l'historique.
- Le module est également remonté dans le cockpit du tableau de bord.

## Module d'import, Active Directory et RDM

- **Administration → Import / Export** regroupe les imports et les exports de pilotage.
- Imports fichiers : agents, équipements, lignes mobiles, fournisseurs, licences et infrastructure,
  avec prévisualisation, détection des doublons, rapport d'erreurs, application auditée, modèles
  téléchargeables et historique.
- Exports disponibles : parc informatique, lignes mobiles, infrastructure, tickets par période
  (jour/semaine/mois/année) et statistiques consolidées, en XLSX ou PDF.
- **Administration → Sources de données** regroupe les connexions d'enrichissement.
- **LDAP/LDAPS** : URL, base de recherche, compte de service, filtre utilisateurs et vérification TLS.
  Le mot de passe du compte de service est chiffré avec `FIELD_ENCRYPTION_KEY` et n'est jamais
  renvoyé par l'API.
- Test de connexion, prévisualisation des utilisateurs, création et mise à jour des agents par
  correspondance e-mail ou identifiant. Le filtre par défaut exclut les comptes désactivés.
- **Remote Desktop Manager** : import CSV des serveurs, VM et équipements réseau (nom, hôte, IP,
  MAC, OS, groupe, description). Les identifiants, mots de passe et secrets RDM sont explicitement
  exclus et le fichier brut n'est pas conservé.
- Rattachement automatique aux équipements du parc par numéro d'inventaire ou nom machine.

## Cockpit d'accueil et identité visuelle

- Refonte du thème avec une présence renforcée du bordeaux officiel `#772B2F` : dégradés,
  bordures, cartes, boutons, navigation active et barre supérieure.
- Héro de bienvenue avec date, accès rapides et quatre indicateurs de vigilance.
- État des 10 modules avec compteurs réels, alertes secondaires et liens directs.
- Chiffres clés mis en avant, indicateurs complémentaires et graphiques hiérarchisés.
- Blocs échéances à 90 jours, alertes prioritaires et activité récente.
- Tri client au clic sur les en-têtes de tous les tableaux de données, avec détection des nombres,
  dates, montants, pourcentages et indicateur visuel du sens de tri.
- Nouvel endpoint `GET /api/v1/dashboard/cockpit` alimenté par les données réelles.

## Parc informatique enrichi

- Les données source WAPT sont conservées dans `assets.external_data_json`.
- La fiche équipement expose : statut WAPT, joignabilité, dernière connexion, dernier utilisateur,
  domaine, groupes et l'ensemble des colonnes source.
- La liste du parc affiche le système, l'adresse IP, l'état WAPT, le dernier utilisateur et la
  dernière connexion.
- Chaque équipement possède un `qr_token` opaque. Le QR ouvre `/parc?qr=<token>` après
  authentification ; aucun accès anonyme n'est possible.
- Le QR peut être régénéré : l'ancien lien ne pointe alors plus vers la fiche.

## Exports détaillés

- `GET /api/v1/exports/assets?format=xlsx|pdf`
  - XLSX : feuille **Parc détaillé** avec toutes les colonnes de la fiche (identité, matériel,
    réseau, système, affectation, achat, garantie, état, WAPT dynamique et champs externes),
    feuille **Affectations** avec l'historique agent/service/site et feuille **Synthèse**.
  - PDF : synthèse lisible des équipements.
- `GET /api/v1/exports/mobile-lines?format=xlsx|pdf`
  - XLSX : feuille **Lignes mobiles détaillées** avec tous les champs non secrets (titulaire,
    contrat, dates, terminal, IMEI, forfait, options, identifiants) et un indicateur de présence
    des codes PIN/PUK, plus une feuille **Synthèse**.
  - PDF : synthèse des lignes.
- `GET /api/v1/exports/infrastructure?format=xlsx|pdf`
  - XLSX : feuilles **Équipements**, **Dépendances**, **Supervision** et **Synthèse**.
  - PDF : synthèse des équipements d'infrastructure.
- Les exports sont audités (nombre de lignes et format).
- Les secrets mobiles (PIN/PUK) ne sont jamais inclus dans les exports.

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

## Projets informatiques

- Portefeuille de projets avec code, objectifs, responsable, dates, budget prévu, priorité et statut.
- Jalons pondérés avec échéance et statut.
- Tâches avec jalon, priorité, assignation, échéance et statut ; l'avancement du projet est
  recalculé automatiquement à partir des tâches terminées.
- Registre des risques : probabilité, impact, score calculé et mitigation.
- Registre des décisions : date, décideur et description.
- Annulation sans suppression des données.

## Documentation

- Référentiel documentaire : titre, type, catégorie, description, visibilité, statut et tags.
- Versions successives avec numéro, auteur, taille, empreinte SHA-256 et changelog.
- Téléversement et téléchargement de fichiers protégés par permissions.
- Archivage sans suppression des fichiers.
- Les fichiers sont stockés localement sous `data/uploads/documents`.

## Calendrier et actions

- Vue mensuelle des événements avec navigation mois précédent/suivant.
- Types : maintenance, intervention, échéance, renouvellement, audit, projet, réunion, action.
- Événements avec lieu, responsable, priorité, statut et description.
- Actions à réaliser avec module, priorité, échéance, responsable et statut.
- Vue d'ensemble : événements à venir, actions ouvertes et actions en retard.

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
- `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`
- `POST /projects/{id}/milestones|tasks|risks|decisions`,
  `PATCH/DELETE /projects/milestones|tasks|risks|decisions/{id}`
- `GET/POST /documents`, `GET/PATCH/DELETE /documents/{id}`, `GET /documents/meta`
- `GET/POST /documents/{id}/versions`, `GET /documents/versions/{id}/download`
- `GET /dashboard/cockpit`
- `GET /stock/overview`, `GET/POST /stock/items`, `GET/PATCH/DELETE /stock/items/{id}`,
  `GET/POST /stock/items/{id}/movements`
- `GET /statistics/overview?start=&end=&granularity=day|week|month|year`
- `GET /exports/assets?format=xlsx|pdf`
- `GET /exports/mobile-lines?format=xlsx|pdf`
- `GET /exports/infrastructure?format=xlsx|pdf`
- `GET /exports/tickets?format=xlsx|pdf&start=&end=&granularity=...`
- `GET /exports/statistics?format=xlsx|pdf&start=&end=&granularity=...`
- `GET/PUT /ldap/config`, `POST /ldap/test`, `POST /ldap/preview`, `POST /ldap/sync`
- `GET /imports`, `GET /imports/templates/{type}`, `POST /imports/preview`,
  `POST /imports/{id}/apply`
- `GET /calendar/overview`, `GET/POST /calendar/events`, `GET/PATCH/DELETE /calendar/events/{id}`
- `GET/POST /calendar/actions`, `GET/PATCH/DELETE /calendar/actions/{id}`

## Vérifications

```text
pytest -q       50 passed
ruff check      All checks passed
mypy app        Success: no issues found in 134 source files
npm run build   TypeScript + Vite OK
```

Les tests couvrent les fournisseurs, licences, stock, contrats, budget, le cycle de vie complet
d'une demande, les interventions et les principaux objets RGPD.

## Limites connues

- Les exports couvrent le parc, les lignes mobiles, l'infrastructure, les tickets et les
  statistiques ; les exports RGPD restent à ajouter.
- Les pièces jointes des tickets et des contrats ne sont pas encore exposées.
- Le registre RGPD ne gère pas encore les modèles de registre par service.
- Le budget ne gère pas encore les marchés publics ni les subventions.
- La supervision prépare les contrôles mais n'exécute aucune sonde réseau active.
- La cartographie est une liste de dépendances, sans rendu graphique interactif.
- La documentation ne gère pas encore l'indexation plein texte ni les ACL par rôle/utilisateur
  au-delà des permissions globales.
- Le calendrier n'agrège pas encore automatiquement les échéances des autres modules.
- SylvIA reste facultative et n'est pas encore activée.
