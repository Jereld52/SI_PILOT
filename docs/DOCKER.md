# Déploiement Docker

Docker n'est pas installé sur le poste actuel (droits administrateur et WSL2 requis). Les
fichiers sont fournis pour un déploiement ultérieur sur un serveur ou un poste compatible.

## 1. Développement

Depuis la racine :

```powershell
docker compose -f infra/compose.dev.yml up --build
```

- API : <http://127.0.0.1:8000/api/docs>
- PostgreSQL : `127.0.0.1:5433`
- Frontend : lancer `npm run dev` dans `frontend` (Vite proxy vers 8000).

Le fichier `backend/.env` doit exister. `DATABASE_URL` est surchargé par Compose pour pointer
vers le service `db`.

## 2. Production locale

```powershell
Copy-Item infra\.env.prod.example infra\.env
# Éditer infra\.env : POSTGRES_PASSWORD, SECRET_KEY, FIELD_ENCRYPTION_KEY, CORS_ORIGINS
docker compose -f infra/compose.prod.yml up -d --build
```

- Application : <http://127.0.0.1:8080>
- API interne : `api:8000` (non publiée)
- PostgreSQL : volume `pgdata`, non publié
- Fichiers : volume `uploads`
- Migrations : exécutées au démarrage du conteneur API (`alembic upgrade head`)

### Derrière HTTPS

Placer Caddy, Nginx ou le reverse proxy de l'établissement devant le port 8080. Configurer :

- `CORS_ORIGINS=https://si-pilot.example.org`
- `SECURE_COOKIES=true`
- certificat TLS valide
- `X-Forwarded-For` et `X-Forwarded-Proto` transmis

### Sauvegardes en Docker

```powershell
docker compose -f infra/compose.prod.yml exec -T db pg_dump -U pnfor -d si_pnfor -Fc > backup.dump
docker run --rm -v si-pnfor-pilote_uploads:/data -v ${PWD}:/backup alpine tar czf /backup/uploads.tgz -C /data .
```

Tester la restauration sur une base de recette avant toute mise en production.

## 3. Commandes utiles

```powershell
docker compose -f infra/compose.prod.yml ps
docker compose -f infra/compose.prod.yml logs -f api
docker compose -f infra/compose.prod.yml exec api alembic current
docker compose -f infra/compose.prod.yml exec api python -m app.cli seed
docker compose -f infra/compose.prod.yml down
```

## 4. Sécurité

- Les conteneurs API et web tournent avec des images minimales.
- L'API tourne avec l'utilisateur non privilégié `appuser` après l'entrypoint.
- Les ports de la base et de l'API ne sont pas publiés en production.
- Les secrets sont lus depuis `infra/.env`, jamais copiés dans les images.
- Ne pas committer `infra/.env`.
