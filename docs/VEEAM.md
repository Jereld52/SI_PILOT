# Sauvegardes Veeam

SI PILOT se connecte à **Veeam Backup & Replication 12** par son API REST pour afficher les
sauvegardes dans l'application. L'intégration est **strictement en lecture seule** : aucun
lancement, arrêt ou restauration de job n'est possible depuis SI PILOT.

## 1. Prérequis côté Veeam

| Élément | Valeur |
|---|---|
| Produit | Veeam Backup & Replication 12 (VBR) |
| API | REST API, port **9419** par défaut |
| URL type | `https://serveur-veeam:9419` |
| Compte | Compte de service dédié, rôle **Veeam Backup Viewer** minimum |
| Réseau | Le serveur SI PILOT doit joindre le serveur Veeam sur le port 9419 |

Le service API REST doit être démarré sur le serveur VBR. Vérifier également que le certificat
TLS présenté par Veeam est valide, ou désactiver la vérification dans SI PILOT si l'installation
utilise un certificat interne.

## 2. Configuration dans SI PILOT

**Administration → Données & intégrations → Connexion Veeam**

- **URL de l'API REST** : `https://serveur-veeam:9419`, sans `/api` à la fin.
- **Identifiant** et **mot de passe** du compte de service.
- **Version de l'API** :
  - `1.2-rev1` pour VBR 12.0 ;
  - `1.3-rev1` pour VBR 12.1 et 12.3.
- **Vérifier le certificat TLS** : à désactiver uniquement pour un certificat auto-signé maîtrisé.
- **Délai maximal** : 30 secondes par défaut.

Le mot de passe est chiffré avec `FIELD_ENCRYPTION_KEY` et n'est jamais renvoyé par l'API.
Le bouton **Tester la connexion** authentifie le compte et compte les jobs accessibles.

## 3. Page Infrastructure → Sauvegardes

La page présente :

- **Indicateurs** : nombre de jobs, derniers runs réussis, avertissements, jobs en échec.
- **Points d'attention** : jobs en échec ou en avertissement, dépôts sous 15 % d'espace libre,
  notes remontées par le connecteur.
- **Jobs** : nom, type, état, dernier résultat, date et durée de la dernière session, message.
- **Sessions** : 25 dernières exécutions, avec état, durée et message d'erreur.
- **Dépôts** : capacité, espace libre et taux d'occupation.

Les données sont mises en cache **60 secondes**. Le bouton **Actualiser** force une nouvelle
lecture.

## 4. API et authentification

Le connecteur utilise :

1. `POST /api/oauth2/token` avec `grant_type=password`, l'identifiant et le mot de passe ;
2. l'en-tête `Authorization: Bearer <token>` ;
3. l'en-tête `x-api-version` avec la version configurée.

Endpoints lus :

| Données | Endpoint |
|---|---|
| Jobs | `GET /api/v1/jobs` |
| Sessions | `GET /api/v1/sessions` |
| Dépôts | `GET /api/v1/backupInfrastructure/repositories` |
| États des dépôts | `GET /api/v1/backupInfrastructure/repositories/states` |

Le jeton est conservé en mémoire jusqu'à son expiration. En cas de réponse 401, le connecteur
renouvelle automatiquement le jeton une fois.

## 5. Permissions

| Action | Permission |
|---|---|
| Lire la page Sauvegardes | `security.read` |
| Lire la configuration Veeam | `admin.settings.read` |
| Modifier la configuration et tester | `admin.settings.manage` |

Les actions de configuration et les tests de connexion sont journalisés dans le journal d'audit.

## 6. Assistant IA

L'outil `veeam_backup_status` est disponible pour les utilisateurs disposant de `security.read`.
Il remonte les compteurs, les jobs en échec ou en avertissement, les dépôts presque pleins et les
notes du connecteur.

Exemples de questions :

- « Quelles sauvegardes ont échoué cette semaine ? »
- « Reste-t-il assez d'espace sur les dépôts Veeam ? »
- « Résume l'état des sauvegardes pour le rapport mensuel. »

## 7. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `Connexion Veeam impossible` | API REST arrêtée, port fermé ou URL erronée | Vérifier le service VBR et le port 9419 |
| `Authentification Veeam refusée (401)` | Identifiant ou mot de passe incorrect | Recréer ou corriger le compte de service |
| `Veeam a répondu 400` sur les jobs | Version d'API incompatible | Essayer `1.3-rev1` ou `1.2-rev1` |
| Dépôts absents + note | Compte Viewer sans accès aux dépôts | Utiliser un compte disposant du droit de lecture des dépôts |
| Erreur de certificat TLS | Certificat auto-signé | Désactiver la vérification TLS ou installer l'autorité interne |

## 8. Limites de la Vague 1

- Lecture seule : aucune action de sauvegarde ou de restauration.
- Pas de création automatique de tickets sur échec.
- Pas de rapport planifié : utiliser les exports et l'assistant IA.
- Les points de restauration par machine ne sont pas encore exposés.
