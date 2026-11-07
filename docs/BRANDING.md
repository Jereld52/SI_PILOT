# Charte graphique

## Logo

- Source officielle : `assets/logo.png` (transparent, 2000×928).
- Version servie par l'application : `frontend/public/logo.png`.
- Emblème compact pour la sidebar : `frontend/public/logo-emblem.png`.
- Icône du raccourci Windows : `assets/si-pnfor-charte.ico` (version aux couleurs de la charte).
- Favicon : `frontend/public/favicon.svg`.

Le logo contient des éléments noirs et bordeaux. Il est toujours présenté sur un fond crème
(`#f3efe2`) afin de rester lisible sur le thème sombre. Le logo officiel n'est pas recoloré.

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
