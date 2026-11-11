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
- infrastructure, utilisateurs et agents, activité récente.

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

- L'assistant ne modifie aucune donnée.
- Les actions proposées doivent être réalisées dans l'application par un utilisateur habilité.
- Chaque échange est journalisé dans `ai_runs` (demande, statut, durée, modèle), sans clé d'API.
- L'intégration est facultative : SI PILOT fonctionne sans assistant IA.
- Pour un usage souverain, privilégier Ollama ou une instance interne compatible OpenAI.

## 6. API

- `GET /api/v1/ai/status` : état de l'intégration (`ai.use`).
- `GET /api/v1/ai/tools` : outils disponibles selon les permissions (`ai.use`).
- `POST /api/v1/ai/chat` : conversation (`ai.use`).
- `GET /api/v1/admin/ai/config` : configuration (`ai.configure`).
- `PUT /api/v1/admin/ai/config` : mise à jour (`ai.configure`).
- `POST /api/v1/admin/ai/test` : test de connexion (`ai.configure`).
