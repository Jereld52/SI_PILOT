# Réunions interparcs et rapports de réunion

## 1. Réunions interparcs et partenaires

Le module **Communication → Réunions** accepte deux nouveaux types :

- **Réunion interparcs** : échanges entre plusieurs parcs ou établissements publics.
- **Réunion avec des partenaires** : OFB, DREAL, collectivités, associations, prestataires…

Chaque réunion peut contenir :

- des **structures et partenaires invités** (une par ligne) : `OFB`, `Parc national des Écrins`,
  `DREAL`, etc. ;
- des **participants externes** (une personne par ligne), avec sa structure si possible :
  `Jean Dupont — OFB`.

Ces informations apparaissent dans la liste des réunions et dans le rapport généré. Les
participants internes restent sélectionnés parmi les comptes utilisateurs de SI PILOT.

## 2. Générer un rapport

Depuis **Communication → Réunions**, l'icône document dans la colonne Actions génère un
**rapport PDF** téléchargeable. Le rapport contient :

- le titre, la date, la durée, le type, le statut, le lieu et le lien visio ;
- l'organisateur ;
- les participants internes ;
- les structures invitées et les participants externes ;
- l'ordre du jour ;
- le compte rendu et les échanges ;
- les décisions et actions ;
- les points de suivi rattachés, avec statut, priorité, échéance et responsable.

Le rapport reprend l'identité visuelle de l'application : logo, nom de la structure, couleur
principale, en-tête et pagination.

Une version **Markdown** est également disponible pour être retravaillée dans un traitement de
texte :

```text
GET /api/v1/communication/meetings/{id}/report?format=md
GET /api/v1/communication/meetings/{id}/report?format=pdf
```

Les deux routes nécessitent la permission `meetings.read`.

## 3. Bonnes pratiques

- Renseignez l'ordre du jour avant la réunion, puis le compte rendu et les décisions après.
- Ajoutez les points de suivi avec un responsable et une échéance : ils alimentent le rapport.
- Pour une réunion interparcs, précisez les structures dans le champ dédié plutôt que dans le
  compte rendu : le rapport les met en évidence.
- Relisez le PDF avant diffusion : il peut contenir des données personnelles et des échanges
  internes.

## 4. Évolutions possibles

- Annuaire des partenaires avec contacts et sites web.
- Modèles de rapport par type de réunion.
- Envoi du rapport aux participants par e-mail.
- Export Word ou OpenDocument.
