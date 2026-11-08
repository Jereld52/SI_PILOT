# Permissions

## Modèle

- **Rôle** : jeu de permissions par défaut.
- **Permission** : code `module.action` (100 permissions).
- **Portée de données** : `all`, `service`, `own`.
- **Surcharge utilisateur** : `allow` ou `deny`, auditée.

Deny by default. Les permissions sont contrôlées côté serveur et dans les services métier.

## Rôles

| Code | Nom | Portée |
|---|---|---|
| `admin` | Administrateur | all |
| `si_manager` | Responsable informatique | all |
| `technician` | Technicien | service |
| `reader` | Lecteur | all |
| `user` | Utilisateur / Agent | own |

## Matrice synthétique

| Module | Admin | Resp. SI | Technicien | Lecteur | Utilisateur |
|---|---|---|---|---|---|
| Vue générale | G | V | V | V | P |
| Demandes IT | G | G | C | V | P |
| Parc | G | G | C | V | P |
| Agents | G | G | V | V | P |
| Référentiels | G | G | V | V | — |
| Téléphonie mobile | G | G | V | V | — |
| Infrastructure | G | G | C | V | — |
| Cybersécurité | G | G | C | R | — |
| Contrats | G | G | V | V | — |
| Budget | G | G + validation | R | R | — |
| Projets | G | G | C | V | P |
| RGPD | G | G | — | — | — |
| Documentation | G | G | C | V | V |
| Calendrier | G | G | C | V | P |
| Administration | G | Partiel | — | — | — |
| Audit | G | V | — | — | — |
| Assistant IA | G | Usage | Usage | — | — |

Légende : G gestion, C création/modification, V lecture, R restreint, P personnel.

## Permissions sensibles

`admin.roles.manage`, `admin.settings.manage`, `admin.backup.manage`, `audit.read`,
`budget.validate`, `security.manage`, `rgpd.manage`, `ai.configure`, `imports.apply`,
`mobile_lines.secrets.read`, `mobile_lines.secrets.manage`.

## Points de contrôle

1. Dépendance FastAPI `require_permission("code")`.
2. Vérification métier dans le service.
3. Filtrage des requêtes par portée de données.
4. Masquage des actions dans l'interface (confort uniquement).
5. Audit de toute modification de rôle ou de permission.

## Comptes

- Le dernier administrateur actif ne peut pas être désactivé ou rétrogradé.
- Un utilisateur ne peut pas désactiver son propre compte.
- Le rôle Administrateur est verrouillé côté API : ses permissions ne peuvent pas être modifiées
  depuis l'interface, afin d'éviter une perte d'accès.
