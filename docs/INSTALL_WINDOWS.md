# Installation native Windows

Cible : poste Windows 11 de l'établissement, exécution locale, sans dépendance à XAMPP.
XAMPP (Apache/PHP/MySQL) n'est pas utilisé : la stack est FastAPI + PostgreSQL + React.

## 1. Composants installés

| Composant | Emplacement | Rôle |
|---|---|---|
| Python 3.13 | `C:\Users\<user>\AppData\Local\Programs\Python\Python313` | Backend |
| Node.js 24 LTS | installation utilisateur via winget | Build frontend |
| Git | installation utilisateur | Versionnage |
| PostgreSQL 17.7 portable | `C:\SI_PILOT\.runtime\pgsql` | Base de données |
| Cluster PostgreSQL | `C:\SI_PILOT\.runtime\pgdata` | Données |
| Venv Python | `C:\SI_PILOT\backend\.venv` | Dépendances isolées |
| Frontend compilé | `C:\SI_PILOT\frontend\dist` | Interface servie par FastAPI |

Aucun service Windows n'est créé par défaut. Le démarrage se fait par scripts, ou par le
Planificateur de tâches si un démarrage automatique est souhaité.

## 2. Installation reproductible

```powershell
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\setup-windows.ps1
```

Le script :

1. vérifie Python, installe Node.js LTS et Git si absents (winget) ;
2. télécharge PostgreSQL 17.7 portable et l'extrait dans `.runtime` ;
3. initialise le cluster `pgdata` avec un mot de passe aléatoire stocké dans
   `.runtime\pg_password.txt` ;
4. démarre PostgreSQL sur `127.0.0.1:5433` ;
5. crée la base `si_pnfor` ;
6. génère `backend\.env` avec un `SECRET_KEY` aléatoire ;
7. crée le venv, installe les dépendances, applique Alembic et charge les référentiels ;
8. installe les dépendances frontend et compile `frontend\dist`.

Il ne crée pas de compte administrateur : utilisez la commande affichée à la fin.

## 3. Démarrage

### Développement

```powershell
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\start-dev.ps1
```

Ouvre deux fenêtres : API FastAPI avec rechargement, frontend Vite.
- Frontend : <http://127.0.0.1:5173>
- API : <http://127.0.0.1:8000/api/docs>

### Application locale

```powershell
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\start-app.ps1 -OpenBrowser
```

Un raccourci **SI PNFor PILOTE** est créé sur le bureau. Il lance
`scripts\windows\launch.ps1`, qui démarre PostgreSQL si nécessaire puis l'application. Si le
port 8000 est déjà actif, il ouvre directement le navigateur. L'icône est
`assets\si-pnfor.ico`.

Compile le frontend si nécessaire, active `SERVE_FRONTEND=true`, puis sert l'application
complète sur <http://127.0.0.1:8000>. C'est le mode recommandé pour l'usage quotidien.

### Arrêt

- `Ctrl+C` dans la fenêtre Uvicorn ;
- `powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\stop-postgres.ps1`.

## 4. Accès depuis le réseau local

Par défaut, l'application écoute sur `127.0.0.1` uniquement. Pour un accès depuis d'autres
postes du Parc :

1. modifier `start-app.ps1` pour utiliser `--host 0.0.0.0` ;
2. autoriser le port 8000 dans le pare-feu Windows pour le réseau interne ;
3. placer un reverse proxy HTTPS (Caddy ou Nginx) devant l'application ;
4. mettre `SECURE_COOKIES=true` dans `backend\.env` ;
5. renseigner l'origine publique dans `CORS_ORIGINS`.

Ne jamais exposer directement l'application sur Internet sans HTTPS, reverse proxy et revue
de sécurité.

## 5. Démarrage automatique (optionnel)

### Planificateur de tâches

Créer une tâche « Au démarrage de l'ordinateur » :

- Programme : `powershell.exe`
- Arguments : `-ExecutionPolicy Bypass -File "C:\SI_PILOT\scripts\windows\start-app.ps1" -SkipBuild`
- Démarrer dans : `C:\SI_PILOT`
- Exécuter même si l'utilisateur n'est pas connecté : selon la politique de l'établissement.

Pour PostgreSQL, créer une seconde tâche avec `start-postgres.ps1`.

### Service Windows

Un service Windows nécessite un wrapper (NSSM ou WinSW) pour lancer Uvicorn. Cette option
n'est pas installée par défaut. La tâche planifiée est plus simple et suffisante pour un poste
unique. Pour un serveur dédié, préférer Docker ou Linux.

## 6. Sauvegardes

```powershell
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\backup.ps1
powershell -ExecutionPolicy Bypass -File C:\SI_PILOT\scripts\windows\backup.ps1 -ApplyRetention
```

Les fichiers sont créés dans `.runtime\backups` avec empreinte SHA-256. Voir
[`BACKUP_RESTORE.md`](BACKUP_RESTORE.md).

## 7. Mise à jour

```powershell
cd C:\SI_PILOT
git pull
cd backend
.\.venv\Scripts\pip.exe install -r requirements-dev.txt
.\.venv\Scripts\alembic.exe upgrade head
cd ..\frontend
npm ci
npm run build
```

Toujours sauvegarder avant une migration. Ne jamais exécuter `alembic downgrade` en production
sans sauvegarde vérifiée.

## 8. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `PostgreSQL introuvable` | `.runtime` absent | Relancer `setup-windows.ps1` |
| `connection refused` sur 5433 | PostgreSQL arrêté | `start-postgres.ps1` |
| Frontend vide en mode 8000 | `dist` absent | `npm run build` ou `start-app.ps1` |
| `401` au premier chargement | Pas de session | Se connecter sur `/login` |
| `CSRF_INVALID` | Cookie CSRF absent ou expiré | Recharger la page, se reconnecter |
| Port 8000 occupé | Ancienne instance | Arrêter le processus Uvicorn |
| `npm` introuvable | PATH non rafraîchi | Rouvrir PowerShell |

Journaux :
- API : console Uvicorn ;
- PostgreSQL : `.runtime\postgres.log` ;
- audit applicatif : table `audit_logs` et écran Administration → Journal d'audit.
