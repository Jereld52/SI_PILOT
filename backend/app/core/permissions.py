from dataclasses import dataclass


@dataclass(frozen=True)
class PermissionDefinition:
    code: str
    module: str
    action: str
    description: str


def _p(code: str, module: str, action: str, description: str) -> PermissionDefinition:
    return PermissionDefinition(code, module, action, description)


PERMISSION_DEFINITIONS: tuple[PermissionDefinition, ...] = (
    _p("dashboard.read", "dashboard", "read", "Consulter la vue générale"),
    _p("search.read", "search", "read", "Utiliser la recherche globale"),
    _p("notifications.read", "notifications", "read", "Consulter ses notifications"),
    _p("notifications.update", "notifications", "update", "Marquer ses notifications comme lues"),
    # Demandes IT
    _p("tickets.read", "tickets", "read", "Consulter les demandes IT"),
    _p("tickets.create", "tickets", "create", "Créer une demande IT"),
    _p("tickets.update", "tickets", "update", "Modifier une demande IT"),
    _p("tickets.assign", "tickets", "assign", "Assigner une demande IT"),
    _p("tickets.transition", "tickets", "transition", "Faire évoluer le statut d'une demande"),
    _p("tickets.close", "tickets", "close", "Clore une demande IT"),
    _p("tickets.comment", "tickets", "comment", "Commenter une demande IT"),
    _p("tickets.export", "tickets", "export", "Exporter les demandes IT"),
    _p("interventions.read", "interventions", "read", "Consulter les interventions"),
    _p("interventions.create", "interventions", "create", "Créer une intervention"),
    _p("interventions.update", "interventions", "update", "Modifier une intervention"),
    _p("interventions.delete", "interventions", "delete", "Supprimer une intervention"),
    # Parc
    _p("assets.read", "assets", "read", "Consulter le parc informatique"),
    _p("assets.create", "assets", "create", "Créer un équipement"),
    _p("assets.update", "assets", "update", "Modifier un équipement"),
    _p("assets.delete", "assets", "delete", "Archiver un équipement"),
    _p("assets.assign", "assets", "assign", "Affecter un équipement"),
    _p("assets.import", "assets", "import", "Importer des équipements"),
    _p("assets.export", "assets", "export", "Exporter le parc"),
    _p("assets.qr", "assets", "qr", "Générer les QR codes d'équipement"),
    # Agents
    _p("agents.read", "agents", "read", "Consulter les agents"),
    _p("agents.create", "agents", "create", "Créer un agent"),
    _p("agents.update", "agents", "update", "Modifier un agent"),
    _p("agents.delete", "agents", "delete", "Archiver un agent"),
    _p("agents.onboarding", "agents", "onboarding", "Gérer les arrivées"),
    _p("agents.offboarding", "agents", "offboarding", "Gérer les départs"),
    # Infrastructure
    _p("infrastructure.read", "infrastructure", "read", "Consulter l'infrastructure"),
    _p("infrastructure.create", "infrastructure", "create", "Créer un équipement d'infrastructure"),
    _p("infrastructure.update", "infrastructure", "update", "Modifier un équipement d'infrastructure"),
    _p("infrastructure.delete", "infrastructure", "delete", "Supprimer un équipement d'infrastructure"),
    _p("infrastructure.topology", "infrastructure", "topology", "Consulter la cartographie réseau"),
    _p("infrastructure.monitoring.authorize", "infrastructure", "monitoring.authorize", "Autoriser une supervision"),
    # Cybersécurité
    _p("security.read", "security", "read", "Consulter le suivi cybersécurité"),
    _p("security.create", "security", "create", "Créer un incident ou une action de sécurité"),
    _p("security.update", "security", "update", "Modifier un incident ou une action de sécurité"),
    _p("security.delete", "security", "delete", "Supprimer un élément de cybersécurité"),
    _p("security.manage", "security", "manage", "Administrer le module cybersécurité"),
    # Contrats
    _p("contracts.read", "contracts", "read", "Consulter les contrats"),
    _p("contracts.create", "contracts", "create", "Créer un contrat"),
    _p("contracts.update", "contracts", "update", "Modifier un contrat"),
    _p("contracts.delete", "contracts", "delete", "Archiver un contrat"),
    _p("contracts.export", "contracts", "export", "Exporter les contrats"),
    # Budget
    _p("budget.read", "budget", "read", "Consulter le budget"),
    _p("budget.create", "budget", "create", "Créer un budget ou une ligne"),
    _p("budget.update", "budget", "update", "Modifier le budget"),
    _p("budget.validate", "budget", "validate", "Valider un budget, un engagement ou une facture"),
    _p("budget.export", "budget", "export", "Exporter le budget"),
    # Projets
    _p("projects.read", "projects", "read", "Consulter les projets"),
    _p("projects.create", "projects", "create", "Créer un projet"),
    _p("projects.update", "projects", "update", "Modifier un projet"),
    _p("projects.delete", "projects", "delete", "Archiver un projet"),
    _p("projects.manage", "projects", "manage", "Gérer les jalons, tâches et risques"),
    # RGPD
    _p("rgpd.read", "rgpd", "read", "Consulter le registre RGPD"),
    _p("rgpd.create", "rgpd", "create", "Créer un traitement ou une collecte"),
    _p("rgpd.update", "rgpd", "update", "Modifier le registre RGPD"),
    _p("rgpd.delete", "rgpd", "delete", "Archiver un élément RGPD"),
    # Documentation
    _p("documents.read", "documents", "read", "Consulter la documentation"),
    _p("documents.create", "documents", "create", "Créer un document"),
    _p("documents.update", "documents", "update", "Modifier un document"),
    _p("documents.delete", "documents", "delete", "Archiver un document"),
    _p("documents.download", "documents", "download", "Télécharger un document"),
    _p("documents.acl", "documents", "acl", "Gérer les permissions documentaires"),
    # Calendrier et actions
    _p("calendar.read", "calendar", "read", "Consulter le calendrier"),
    _p("calendar.create", "calendar", "create", "Créer un événement"),
    _p("calendar.update", "calendar", "update", "Modifier un événement"),
    _p("calendar.delete", "calendar", "delete", "Supprimer un événement"),
    _p("actions.read", "actions", "read", "Consulter les actions"),
    _p("actions.create", "actions", "create", "Créer une action"),
    _p("actions.update", "actions", "update", "Modifier une action"),
    _p("actions.complete", "actions", "complete", "Terminer une action"),
    # Automatisations
    _p("automations.read", "automations", "read", "Consulter les automatisations"),
    _p("automations.create", "automations", "create", "Créer une automatisation"),
    _p("automations.update", "automations", "update", "Modifier une automatisation"),
    _p("automations.delete", "automations", "delete", "Supprimer une automatisation"),
    _p("automations.run", "automations", "run", "Exécuter une automatisation"),
    # Imports / exports
    _p("imports.preview", "imports", "preview", "Prévisualiser un import"),
    _p("imports.apply", "imports", "apply", "Appliquer un import"),
    _p("exports.run", "exports", "run", "Générer un export"),
    # Administration
    _p("admin.users.read", "admin", "users.read", "Consulter les utilisateurs"),
    _p("admin.users.manage", "admin", "users.manage", "Gérer les utilisateurs"),
    _p("admin.roles.read", "admin", "roles.read", "Consulter les rôles"),
    _p("admin.roles.manage", "admin", "roles.manage", "Gérer les rôles et permissions"),
    _p("admin.settings.read", "admin", "settings.read", "Consulter les paramètres"),
    _p("admin.settings.manage", "admin", "settings.manage", "Gérer les paramètres"),
    _p("admin.backup.manage", "admin", "backup.manage", "Gérer les sauvegardes"),
    _p("audit.read", "audit", "read", "Consulter le journal d'audit"),
    # SylvIA
    _p("sylvia.use", "sylvia", "use", "Utiliser l'assistant SylvIA"),
    _p("sylvia.configure", "sylvia", "configure", "Configurer la connexion SylvIA"),
)

ALL_PERMISSION_CODES = frozenset(item.code for item in PERMISSION_DEFINITIONS)

# Permissions opérationnelles accordées par défaut aux rôles.
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "admin": ALL_PERMISSION_CODES,
    "si_manager": ALL_PERMISSION_CODES
    - {
        "admin.roles.manage",
        "admin.settings.manage",
        "admin.backup.manage",
        "sylvia.configure",
    },
    "technician": frozenset(
        {
            "dashboard.read",
            "search.read",
            "notifications.read",
            "notifications.update",
            "tickets.read",
            "tickets.create",
            "tickets.update",
            "tickets.assign",
            "tickets.transition",
            "tickets.close",
            "tickets.comment",
            "tickets.export",
            "interventions.read",
            "interventions.create",
            "interventions.update",
            "assets.read",
            "assets.create",
            "assets.update",
            "assets.assign",
            "assets.export",
            "assets.qr",
            "agents.read",
            "infrastructure.read",
            "infrastructure.create",
            "infrastructure.update",
            "infrastructure.topology",
            "security.read",
            "security.create",
            "security.update",
            "contracts.read",
            "projects.read",
            "projects.create",
            "projects.update",
            "projects.manage",
            "documents.read",
            "documents.create",
            "documents.update",
            "documents.download",
            "calendar.read",
            "calendar.create",
            "calendar.update",
            "actions.read",
            "actions.create",
            "actions.update",
            "actions.complete",
            "automations.read",
            "exports.run",
            "sylvia.use",
        }
    ),
    "reader": frozenset(
        {
            "dashboard.read",
            "search.read",
            "notifications.read",
            "notifications.update",
            "tickets.read",
            "interventions.read",
            "assets.read",
            "agents.read",
            "infrastructure.read",
            "infrastructure.topology",
            "security.read",
            "contracts.read",
            "budget.read",
            "projects.read",
            "documents.read",
            "documents.download",
            "calendar.read",
            "actions.read",
        }
    ),
    "user": frozenset(
        {
            "dashboard.read",
            "search.read",
            "notifications.read",
            "notifications.update",
            "tickets.read",
            "tickets.create",
            "tickets.comment",
            "assets.read",
            "agents.read",
            "documents.read",
            "documents.download",
            "calendar.read",
            "actions.read",
        }
    ),
}

ROLE_DEFINITIONS: tuple[dict[str, str | bool], ...] = (
    {
        "code": "admin",
        "name": "Administrateur",
        "description": "Accès complet, administration des comptes, rôles, paramètres et sauvegardes.",
        "data_scope_default": "all",
        "is_system": True,
    },
    {
        "code": "si_manager",
        "name": "Responsable informatique",
        "description": "Pilotage complet du SI, validation budgétaire, sécurité et RGPD.",
        "data_scope_default": "all",
        "is_system": True,
    },
    {
        "code": "technician",
        "name": "Technicien",
        "description": "Exploitation du parc, des demandes, des interventions et de l'infrastructure.",
        "data_scope_default": "service",
        "is_system": True,
    },
    {
        "code": "reader",
        "name": "Lecteur",
        "description": "Consultation et rapports, sans modification.",
        "data_scope_default": "all",
        "is_system": True,
    },
    {
        "code": "user",
        "name": "Utilisateur",
        "description": "Portail agent : demandes personnelles, équipements affectés et documentation publique.",
        "data_scope_default": "own",
        "is_system": True,
    },
)


def has_permission(user: object, code: str) -> bool:
    """Vérifie une permission en tenant compte des surcharges utilisateur."""
    role = getattr(user, "role", None)
    if role is None:
        return False
    codes = {permission.code for permission in getattr(role, "permissions", [])}
    for override in getattr(user, "permission_overrides", []):
        if override.permission is None:
            continue
        if override.permission.code == code:
            if override.effect == "deny":
                codes.discard(code)
            elif override.effect == "allow":
                codes.add(code)
    return code in codes


def permission_codes(user: object) -> set[str]:
    role = getattr(user, "role", None)
    if role is None:
        return set()
    codes = {permission.code for permission in getattr(role, "permissions", [])}
    for override in getattr(user, "permission_overrides", []):
        if override.permission is None:
            continue
        if override.effect == "deny":
            codes.discard(override.permission.code)
        elif override.effect == "allow":
            codes.add(override.permission.code)
    return codes
