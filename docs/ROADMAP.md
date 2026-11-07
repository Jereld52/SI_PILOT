# Feuille de route

| Version | Contenu | Critères de sortie | État |
|---|---|---|---|
| V0.1 | Socle, Docker, config, logs, erreurs, PostgreSQL, Alembic, auth, rôles, permissions, layout, design system, CI | Connexion, sessions révocables, permissions testées, migrations, CI verte | **Livré** |
| V0.2 | Administration, référentiels, utilisateurs, rôles, paramètres, audit, notifications | CRUD complets, audit, matrice testée | **Livré** |
| V0.3 | Parc, agents, affectations, stock, QR, renouvellement, imports/exports | Fiche équipement, historique, QR, import avec prévisualisation | À démarrer |
| V0.4 | Tickets, Kanban, commentaires, temps, SLA, interventions | Cycle de vie respecté, Kanban persistant, historique | Planifié |
| V0.5 | Contrats, budget, calendrier, actions | Alertes exactes, calculs budgétaires, calendrier agrégé | Planifié |
| V0.6 | Infrastructure, cybersécurité | Cartographie, incidents liés aux actifs | Planifié |
| V0.7 | Projets, RGPD, documentation | Timeline, registre, versions documentaires | Planifié |
| V0.8 | Automatisations, rapports, imports avancés | Règles activables, exécutions tracées | Planifié |
| V0.9 | SylvIA | Intégration désactivable, aucune écriture directe | Planifié |
| V1.0 | Recette, sécurité, restauration, documentation, déploiement | Recette métier, sauvegarde restaurée, runbook | Planifié |

## Prochaine étape recommandée

**Phase 3 — Parc et agents**, dans cet ordre :

1. Référentiels services, sites, catégories d'équipements.
2. CRUD agents et équipements.
3. Affectations et historique.
4. QR code authentifié.
5. Import CSV/XLSX avec prévisualisation.
6. Score de renouvellement et exports.
7. Puis tickets et interventions.

Chaque module doit être livré avec : API, permissions, audit, tests, états vides/chargement/erreur,
exports et documentation.

## Dettes techniques connues

- Découpage du bundle frontend (Recharts) par import dynamique.
- MFA TOTP.
- Tests E2E Playwright.
- Index de recherche plein texte PostgreSQL (`tsvector`, `unaccent`, `pg_trgm`).
- Worker d'automatisation séparé.
- Intégration LDAP/AD via `AuthProvider`.
- Chiffrement des sauvegardes hors site.
- Journalisation des accès API dans un fichier dédié en plus de la base.
