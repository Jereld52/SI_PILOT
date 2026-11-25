# Veille et planification

SI PILOT peut exécuter seul les tâches d'exploitation courantes :

- contrôles de supervision ;
- vérification Veeam ;
- sauvegarde complète de SI PILOT ;
- digest quotidien par e-mail.

Le planificateur fonctionne **dans l'application** : SI PILOT doit donc être démarré en
permanence. Pour un serveur, installez l'application comme service Windows ou Linux plutôt que
de la lancer dans une fenêtre.

## 1. Configuration

**Administration → Système & IA → Veille & planification**

- **Activer la veille automatique** : démarre le planificateur.
- **Fréquence de vérification des contrôles** : fréquence à laquelle le planificateur regarde
  quels contrôles sont dus. Chaque contrôle conserve son propre intervalle.
- **Vérification Veeam** : heure quotidienne et seuil d'ancienneté des sauvegardes.
- **Sauvegarde SI PILOT** : quotidienne ou hebdomadaire, heure, rétention et nombre minimal
  d'archives conservées.
- **Digest quotidien** : heure et destinataires. Vide = tous les administrateurs actifs.

Les heures sont exprimées dans le fuseau horaire du serveur. Après enregistrement, le
planificateur est rechargé immédiatement.

## 2. Contrôles automatiques

Le planificateur exécute les contrôles **activés et autorisés** de la page Infrastructure →
Supervision, lorsque leur intervalle est écoulé.

Types pris en charge :

| Type | Configuration JSON | Exemple |
|---|---|---|
| `ping` | `timeout_seconds` | `{}` |
| `tcp` | `port`, `timeout_seconds` | `{"port": 443}` |
| `http` | `url` ou `port`/`path`, `expected_status`, `verify_tls` | `{"port": 443, "path": "/health", "expected_status": 200}` |
| `snmp` | `community`, `oid`, `port`, `timeout_seconds` | `{"community": "public", "oid": "1.3.6.1.2.1.1.3.0"}` |

Le type `agent` n'est pas encore exécuté par le planificateur : il est enregistré comme
« inconnu » sans bloquer les autres contrôles.

Chaque exécution crée un résultat dans l'historique de l'équipement. Un passage de « OK » à
« en échec » crée une notification pour les administrateurs ; le rétablissement crée aussi une
notification.

## 3. Vérification Veeam

La tâche quotidienne lit l'API Veeam et signale :

- job en échec ou en avertissement ;
- job sans session ou dont la dernière session dépasse le seuil d'ancienneté ;
- dépôt sous 10 % (critique) ou 15 % (avertissement) d'espace libre ;
- notes remontées par le connecteur.

Le résultat est conservé dans le journal et repris dans le digest. L'intégration reste en
lecture seule.

## 4. Sauvegarde SI PILOT

La sauvegarde planifiée crée une **archive complète** :

- dump PostgreSQL ;
- configuration JSON ;
- fichiers téléversés (documents, logos, etc.).

Les archives sont écrites dans `.runtime/backups`. La rétention supprime les archives plus
anciennes que le nombre de jours configuré, tout en conservant toujours le minimum indiqué.

La tâche vérifie aussi la disponibilité de `pg_dump`. En cas d'échec, l'erreur est visible dans
le journal et le digest suivant.

## 5. Digest quotidien

Le digest est envoyé aux destinataires configurés, ou aux administrateurs actifs si le champ est
vide. Il contient :

- synthèse des contrôles (OK, en échec, inconnus) et détail des échecs ;
- alertes Veeam ;
- dernière sauvegarde SI PILOT et ancienneté ;
- dix principales alertes du tableau de bord (incidents, pannes, échéances, etc.).

Le SMTP doit être activé dans **Administration → Paramètres → Serveur SMTP**. Les envois sont
tracés dans la boîte d'envoi interne.

## 6. Journal et exécution manuelle

La page affiche les 25 dernières exécutions : tâche, déclencheur, durée, statut et résumé.

Chaque tâche peut être lancée manuellement avec **Exécuter maintenant**. Les exécutions
manuelles sont auditées et n'attendent pas l'heure planifiée. Pour les contrôles, le lancement
manuel force l'exécution de tous les contrôles activés et autorisés.

## 7. API

| Route | Permission |
|---|---|
| `GET /api/v1/admin/scheduler/config` | `admin.settings.read` |
| `PUT /api/v1/admin/scheduler/config` | `admin.settings.manage` |
| `GET /api/v1/admin/scheduler/runs` | `admin.settings.read` |
| `POST /api/v1/admin/scheduler/run/{job}` | `admin.settings.manage` |

Tâches : `checks`, `veeam`, `backup`, `digest`.

## 8. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| Aucune exécution planifiée | Veille désactivée ou application arrêtée | Activer la veille et vérifier que SI PILOT tourne |
| Contrôles jamais exécutés | Contrôle non activé ou non autorisé | Vérifier Infrastructure → Supervision |
| Digest non envoyé | SMTP désactivé ou non configuré | Tester le SMTP dans Administration → Paramètres |
| Sauvegarde en erreur | `pg_dump` introuvable | Vérifier le chemin PostgreSQL ou `PG_BIN_DIR` |
| Veeam ignoré | Connexion Veeam désactivée ou incomplète | Vérifier Administration → Connexion Veeam |

## 9. Limites

- Un seul processus d'application est supposé. Avec plusieurs workers, les tâches pourraient
  être exécutées plusieurs fois.
- Les heures utilisent le fuseau du serveur.
- Le digest est un e-mail texte, sans pièce jointe.
- Le planificateur ne redémarre pas l'application en cas d'arrêt.
