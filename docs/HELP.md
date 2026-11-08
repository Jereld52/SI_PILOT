# Centre d'aide intégré

Le centre d'aide est accessible depuis le menu **Aide** ou l'icône d'aide de la barre supérieure.
Il fonctionne hors ligne : le contenu est embarqué dans le frontend, sans appel réseau.

## Emplacement

- Contenu : `frontend/src/features/help/content.ts`
- Page : `frontend/src/features/help/HelpPage.tsx`
- Routes : `/aide` et `/aide/:slug`

## Structure d'un article

```ts
{
  slug: "reservation-materiel",
  title: "Réservations de matériel",
  summary: "Réserver un créneau et gérer les sorties/retours.",
  category: "support",
  tags: ["réservation", "matériel", "ICS"],
  blocks: [
    p("Texte de présentation."),
    steps(["Première étape", "Deuxième étape"]),
    list(["Point important", "Autre point"]),
    note("warning", "Message d'avertissement."),
    table(["Colonne 1", "Colonne 2"], [["Valeur 1", "Valeur 2"]]),
    code("commande --exemple"),
  ],
}
```

Types de blocs disponibles : `paragraph`, `list`, `steps`, `note`, `table`, `code`.

## Catégories

Les catégories sont définies dans `HELP_CATEGORIES` :

- `demarrage` : prise en main ;
- `parc` : parc, agents et téléphonie ;
- `support` : demandes, interventions, réservations, stock ;
- `gestion` : fournisseurs, contrats, budget, projets, documentation, calendrier ;
- `infrastructure` : réseau, supervision, sécurité ;
- `conformite` : RGPD et audit ;
- `administration` : comptes, identité, e-mails, WAPT, LDAP, système ;
- `exploitation` : installation, sauvegarde, mise à jour ;
- `faq` : dépannage et bonnes pratiques.

## Ajouter un article

1. Ajouter un objet dans `HELP_ARTICLES`.
2. Choisir un `slug` unique, en minuscules et avec des tirets.
3. Renseigner `category`, `tags`, `summary` et les blocs.
4. Vérifier la recherche et l'affichage sur `/aide`.
5. Mettre à jour ce document si une nouvelle catégorie est créée.

## Diagnostic

La page **Administration → Système** complète l'aide avec des données réelles :
base de données, migrations, stockage, SMTP, WAPT, LDAP, sauvegardes, sécurité et volumétrie.
Le rapport peut être téléchargé en JSON.

## Bonnes pratiques de rédaction

- Écrire pour un utilisateur non technique.
- Indiquer les permissions nécessaires lorsqu'elles conditionnent l'accès.
- Ne jamais inclure de secret, mot de passe, PIN/PUK ou clé.
- Distinguer les actions irréversibles et les simples archivages.
- Préférer des étapes courtes et vérifiables.
