# Contrôle qualité des données

La page **Pilotage → Qualité des données** détecte les anomalies qui empêchent un suivi fiable
ou une automatisation correcte.

## Contrôles disponibles

- **Bons de commande sans engagement** : le numéro d'engagement est obligatoire.
- **Contrats sans date de fin** : les alertes d'échéance ne peuvent pas fonctionner.
- **Équipements sans site** : les équipements non archivés et non retirés.
- **Équipements en service sans affectation** : aucun agent n'est rattaché.
- **Adresses IP en doublon** : plusieurs équipements actifs partagent la même IP.
- **Adresses MAC en doublon** : plusieurs équipements actifs partagent la même MAC.
- **Imports en erreur** : l'analyse ou l'intégration a échoué.
- **Imports non finalisés** : document analysé depuis plus de 48 heures sans destination.
- **Documents sans version** : aucun fichier n'est rattaché au document.
- **Versions courantes manquantes** : des versions existent mais aucune n'est marquée comme courante.
- **Documents non mis à jour** : documents publiés sans mise à jour depuis plus de 12 mois.
- **Doublons de documents** : plusieurs documents portent le même titre.
- **Documents sans catégorie** : classification absente, recherche moins précise.

## Utilisation

Chaque ligne indique :

- le niveau de criticité ;
- la fiche concernée ;
- une action : compléter, affecter, vérifier, réessayer ou finaliser ;
- un lien direct vers l'écran de correction.

Les anomalies sont filtrées selon les permissions et les modules actifs.

## API

`GET /api/v1/data-quality/overview`

Permission : `dashboard.read`, puis filtrage interne par `suppliers.read`,
`contracts.read`, `assets.read` et `documents.read`.
