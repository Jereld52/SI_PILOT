# Déploiement sur un serveur accessible en continu

Objectif : installer SI PILOT sur un serveur du réseau, accessible depuis tous les postes, sans
dépendre d'un ordinateur allumé, avec démarrage automatique et sauvegardes.

Deux méthodes sont disponibles :

- **Windows Server** : trousse d'export + tâche planifiée au démarrage (recommandé si le parc est
  sous Windows).
- **Docker** : pile complète PostgreSQL + API + Nginx, avec redémarrage automatique.

## 1. Préparer l'export depuis le poste actuel

Depuis le dossier SI PILOT, dans PowerShell :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\export-server-kit.ps1 -PublicUrl "http://NOM-DU-SERVEUR:8000"
```

Le script :

- compile le frontend ;
- copie le code, les scripts, la documentation et le frontend compilé ;
- crée une sauvegarde complète (base + configuration + fichiers) ;
- extrait `SECRET_KEY` et `FIELD_ENCRYPTION_KEY` dans `migration\secrets.env` ;
- produit un ZIP dans `.runtime\export\`.

> Le ZIP contient des secrets et une sauvegarde complète. Transférez-le par un canal sûr et
> supprimez-le après installation.

Si la sauvegarde ne peut pas être créée automatiquement, utilisez **Administration →
Sauvegarde** puis copiez l'archive dans `migration\si-pilot-backup.zip`.

## 2. Installation sur Windows Server

Prérequis : Windows Server 2019 ou ultérieur, PowerShell 5.1, accès Internet pour `pip` et le
téléchargement de PostgreSQL. Python 3.13 est installé automatiquement si `winget` est
disponible ; sinon, installez-le manuellement.

1. Copier et extraire le kit sur le serveur, par exemple dans `C:\SI_PILOT`.
2. Ouvrir une console PowerShell **administrateur**.
3. Installer :

```powershell
cd C:\SI_PILOT
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-windows.ps1 -SkipFrontend -SecretsFile .\migration\secrets.env
```

Le script installe Python, PostgreSQL portable, les dépendances, applique les migrations et
initialise les référentiels. Le frontend déjà compilé est conservé, Node.js n'est pas requis.

4. Démarrer une première fois :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-app.ps1 -BindAddress 0.0.0.0 -Port 8000 -PublicUrl "http://NOM-DU-SERVEUR:8000"
```

5. Ouvrir `http://NOM-DU-SERVEUR:8000`. Si la base est vide, créer le premier administrateur.
6. Aller dans **Administration → Sauvegarde** et restaurer `migration\si-pilot-backup.zip`.
7. Se reconnecter avec un compte existant de l'ancienne installation.

### Installer le service de démarrage automatique

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-server.ps1 -Port 8000 -PublicUrl "http://NOM-DU-SERVEUR:8000"
```

Cette commande :

- crée une tâche planifiée **SI PILOT** lancée au démarrage sous le compte SYSTEM ;
- redémarre l'application en cas d'arrêt inattendu ;
- ouvre le port TCP dans le pare-feu (profils domaine et privé) ;
- écrit les logs dans `.runtime\server.log`.

Journal :

```text
C:\SI_PILOT\.runtime\server.log
```

Pour retirer le service :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-server.ps1 -Port 8000
```

## 3. Installation avec Docker

Sur un serveur Linux avec Docker et Docker Compose :

```bash
cp infra/.env.prod.example infra/.env
# Éditer infra/.env : POSTGRES_PASSWORD, SECRET_KEY, FIELD_ENCRYPTION_KEY,
# PUBLIC_BASE_URL, CORS_ORIGINS, WEB_PORT, TZ
docker compose -f infra/compose.prod.yml up -d --build
```

Accès : `http://NOM-DU-SERVEUR:8080`.

La pile inclut :

- PostgreSQL persistant (`pgdata`) ;
- API avec migrations automatiques ;
- Nginx pour le frontend et le proxy `/api` ;
- volumes `uploads` et `backups` ;
- `restart: unless-stopped` pour un fonctionnement continu ;
- `postgresql-client` dans l'image API pour les sauvegardes planifiées.

Pour migrer les données, restaurer l'archive complète depuis **Administration → Sauvegarde**
après la première connexion. Conserver la même `FIELD_ENCRYPTION_KEY` que l'installation
d'origine.

### Derrière HTTPS

Placer le reverse proxy de l'établissement (IIS, Nginx, Caddy, HAProxy) devant le port 8080 ou
8000, puis :

```env
PUBLIC_BASE_URL=https://si-pilot.votre-domaine.interne
CORS_ORIGINS=https://si-pilot.votre-domaine.interne
SECURE_COOKIES=true
TRUST_PROXY_HEADERS=true
```

Transmettre `X-Forwarded-For` et `X-Forwarded-Proto`. Ne pas exposer directement l'application
sur Internet sans VPN ou reverse proxy TLS.

Avec Docker, on peut aussi limiter l'écoute à localhost et laisser le proxy du serveur exposer
HTTPS :

```env
WEB_BIND=127.0.0.1
WEB_PORT=8080
```

## 4. Accès depuis le réseau

- Créer un enregistrement DNS interne, par exemple `si-pilot.votre-domaine.interne`.
- Autoriser le port choisi (8000 en natif, 8080 en Docker) entre les VLAN concernés.
- Vérifier que le pare-feu du serveur autorise le profil réseau utilisé (domaine/privé).
- Tester depuis un autre poste : `http://NOM-DU-SERVEUR:8000/health`.

## 5. Sauvegardes et veille

Une fois l'application installée :

1. **Administration → Veille & planification** : activer la veille, la sauvegarde planifiée et
   le digest quotidien.
2. Vérifier que le répertoire `BACKUP_DIR` est inclus dans la sauvegarde du serveur ou répliqué
   vers un autre support.
3. Tester une restauration sur une instance de recette.
4. Pour Docker, sauvegarder les volumes `pgdata`, `uploads` et `backups`.

## 6. Mise à jour

1. Sauvegarder l'application et la base.
2. Remplacer le code par la nouvelle version.
3. Exécuter `alembic upgrade head` (ou laisser le conteneur le faire).
4. Recompiler le frontend si nécessaire.
5. Redémarrer la tâche ou les conteneurs.

Sur Windows :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\stop-postgres.ps1
# remplacer les fichiers
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-windows.ps1 -SkipFrontend
```

Puis redémarrer la tâche planifiée.

## 7. Points de vigilance

- Ne pas exposer le port applicatif directement sur Internet.
- Conserver `FIELD_ENCRYPTION_KEY` : sans elle, les secrets stockés sont irrécupérables.
- Le compte SYSTEM doit pouvoir lire et écrire dans le dossier SI PILOT.
- Le serveur doit avoir une adresse IP fixe ou un bail DHCP réservé.
- Vérifier la cohérence de l'heure et du fuseau (`TZ`) pour le planificateur.
- Le planificateur suppose un seul processus applicatif. En Docker, un seul conteneur API.
