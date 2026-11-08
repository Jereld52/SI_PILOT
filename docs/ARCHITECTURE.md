# Architecture

## 1. Vue d'ensemble

```text
Navigateur
    │ HTTPS
    ▼
Nginx (Docker)  ou  FastAPI (mode Windows natif)
    │ /api/v1
    ▼
FastAPI
    ├── PostgreSQL 17
    ├── stockage fichiers (data/uploads)
    ├── worker APScheduler (Phase 6)
    ├── SMTP (Phase 6)
    └── adaptateur IA (Phase 5, facultatif)
```

En mode Windows natif, FastAPI sert le frontend compilé (`frontend/dist`) et l'API sur le
même port, ce qui évite un serveur web supplémentaire. En Docker, Nginx sert le frontend et
reverse-proxy l'API.

## 2. Backend

```text
app/
├── api/          routes, dépendances, validation d'entrée
├── core/         configuration, sécurité, permissions, erreurs, logs, pagination
├── db/           moteur, sessions, base déclarative
├── models/       SQLAlchemy (86 tables)
├── schemas/      Pydantic (entrées/sorties)
├── services/     règles métier, orchestration, audit
├── repositories/ accès aux données (à compléter par module)
├── integrations/ IA, stockage, mail
├── jobs/         planificateur et automatisations
├── exports/      XLSX, PDF, CSV
├── imports/      parseurs, validation, mapping
└── seed/         référentiels uniquement
```

Règles :

- Les routes ne contiennent pas de logique métier.
- Toute mutation passe par un service et écrit l'audit dans la même transaction.
- Les permissions sont contrôlées côté serveur, jamais uniquement dans l'interface.
- Les montants sont en `NUMERIC`, jamais en flottant.
- Les dates sont stockées en UTC, affichées en `Europe/Paris`.

## 3. Frontend

```text
src/
├── app/          routeur et composition
├── components/   design system, layout, graphiques
├── features/     dashboard, auth, admin, modules métier
├── lib/          client API, formatage, permissions, mots de passe
├── hooks/
├── styles/
└── types/
```

- TanStack Query pour l'état serveur.
- React Hook Form + Zod pour les formulaires.
- Recharts pour les graphiques.
- Radix + Tailwind pour l'accessibilité et la cohérence.
- Aucune donnée métier en dur dans les composants.
- Chaque page gère chargement, erreur, vide, succès.

## 4. Sécurité

Voir [`SECURITY.md`](SECURITY.md). Points structurants :

- sessions serveur opaques, cookie `HttpOnly`, CSRF ;
- Argon2id ;
- RBAC + portée de données ;
- audit chaîné ;
- en-têtes de sécurité ;
- secrets hors dépôt ;
- Assistant IA isolé et facultatif.

## 5. Base de données

- PostgreSQL 17 en production, SQLite uniquement pour les tests rapides.
- Alembic pour toutes les évolutions de schéma.
- UUID pour les clés primaires métier, `BIGINT` pour l'audit.
- Contraintes `CHECK` pour les états fixes, tables de référence pour les référentiels.
- Index sur les clés étrangères et les colonnes de filtre.
- Pas de suppression physique des entités sensibles.

Voir [`DATA_MODEL.md`](DATA_MODEL.md).

## 6. Déploiement

- Windows natif : PostgreSQL portable, Uvicorn, FastAPI sert le SPA.
- Docker : `infra/compose.dev.yml` et `infra/compose.prod.yml`.
- Reverse proxy TLS recommandé pour tout accès réseau.
- Sauvegardes : `scripts/windows/backup.ps1` ou `pg_dump` Docker.

## 7. Décisions d'architecture

### ADR 001 — Sessions serveur plutôt que JWT

Les sessions opaques sont révoquables immédiatement, ne stockent aucun jeton sensible dans le
navigateur et simplifient la gestion des droits. Les futures intégrations machine à machine
utiliseront des jetons API hachés et porteurs de scopes.

### ADR 002 — PostgreSQL portable sous Windows

Docker Desktop nécessite WSL2 et des droits administrateur. Le PostgreSQL portable permet une
installation sans privilège élevé, tout en conservant PostgreSQL comme base réelle. Docker reste
la cible recommandée pour un serveur.

### ADR 003 — Frontend servi par FastAPI en mode natif

Pour un poste unique, servir le SPA compilé par FastAPI évite Nginx et réduit les points de
panne. En Docker, Nginx reste utilisé pour la mise en cache et la séparation des rôles.

### ADR 004 — Assistant IA facultatif et isolé

Aucun endpoint n'est supposé. L'adaptateur est isolé, désactivé par défaut et ne peut jamais
écrire en base. Les données envoyées sont minimisées et journalisées.
