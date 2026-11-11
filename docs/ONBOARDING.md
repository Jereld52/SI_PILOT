# Arrivées et départs

## 1. Objectif

Suivre l'intégration et la sortie des agents avec un dossier, une checklist et des échéances,
sans automatiser les écritures sensibles dans Active Directory ni les affectations de matériel.

## 2. Dossiers

Un dossier est créé pour un agent et un type :

- **Arrivée** (`onboarding`) : compte, messagerie, poste, équipements, téléphonie, accès,
  charte, formation.
- **Départ** (`offboarding`) : désactivation, récupération du matériel, archivage, retrait des
  accès, sauvegarde, clôture des abonnements, mise à jour de l'inventaire.

Chaque dossier reprend un modèle de checklist. L'échéance est proposée à partir de la date
d'arrivée ou de départ de l'agent.

## 3. Suivi

- Chaque tâche est cochée avec une date de réalisation.
- Les tâches peuvent être obligatoires ou facultatives.
- La progression est calculée sur les tâches obligatoires.
- Un dossier passe automatiquement au statut **Terminé** quand toutes les tâches obligatoires
  sont faites. Il peut être rouvert.
- Un dossier peut être annulé ; il reste conservé.

## 4. Points d'attention

La page et l'API calculent :

- les arrivées à venir sans dossier d'arrivée ;
- les départs à venir sans dossier de départ ;
- les dossiers en retard ;
- les dossiers peu avancés ;
- les agents partis sans dossier de départ clôturé.

Ces points apparaissent dans la page **Arrivées & départs**, dans les alertes du tableau de bord
et dans l'outil IA `onboarding_briefing`.

## 5. API

- `GET /api/v1/onboarding/templates`
- `GET /api/v1/onboarding/runs`
- `POST /api/v1/onboarding/runs`
- `GET /api/v1/onboarding/runs/{id}`
- `PATCH /api/v1/onboarding/runs/{id}`
- `POST /api/v1/onboarding/runs/{id}/items/{item_id}`
- `GET /api/v1/onboarding/briefing`
- `GET /api/v1/onboarding/agents/{agent_id}/timeline`

Permissions : `agents.read` pour consulter, `agents.onboarding` ou `agents.offboarding` pour
gérer les dossiers.

## 6. Vague suivante

- Proposition de compte Active Directory (login, UPN, OU, groupes) avec validation.
- Recommandation de matériel selon le service, le site et le stock.
- Réservation du matériel et fiche de remise.
- Création des tâches et communications associées.
- Exécution assistée avec file d'approbation.
