# Phase 2 — Socle technique

## Livré

### Infrastructure locale

- PostgreSQL 17.7 portable installé dans `.runtime`, cluster `pgdata`, port 5433.
- Base `si_pnfor` migrée par Alembic : 86 tables métier + `alembic_version`.
- Environnement Python isolé `backend/.venv`.
- Frontend compilé dans `frontend/dist`.
- Scripts Windows de démarrage, sauvegarde et restauration.

### Backend

- FastAPI, `/api/v1`, OpenAPI (`/api/docs`).
- 95 permissions, 5 rôles, portées de données.
- Authentification Argon2id, sessions serveur, CSRF, verrouillage, révocation.
- Audit append-only avec chaînage de hash.
- Notifications.
- Tableau de bord : 13 KPI, graphiques, alertes, activité.
- Recherche globale filtrée par permissions.
- Administration : utilisateurs, rôles, permissions, paramètres, audit.

### Frontend

- React 19 + TypeScript + Vite + Tailwind 4.
- Design system sombre, responsive, sidebar rétractable.
- Connexion, bandeau de changement de mot de passe, profil, déconnexion.
- Tableau de bord connecté aux API réelles.
- Administration complète (utilisateurs, rôles, audit, paramètres).
- Recherche globale, notifications, dialogues SylvIA (information).
- Pages de modules en attente, sans données fictives ni boutons inactifs.

## Vérifications effectuées

```text
pytest -q                         25 passed
ruff check app tests              All checks passed
mypy app                          Success: no issues found in 60 source files
npm run build                     tsc + vite build OK (chunks séparés)
```

Tests fonctionnels manuels :

- connexion administrateur, `/auth/me`, tableau de bord ;
- création d'un utilisateur technicien via l'interface ;
- refus d'accès aux routes d'administration pour le technicien ;
- refus d'une mutation sans jeton CSRF ;
- activation/désactivation d'un compte ;
- journal d'audit, rôles, paramètres ;
- recherche globale ;
- mode production natif : frontend compilé servi par FastAPI sur le port 8000,
  routes SPA, `/health`, API et 404 JSON vérifiés.

## Limites assumées

- Les modules métier (parc, tickets, contrats, budget, projets, RGPD, documentation,
  infrastructure, cybersécurité, calendrier) sont visibles dans la navigation mais affichent
  une page « module en préparation ». Aucune donnée n'est simulée.
- Pas encore de MFA, LDAP, import/export, automatisation, SylvIA.
- Pas de tests E2E Playwright ni de test de charge.
- Docker n'est pas installé sur le poste ; les fichiers sont fournis mais non exécutés ici.
- Le frontend est servi par FastAPI en mode natif ; Nginx est prévu pour Docker.
- Le découpage du bundle frontend reste à optimiser.

## Prochaine étape

Phase 3 : référentiels organisation, agents, parc informatique, affectations, QR codes,
imports, renouvellement, puis tickets et interventions.
