# SI PILOT

**Cockpit de pilotage du système d'information, personnalisable pour chaque structure.**

Application métier autonome pour centraliser le parc informatique, les agents, les demandes,
les interventions, l'infrastructure, la cybersécurité, les contrats, le budget, les projets,
le RGPD, la documentation et les échéances. L'identité visuelle et le nom de la structure
se configurent depuis l'administration.

> **État actuel : socle et modules métier livrés.**
> Parc, agents, téléphonie, fournisseurs, licences, stock, tickets, interventions, contrats,
> budget, infrastructure, supervision, cybersécurité, projets, documentation, RGPD, réservations,
> communication, sauvegarde, exports, assistant IA et administration sont opérationnels. Les
> automatisations planifiées restent à venir.

---

## 1. Ce qui fonctionne aujourd'hui

- PostgreSQL 17 portable sous Windows, migrations Alembic et 92 tables métier.
- API FastAPI versionnée (`/api/v1`) documentée par OpenAPI.
- Authentification locale sécurisée : Argon2id, sessions serveur opaques, cookie `HttpOnly`,
  CSRF, verrouillage après échecs, révocation des sessions.
- **Double authentification TOTP** pour tous les comptes : QR code, application d'authentification,
  codes de secours à usage unique, réinitialisation par un administrateur, sans dépendance SMTP.
- Cookies `Secure` automatiques lorsque l'application est servie en HTTPS.
- Rôles et permissions : 6 rôles (dont DPO), 121 permissions, portées de données, surcharges utilisateur.
- Journal d'audit append-only avec chaînage de hash.
- Notifications in-app.
- Notifications e-mail avec serveur SMTP externe configurable (STARTTLS ou SSL), mot de passe
  chiffré, test d'envoi et boîte d'envoi interne avec statut.
- Tableau de bord connecté aux données réelles : 13 indicateurs, graphiques, alertes, activité.
- Référentiels, agents, parc informatique, affectations et imports CSV/XLSX.
- Parc enrichi par l'export WAPT : système, IP, dernier utilisateur, dernière connexion, groupes
  et données source complètes ; fiche détaillée et QR code par équipement.
- Téléphonie mobile : inventaire des 82 lignes, titulaires, forfaits et terminaux ; PIN/PUK
  chiffrés avec accès contrôlé et audité. Création, modification et suppression des lignes.
- Fournisseurs, licences, sièges et coûts annuels.
- **Stock IT** dédié : claviers, souris, écrans, casques, stations d'accueil, câbles et
  consommables, avec quantités, seuils d'alerte, valeur, mouvements et historique.
- **Réservations de matériel** : vidéoprojecteurs, sonorisation, écrans de projection, mallette
  de micros et enregistreurs, avec planning hebdomadaire, vérification en direct des conflits
  de créneau et ajout libre de matériel réservable. Réservations récurrentes, indisponibilités,
  export ICS, QR code par matériel et sortie/retour.- Contrats et prestataires : montants, préavis, reconduction, échéances et alertes.
- Budget informatique : exercices, lignes par catégorie, engagements, factures et disponible réel.
- Infrastructure : serveurs, VM, réseau, dépendances et supervision autorisée sans scan implicite.
- **Connexion WAPT** dans Administration : URL, identifiants, chemins API, test et synchronisation
  de l'inventaire ; clé privée et certificat de signature des actions à distance
  (`/api/v3/trigger_host_action`) avec test de la clé.
- **Logiciels** dans Support & parc : parc logiciel remonté par WAPT, versions installées,
  mises à jour disponibles par logiciel et par poste, alertes sur le tableau de bord, catalogue
  et installation/désinstallation par équipement. Le déploiement direct nécessite une action
  signée WAPT et reste réalisé depuis la console WAPT lorsque la clé privée n'est pas disponible.
- **Sauvegarde et restauration** depuis Administration : export de la configuration JSON, dump
  PostgreSQL, archive ZIP complète (base, configuration, fichiers), import de configuration et
  restauration de base avec sauvegarde de sécurité automatique.
- **Modules activables** : chaque module du menu peut être désactivé depuis Administration → Modules.
  Un module désactivé disparaît du menu, son URL directe affiche un écran dédié et le tableau de
  bord masque sa tuile. Tous les modules sont actifs par défaut et les données sont conservées.
- **Communication** : communications ciblées aux utilisateurs (tous, service, rôle ou sélection),
  publication avec notification interne et e-mail optionnel, suivi de lecture et archivage ;
  réunions d'équipe, de service, de projet ou points avec la responsable avec ordre du jour,
  compte rendu et décisions ; formations avec organisme, dates, coût, caractère obligatoire et
  participants ; points de suivi 1:1 avec priorité, échéance et prochaine revue.
- **Gestion Active Directory** : création et modification d'utilisateurs, activation/désactivation,
  réinitialisation de mot de passe via LDAPS et gestion de l'appartenance aux groupes, avec audit.
- **Partages réseau** : suivi de l'espace libre des lecteurs et chemins UNC, seuils d'alerte et
  critique, contrôle manuel des volumes et remontée des alertes sur le tableau de bord.
- Supervision globale : plans multiples de site, bâtiment, étage ou baie avec image de fond
  téléversée, équipements représentés et positionnés par glisser-déposer, dépendances, filtres,
  criticité et état des contrôles.
- Cybersécurité : incidents, actions, vulnérabilités, sauvegardes, certificats et audits.
- Projets : jalons, tâches, risques, décisions et avancement calculé.
- Documentation : métadonnées, tags, versions et téléversement/téléchargement de fichiers.
- Calendrier et actions : vue mensuelle, événements, échéances et actions à réaliser.
- Administration → **Import / Export** : imports CSV/XLSX pour agents, parc, mobiles, fournisseurs,
  licences et infrastructure, avec prévisualisation, rapport et historique ; exports XLSX/PDF du
  parc, des lignes mobiles, de l'infrastructure, des tickets et des statistiques.
- Administration → **Sources de données** : connexion Active Directory en LDAP/LDAPS (configuration
  chiffrée, test, prévisualisation, synchronisation des agents, création et modification des
  utilisateurs, groupes) et enrichissement depuis Remote Desktop Manager par export CSV, sans
  jamais importer les secrets.
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
  Les PDF portent le logo de la structure, un titre, un en-tête et une pagination.
  Les PIN/PUK restent exclus des exports.
- Page **Exports sur mesure** : choix du jeu de données, des colonnes, des filtres (statut, type,
  site, période) et du format XLSX/PDF, pour produire un fichier ciblé.
- Administration : utilisateurs, rôles et permissions, journal d'audit, paramètres.
- **Identité personnalisable** : nom de l'application, nom de la structure, accroche, description,
  adresse de contact, logo et couleur principale, appliqués à l'interface, aux e-mails et aux PDF.
- **Assistant de première installation** : création du premier administrateur et de l'identité
  depuis le navigateur, sans ligne de commande.
- **Centre d'aide intégré** : guides par module, recherche, procédures d'exploitation, sauvegarde,
  mise à jour et dépannage.
- **Page Système** : diagnostic, versions, migrations, stockage, sauvegardes, contrôles de
  sécurité et rapport JSON téléchargeable.
- Recherche globale filtrée par permissions, couvrant agents, parc, téléphonie, infrastructure,
  stock, tickets et interventions, fournisseurs et licences, contrats, budgets, projets,
  cybersécurité, RGPD, réservations, calendrier et documentation.
- Interface React/TypeScript responsive, thèmes **Sombre**, **Clair** et **Moderne**, couleur
  principale personnalisable et navigation rétractable.
- Menu latéral regroupé en sections repliables (Pilotage, Support & parc, Infrastructure, Gestion,
  Conformité) pour réduire la hauteur et le nombre d'entrées visibles.
- Tableau de bord, statistiques et exports organisés en onglets pour limiter le défilement.
- Tuiles du tableau de bord personnalisables par utilisateur (sélection et ordre).
- Semaine en cours intégrée au tableau de bord dans l'onglet **Semaine**, avec accès au
  calendrier complet.
- Calendrier avec vues **jour, semaine, mois et année**, et affichage des réservations de
  matériel avec le nom du demandeur.
- Raccourci **Calendrier** placé directement sous **Vue générale** dans le menu, avec création
  d'un événement ou d'une réservation de matériel depuis le calendrier.
- Tri des colonnes au clic sur tous les tableaux de données, avec indicateur de sens.
- Cockpit d'accueil : état des 11 modules, chiffres clés, échéances, alertes, activité et graphiques.
- Tests backend : 68 tests passants (`pytest`), `ruff` et `mypy` sans erreur.
- Frontend découpé en pages chargées à la demande pour réduire le chargement initial.
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

Un raccourci **SI PILOT** est présent sur le bureau. Il exécute
`scripts\windows\launch.ps1`, démarre PostgreSQL si nécessaire, lance l'application et ouvre
le navigateur. Si l'application est déjà active, il ouvre simplement la page.

### Première installation

Au premier démarrage, si aucun administrateur n'existe, l'application ouvre automatiquement
l'**assistant de première installation** sur `/setup`. Il permet de renseigner :

- le nom de la structure et le nom de l'application ;
- l'accroche et la description ;
- le logo et la couleur principale ;
- le compte administrateur initial.

À la fin, l'assistant connecte directement l'administrateur et applique l'identité à toute
l'application. Aucun mot de passe par défaut n'est créé.

Les autres comptes se créent ensuite dans **Administration → Utilisateurs**. En secours, la
création d'un administrateur reste possible en ligne de commande :

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.cli create-admin `
  --email admin@example.org --first-name Admin --last-name "SI PILOT" --generate
```

### Centre d'aide

Le menu **Aide** et l'icône d'aide de la barre supérieure ouvrent un centre de documentation
intégré : prise en main, parc, support, infrastructure, gestion, conformité, administration,
exploitation et dépannage. Les articles sont recherchables et imprimables.

La page **Administration → Système** complète l'aide avec un diagnostic réel de l'application :
base de données, migrations, stockage, SMTP, WAPT, LDAP, sauvegardes, sécurité et volumétrie.

### Identité et personnalisation

L'identité de l'application se règle dans **Administration → Paramètres → Identité de
l'application** lorsque l'on dispose de la permission `admin.settings.manage` :

- nom de l'application et nom de la structure ;
- accroche et description affichées sur l'écran de connexion ;
- adresse de contact ;
- logo (PNG, JPEG ou WEBP, 4 Mo maximum) ;
- couleur principale utilisée par l'interface et les exports PDF.

Les valeurs sont stockées en base, appliquées sans redémarrage et chaque modification est
auditée. Le logo est conservé localement dans le répertoire de stockage de l'application.
Les exports PDF, les e-mails et les notifications reprennent automatiquement l'identité
configurée.

## 3. Installation complète

- **Windows natif** : voir [`docs/INSTALL_WINDOWS.md`](docs/INSTALL_WINDOWS.md).
- **Docker** : voir [`docs/DOCKER.md`](docs/DOCKER.md).
- **Sauvegarde / restauration** : voir [`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md).
- **Assistant IA et fournisseurs** : voir [`docs/ASSISTANT_IA.md`](docs/ASSISTANT_IA.md).
- **Sécurité** : voir [`docs/SECURITY.md`](docs/SECURITY.md).
- **Centre d'aide** : voir [`docs/HELP.md`](docs/HELP.md).
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
modeles/     fichiers d'import fournis localement, non versionnés
assets/      logos et icônes
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
- L'assistant IA est facultatif et configurable : OpenAI, Azure OpenAI, Mistral, Groq,
  OpenRouter, Gemini, Anthropic, Ollama, Open WebUI ou tout endpoint compatible OpenAI. La clé
  est chiffrée, le contexte du parc est optionnel et l'assistant ne modifie jamais les données.
- **Assistant IA contextuel** : bouton « Analyser avec l'IA » sur une fiche équipement, une demande
  IT ou un poste de la page Logiciels. Contexte ciblé (état, garantie, affectation, mises à jour
  WAPT, description, commentaires, équipements liés), actions rapides, réponses mises en forme et
  copie.
- **Outils IA de lecture** : l'assistant interroge réellement le parc, les équipements en panne ou
  à renouveler, les garanties, les demandes ouvertes ou en retard, les mises à jour WAPT, les
  logiciels d'un poste, les contrats, les partages réseau, les incidents, les certificats,
  l'infrastructure, les utilisateurs et l'activité récente. Les outils respectent les permissions
  et les portées de données, et restent en lecture seule.
- Toute mutation est auditée.

## 9. Feuille de route

| Phase | Contenu | État |
|---|---|---|
| Phase 1 | Audit et conception | Terminée |
| Phase 2 | Socle technique, auth, rôles, dashboard, administration | **Terminée** |
| Phase 3 | Référentiels, agents, parc enrichi WAPT, téléphonie, imports, QR codes, exports, fournisseurs, licences, stock, demandes IT, interventions, contrats, budget | **Livrée** |
| Phase 4 | Infrastructure, cybersécurité, projets, RGPD, documentation | **Livrée** |
| Phase 5 | Assistant IA multi-fournisseurs (OpenAI, Mistral, Gemini, Anthropic, Ollama, Open WebUI) | **Livrée** |
| Phase 6 | Automatisations, notifications, exports, sauvegardes, industrialisation | Planifiée |

Détail : [`docs/ROADMAP.md`](docs/ROADMAP.md).

## 10. Licence et propriété

Logiciel de pilotage du système d'information, personnalisable pour chaque structure.
Les composants open source conservent leurs licences respectives.
