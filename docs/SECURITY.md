# Sécurité

## 1. Principes

- Défense en profondeur : authentification, permissions, portée de données, audit.
- Deny by default : une permission absente signifie un accès refusé.
- Moindre privilège : rôles système, permissions granulaires, comptes administrateurs limités.
- Minimisation : ne collecter et ne transmettre que le nécessaire.
- Traçabilité : toute mutation, connexion, export et action SylvIA est auditée.
- Séparation des secrets : variables d'environnement, jamais en base ni dans le dépôt.

## 2. Authentification

- Mots de passe hachés avec **Argon2id** (mémoire 64 Mo, 3 passes, parallélisme 4).
- Longueur minimale 12 caractères, majuscule, minuscule, chiffre.
- Verrouillage temporaire après 5 échecs (15 minutes) et limitation de débit.
- Sessions **opaques** stockées hachées en base, cookie `HttpOnly`, `Secure` en production,
  `SameSite=Lax`.
- Expiration glissante 8 h, absolue 7 jours, révocation immédiate.
- Révocation de toutes les sessions lors d'un changement de mot de passe, d'un changement de
  rôle ou d'une désactivation.
- CSRF double-submit sur toutes les mutations.
- MFA TOTP prévu pour les administrateurs en V1.1.

## 3. Autorisation

- RBAC : 5 rôles, 95 permissions `module.action`.
- Portées de données : `all`, `service`, `own`.
- Surcharges utilisateur `allow`/`deny` auditée.
- Vérification côté serveur dans la dépendance FastAPI **et** dans le service métier.
- L'interface masque les actions non autorisées mais ne constitue jamais la protection.
- Le rôle Administrateur est verrouillé pour éviter la perte d'accès ; le dernier administrateur
  actif ne peut pas être désactivé.

## 4. Journal d'audit

- Table append-only, droits `UPDATE`/`DELETE` à retirer au rôle applicatif en production.
- Chaînage de hash : chaque entrée contient `hash_prev` et `hash`.
- Champs : acteur, date, module, action, élément, avant, après, IP, user-agent, request_id.
- Export périodique vers un emplacement distinct recommandé.
- Conservation proposée : 5 ans (à valider avec le DPO).

## 5. Données et fichiers

- Aucun mot de passe d'agent ou de compte externe stocké.
- Pièces jointes hors racine web, nom aléatoire, type MIME contrôlé, taille limitée,
  empreinte SHA-256, antivirus optionnel.
- Suppression logique ou anonymisation pour les données soumises à conservation.
- Aucune donnée de production dans l'environnement de développement.
- Aucune donnée fictive en production.

## 6. SylvIA

- Intégration **désactivée par défaut**, isolée dans `app/integrations/sylvia`.
- Aucun endpoint inventé : la documentation réelle d'Open WebUI / Ollama doit être fournie.
- Données minimisées, pseudonymisées si nécessaire, aperçu avant envoi.
- Aucune écriture directe en base par SylvIA.
- Toute proposition doit être validée par un utilisateur habilité et exécutée par un service
  métier avec contrôle de permission.
- Journalisation des requêtes, timeouts, gestion d'erreur, circuit breaker.
- L'application reste pleinement fonctionnelle sans SylvIA.

## 7. Infrastructure

- HTTPS obligatoire hors réseau local isolé ; HSTS en production.
- En-têtes de sécurité : CSP, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`.
- PostgreSQL accessible uniquement en local ou sur le réseau interne.
- Utilisateur base dédié, sans superutilisateur.
- Sauvegardes chiffrées et testées.
- Mises à jour planifiées, `pip-audit` et `npm audit`.
- Aucun scan réseau sans autorisation écrite et tracée.

## 8. Cible de maturité

OWASP ASVS niveau 2. Les points non couverts en Phase 2 (MFA, LDAP, antivirus, WAF) sont
planifiés et documentés dans la feuille de route.

## 9. Signaler un incident

1. Ne pas supprimer les journaux.
2. Désactiver l'accès concerné depuis Administration → Utilisateurs.
3. Révoquer les sessions.
4. Créer un incident dans le module Cybersécurité (Phase 4) ou consigner l'événement.
5. Informer le Responsable SI et, si nécessaire, le DPO.
6. Conserver les preuves et l'horodatage.
