# Assistant IA

## 1. Fournisseurs pris en charge

| Fournisseur | Type d'API | URL de base typique | Clé requise |
|---|---|---|---|
| OpenAI | Compatible OpenAI | `https://api.openai.com/v1` | Oui |
| Azure OpenAI | Compatible OpenAI + `api-key` | `https://<ressource>.openai.azure.com/openai/deployments/<deploiement>` | Oui |
| Mistral AI | Compatible OpenAI | `https://api.mistral.ai/v1` | Oui |
| Groq | Compatible OpenAI | `https://api.groq.com/openai/v1` | Oui |
| OpenRouter | Compatible OpenAI | `https://openrouter.ai/api/v1` | Oui |
| Google Gemini | Compatible OpenAI | `https://generativelanguage.googleapis.com/v1beta/openai` | Oui |
| Anthropic Claude | API Messages | `https://api.anthropic.com/v1` | Oui |
| Albert API | Compatible OpenAI | `https://albert.api.etalab.gouv.fr/v1` | Oui |
| Ollama | Compatible OpenAI | `http://127.0.0.1:11434/v1` | Non |
| Open WebUI | Compatible OpenAI | `https://ai.example.org/api` | Selon l'instance |
| Autre | Compatible OpenAI | URL personnalisée | Selon le service |

## 2. Configuration

**Administration → Assistant IA** permet de renseigner :

- le fournisseur et l'URL de base ;
- le modèle ;
- la clé d'API (chiffrée avec `FIELD_ENCRYPTION_KEY`, jamais renvoyée par l'API) ;
- la température, le nombre maximal de jetons et le délai ;
- l'envoi ou non d'un contexte agrégé du parc.

Le bouton **Tester la connexion** envoie une requête minimale au fournisseur.

## 3. Contexte envoyé

Lorsque l'option est active, SI PILOT ajoute au prompt un résumé agrégé :

- nombre d'équipements actifs, répartition par statut et catégorie ;
- équipements en panne, à renouveler et garanties à moins de 180 jours ;
- logiciels suivis, postes avec mises à jour et principales mises à jour WAPT ;
- demandes ouvertes et en retard ;
- contrats à échéance sous 90 jours ;
- partages réseau en alerte.

Les secrets, clés d'API, mots de passe et données personnelles détaillées ne sont pas inclus.

### 3 bis. Outils de lecture

L'assistant sélectionne automatiquement des outils en lecture seule selon la question :

- vue d'ensemble du parc, recherche d'équipements, pannes, renouvellements, garanties ;
- demandes ouvertes, demandes en retard, recherche de demandes ;
- mises à jour WAPT, logiciels installés sur un poste ;
- contrats à échéance, partages réseau, incidents de sécurité, certificats ;
- devis et bons de commande : devis en attente, conversion, montants, livraisons et numéros
  d'engagement (`commercial_overview`) ;
- infrastructure, utilisateurs et agents, activité récente ;
- jobs, sessions et dépôts de sauvegarde Veeam (`veeam_backup_status`) ;
- découverte réseau limitée aux plages privées et rapprochement avec le parc (`network_discovery`) ;
- briefing du jour : contrôles, sauvegardes, Veeam, dernières exécutions et alertes (`daily_briefing`) ;
- bilan du mois précédent pour préparer une synthèse (`monthly_report_summary`).

Chaque outil vérifie les permissions et applique la portée de données (`all`, `service`, `own`)
pour les équipements et les demandes. Les résultats sont tronqués et les outils utilisés sont
affichés dans la réponse.

## 4. Usages pour la gestion du parc

- Bilan mensuel du parc et synthèse pour la direction.
- Identification des postes en panne, à renouveler ou hors garantie.
- Suivi des mises à jour WAPT et des logiciels à déployer.
- Analyse des demandes ouvertes, retards et priorités.
- Anticipation des échéances de contrats et de garanties.
- Rédaction de comptes rendus, communications et procédures.
- Aide à la qualification d'un incident ou d'une demande.
- Préparation d'un plan d'action sécurité ou RGPD.

## 5. Garde-fous

- L'assistant ne modifie aucune donnée sans confirmation.
- Les actions proposées doivent être confirmées dans l'interface et sont soumises aux permissions.
- Chaque échange est journalisé dans `ai_runs` (demande, statut, durée, modèle), sans clé d'API.
- L'intégration est facultative : SI PILOT fonctionne sans assistant IA.
- Pour un usage souverain, privilégier Ollama ou une instance interne compatible OpenAI.

## 6. API

- `GET /api/v1/ai/status` : état de l'intégration (`ai.use`).
- `GET /api/v1/ai/tools` : outils disponibles selon les permissions (`ai.use`).
- `POST /api/v1/ai/chat` : conversation (`ai.use`).
- `POST /api/v1/ai/actions/execute` : exécution d'une action proposée, après confirmation (`ai.use` + permission de l'action : `actions.create`, `tickets.create`, `meetings.manage`, `communications.manage` ou `suppliers.manage`). Les actions `create_quote` et `create_purchase_order` créent un devis ou un bon de commande ; le numéro d'engagement est obligatoire pour un bon de commande et n'est jamais inventé par l'IA.
- `GET /api/v1/admin/ai/models` : liste des modèles du fournisseur (`ai.configure`).
- `POST /api/v1/documents/analyze` : analyse IA d'un document (`documents.create` + `ai.use`).
- `POST /api/v1/documents/intake/{token}/integrate` : intégration du document analysé vers la documentation, un devis, un bon de commande, un contrat, une licence ou une facture budgétaire (`documents.create` + permission du module cible).
- `POST /api/v1/tickets/{id}/ai/triage` : résumé, qualification, doublons et réponse suggérée (`tickets.read`).
- `GET /api/v1/admin/ai/config` : configuration (`ai.configure`).
- `PUT /api/v1/admin/ai/config` : mise à jour (`ai.configure`).
- `POST /api/v1/admin/ai/test` : test de connexion (`ai.configure`).
