# Charte graphique et personnalisation

## Identité configurable

L'identité de l'application est définie en base et se règle depuis
**Administration → Paramètres → Identité de l'application** :

- nom de l'application (`app.name`, par défaut `SI PILOT`) ;
- nom de la structure (`app.organization`) ;
- accroche et description de l'écran de connexion ;
- adresse de contact ;
- logo personnalisé (`app.logo_filename`) ;
- couleur principale (`app.primary_color`).

Le logo est téléversé au format PNG, JPEG ou WEBP (4 Mo maximum), puis réencodé en PNG et
stocké dans le répertoire de stockage local. Il est utilisé dans la sidebar, l'écran de
connexion, le favicon, les e-mails et l'en-tête des exports PDF. Sans logo personnalisé,
l'application utilise le lockup officiel fourni avec l'installation.

La couleur principale est appliquée aux variables CSS de l'interface et à l'en-tête des PDF.
Les nuances `primary-deep`, `primary-bright` et `primary-strong` sont calculées automatiquement
pour conserver un contraste lisible.

## Logo

- Lockup officiel : `assets/logoweb.png` (République française + Parc national de forêts),
  utilisé sur l'écran de connexion.
- Emblème officiel : `assets/pnf-logo.jpg` et `assets/favicon.png`.
- Emblème de la sidebar : `frontend/public/favicon.png`.
- Favicon : `frontend/public/favicon.png`.
- Icône du raccourci Windows : `assets/si-pnfor-officiel.ico`.
- Version large complémentaire : `assets/logo.png`.

Le lockup officiel est présenté sur fond blanc/crème pour rester lisible sur le thème sombre.
L'emblème bordeaux est utilisé tel quel dans la sidebar. Les logos officiels ne sont ni
recolorés ni déformés.

## Couleurs

| Rôle | Hex | Usage |
|---|---|---|
| Principale | `#772B2F` | Boutons principaux, navigation active, accents forts |
| Secondaire 1 | `#cdc97e` | Accent, libellés, graphiques, liens |
| Secondaire 2 | `#4a8a33` | Succès, validations, graphiques |
| Secondaire 3 | `#f6db43` | Avertissements, alertes, graphiques |
| Fond | `#0c1110` | Fond général sombre |
| Surface | `#17201d` | Cartes et panneaux |
| Texte | `#f3efe2` | Texte principal crème |
| Texte secondaire | `#b9b5a6` | Métadonnées et aides |

### Nuances d'accessibilité

Le bordeaux `#772B2F` est utilisé en aplat avec du texte crème. Pour le texte accentué sur fond
sombre, une nuance plus claire `#d59a9d` est utilisée. Le vert `#4a8a33` est réservé aux aplats ;
le texte de succès utilise une nuance plus claire `#8cc46a`. Les couleurs de danger restent
distinctes et accessibles.

## Implémentation

Les jetons sont définis dans `frontend/src/index.css` :

```css
--color-primary: #772b2f;
--color-primary-strong: #d59a9d;
--color-accent: #cdc97e;
--color-brand-green: #4a8a33;
--color-warning: #f6db43;
--color-brand-cream: #f3efe2;
```

Ils sont utilisés par les composants Tailwind (`bg-primary`, `text-accent`, `bg-brand-green`,
`text-warning`, etc.). Les graphiques utilisent une palette dérivée de la charte dans
`frontend/src/features/dashboard/ChartCard.tsx`.

## Règles d'usage

- Ne pas utiliser le jaune `#f6db43` comme fond de texte clair sans texte sombre.
- Ne pas multiplier les aplats bordeaux : les boutons principaux et la navigation active suffisent.
- Les couleurs secondaires servent à distinguer les séries et les états, pas à décorer.
- Conserver un contraste conforme WCAG AA pour le texte.
- Le logo officiel reste sur fond crème, sans filtre ni modification de couleur.
