# SI PNFor PILOTE

**Cockpit de pilotage du système d'information du Parc national de forêts.**

Application métier autonome pour centraliser le parc informatique, les agents, les demandes,
les interventions, l'infrastructure, la cybersécurité, les contrats, le budget, les projets,
le RGPD, la documentation et les échéances.

> **État actuel : Phase 3 — parc enrichi, téléphonie, fournisseurs, licences, stock,
> demandes IT, interventions et RGPD livrés.**
> Les modules restants (infrastructure, cybersécurité, contrats, budget, projets, documentation,
> calendrier, SylvIA) sont annoncés dans la navigation avec leur phase de développement.
> Aucune donnée fictive n'alimente les indicateurs.

---

## 1. Ce qui fonctionne aujourd'hui

- PostgreSQL 17 portable sous Windows, migrations Alembic et 86 tables métier.
- API FastAPI versionnée (`/api/v1`) documentée par OpenAPI.
- Authentification locale sécurisée : Argon2id, sessions serveur opaques, cookie `HttpOnly`,
  CSRF, verrouillage après échecs, révocation des sessions.
- Rôles et permissions : 6 rôles (dont DPO), 107 permissions, portées de données, surcharges utilisateur.
- Journal d'audit append-only avec chaînage de hash.
- Notifications in-app.
- Tableau de bord connecté aux données réelles : 13 indicateurs, graphiques, alertes, activité.
- Référentiels, agents, parc informatique, affectations et imports CSV/XLSX.
- Parc enrichi par l'export WAPT : système, IP, dernier utilisateur, dernière connexion, groupes
  et données source complètes ; fiche détaillée et QR code par équipement.
- Téléphonie mobile : inventaire des 82 lignes, titulaires, forfaits et terminaux ; PIN/PUK
  chiffrés avec accès contrôlé et audité.
- Fournisseurs, licences, sièges et coûts annuels.
- **Stock IT** dédié : claviers, souris, écrans, casques, stations d'accueil, câbles et
  consommables, avec quantités, seuils d'alerte, valeur, mouvements et historique.
- Contrats et prestataires : montants, préavis, reconduction, échéances et alertes.
- Budget informatique : exercices, lignes par catégorie, engagements, factures et disponible réel.
- Infrastructure : serveurs, VM, réseau, dépendances et supervision autorisée sans scan implicite.
- Cybersécurité : incidents, actions, vulnérabilités, sauvegardes, certificats et audits.
- Projets : jalons, tâches, risques, décisions et avancement calculé.
- Documentation : métadonnées, tags, versions et téléversement/téléchargement de fichiers.
- Calendrier et actions : vue mensuelle, événements, échéances et actions à réaliser.
- Administration → **Import / Export** : imports CSV/XLSX pour agents, parc, mobiles, fournisseurs,
  licences et infrastructure, avec prévisualisation, rapport et historique ; exports XLSX/PDF du
  parc, des lignes mobiles, de l'infrastructure, des tickets et des statistiques.
- Administration → **Sources de données** : connexion Active Directory en LDAP/LDAPS (configuration
  chiffrée, test, prévisualisation, synchronisation des agents) et enrichissement depuis Remote
  Desktop Manager par export CSV, sans jamais importer les secrets.
- Demandes IT : création simplifiée, actions rapides, priorités, SLA, assignation, commentaires,
  temps passé, historique complet et interventions liées.
- Exports statistiques des tickets en XLSX/PDF par jour, semaine, mois ou année, avec synthèse,
  répartitions et détail.
- Page **Statistiques** consolidée : tickets, interventions, parc, contrats, budget, sécurité,
  projets, téléphonie et documentation, avec export XLSX/PDF.
- RGPD : registre des traitements, collectes, demandes DPO, droits des personnes et violations.
- Exports RGPD : registre complet en XLSX/PDF, dossier d'une demande de droits et données
  personnelles détenues sur un agent, avec audit. Les PIN/PUK restent exclus.
- Exports détaillés XLSX et PDF du parc, des lignes mobiles et de l'infrastructure : toutes les
  colonnes des fiches, WAPT dynamique, historique des affectations, dépendances et supervision.
  Les PIN/PUK restent exclus des exports.
- Administration : utilisateurs, rôles et permissions, journal d'audit, paramètres.
- Recherche globale filtrée par permissions.
- Interface React/TypeScript responsive, identité bordeaux renforcée, navigation rétractable.
- Tri des colonnes au clic sur tous les tableaux de données, avec indicateur de sens.
- Cockpit d'accueil : état des 11 modules, chiffres clés, échéances, alertes, activité et graphiques.
- Tests backend : 52 tests passants (`pytest`), `ruff` et `mypy` sans erreur.
- Déploiement Docker prévu (dev et production) et scripts Windows natifs.

## 2. Démarrage rapide (Windows, installation déjà réalisée)

```powershell
# Démarrer PostgreSQL portable
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-postgres.ps1

# Mode développement : API + frontend Vite
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-dev.ps1

# Mode application locale : frontend compilé servi par FastAPI
powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-app.ps1 -OpenBrowser
```

- Développement : <http://127.0.0.1:5173>
- Application locale : <http://127.0.0.1:8000>
- Documentation API : <http://127.0.0.1:8000/api/docs>
- Santé : <http://127.0.0.1:8000/api/v1/health/ready>

### Raccourci bureau

Un raccourci **SI PNFor PILOTE** est présent sur le bureau. Il exécute
`scripts\windows\launch.ps1`, démarre PostgreSQL si nécessaire, lance l'application et ouvre
le navigateur. Si l'application est déjà active, il ouvre simplement la page.

### Compte initial

Le compte administrateur créé lors de l'installation est documenté dans
`.runtime/initial-admin.txt` (fichier local ignoré par Git). **Changez ce mot de passe à la
première connexion.** Le bandeau de l'application le rappelle.

Pour créer un autre administrateur :

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.cli create-admin `
  --email admin@forets-parcnational.fr --first-name Admin --last-name "SI PNFor" --generate
```

## 3. Installation complète

- **Windows natif** : voir [`docs/INSTALL_WINDOWS.md`](docs/INSTALL_WINDOWS.md).
- **Docker** : voir [`docs/DOCKER.md`](docs/DOCKER.md).
- **Sauvegarde / restauration** : voir [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md).
- **Sécurité** : voir [`docs/SECURITY.md`](docs/SECURITY.md).
- **Architecture** : voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Script d'installation reproductible :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-windows.ps1
```

Il installe Node.js si nécessaire, télécharge PostgreSQL portable, initialise le cluster,
génère `backend/.env` avec un secret aléatoire, applique les migrations, charge les référentiels
et compile le frontend. Il ne crée pas de compte administrateur automatiquement.

## 4. Stack

| Couche | Technologies |
|---|---|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0, Pydantic 2, Alembic |
| Base | PostgreSQL 17 (SQLite réservé aux tests) |
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, TanStack Query |
| UI | Composants inspirés de shadcn/ui, Radix, lucide-react, Recharts, sonner |
| Sécurité | Argon2id, sessions serveur, CSRF, RBAC, audit chaîné |
| Déploiement | Windows natif, Docker Compose, Nginx |

## 5. Charte graphique

Logos officiels : `assets/logoweb.png` pour l'écran de connexion, `assets/favicon.png` et
`assets/pnf-logo.jpg` pour l'emblème. Couleurs : bordeaux `#772B2F`, sauge `#cdc97e`, vert
forêt `#4a8a33`, jaune `#f6db43`, sur un fond sombre crème. Détail :
[`docs/BRANDING.md`](docs/BRANDING.md).

## 6. Structure

```text
backend/     API, modèles, services, migrations, tests
frontend/    application React/TypeScript
infra/       Dockerfiles, Compose, configuration Nginx
scripts/     scripts Windows (démarrage, sauvegarde, restauration)
modeles/     fichiers d'import fournis (PC-PNfor.csv, lignes_mobiles.xlsx), non versionnés
assets/      logos et icônes officiels
docs/        architecture, installation, sécurité, exploitation
.runtime/    PostgreSQL portable, logs, sauvegardes locales (ignoré par Git)
```

## 7. Commandes utiles

```powershell
# Backend
cd backend
.\.venv\Scripts\pytest.exe -q
.\.venv\Scripts\ruff.exe check app tests
.\.venv\Scripts\mypy.exe app
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m app.cli seed

# Frontend
cd frontend
npm run dev
npm run build
```

## 8. Règles du projet

- Aucune donnée fictive en production ; seuls les référentiels sont préchargés.
- Aucun bouton décoratif : toute action affichée est opérationnelle.
- Aucune suppression physique des données sensibles ; archivage ou anonymisation.
- Aucun mot de passe en clair, aucun secret dans le dépôt.
- Aucun scan réseau ou action administrative sans autorisation explicite.
- SylvIA reste facultative : l'application fonctionne intégralement sans elle.
- Toute mutation est auditée.

## 9. Feuille de route

| Phase | Contenu | État |
|---|---|---|
| Phase 1 | Audit et conception | Terminée |
| Phase 2 | Socle technique, auth, rôles, dashboard, administration | **Terminée** |
| Phase 3 | Référentiels, agents, parc enrichi WAPT, téléphonie, imports, QR codes, exports, fournisseurs, licences, stock, demandes IT, interventions, contrats, budget | **Livrée** |
| Phase 4 | Infrastructure, cybersécurité, projets, RGPD, documentation | **Livrée** |
| Phase 5 | Intégration SylvIA (Ollama / Open WebUI) | Planifiée |
| Phase 6 | Automatisations, notifications, exports, sauvegardes, industrialisation | Planifiée |

Détail : [`docs/ROADMAP.md`](docs/ROADMAP.md).

## 10. Licence et propriété

Logiciel interne au Parc national de forêts. Aucune dépendance à ASTRA, ENKI ou à des
environnements personnels. Les composants open source conservent leurs licences respectives.
