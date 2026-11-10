import json
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import (
    PERMISSION_DEFINITIONS,
    ROLE_DEFINITIONS,
    ROLE_PERMISSIONS,
)
from app.models.assets import AssetCategory
from app.models.auth import Permission, Role
from app.models.budget import BudgetCategory
from app.models.contracts import ContractCategory
from app.models.documents import DocumentCategory
from app.models.organization import (
    ChecklistTemplate,
    ChecklistTemplateItem,
)
from app.models.setting import Setting
from app.models.tickets import TicketCategory, TicketPriority, TicketStatus

TICKET_CATEGORIES = (
    ("hardware", "Matériel", 48),
    ("software", "Logiciel", 72),
    ("network", "Réseau", 24),
    ("telephony", "Téléphonie", 48),
    ("messaging", "Messagerie", 24),
    ("accounts", "Comptes", 24),
    ("security", "Sécurité", 8),
    ("printing", "Impression", 48),
    ("support", "Assistance", 72),
    ("other", "Autre", 72),
)

TICKET_STATUSES = (
    ("new", "Nouveau", False, "#38BDF8", 10),
    ("to_qualify", "À qualifier", False, "#FBBF24", 20),
    ("in_progress", "En cours", False, "#22D3EE", 30),
    ("waiting_user", "En attente utilisateur", False, "#A78BFA", 40),
    ("waiting_provider", "En attente prestataire", False, "#FB923C", 50),
    ("resolved", "Résolu", False, "#34D399", 60),
    ("closed", "Clos", True, "#94A3B8", 70),
)

TICKET_PRIORITIES = (
    ("low", "Basse", 4, "#94A3B8", 24, 120),
    ("medium", "Moyenne", 3, "#38BDF8", 8, 72),
    ("high", "Haute", 2, "#FBBF24", 4, 24),
    ("critical", "Critique", 1, "#F87171", 1, 8),
)

ASSET_CATEGORIES = (
    ("desktop", "PC fixe", True, False, False, 60, "PC"),
    ("laptop", "PC portable", True, False, True, 48, "PORT"),
    ("monitor", "Écran", False, False, False, 84, "ECR"),
    ("smartphone", "Smartphone", False, False, True, 36, "TEL"),
    ("tablet", "Tablette", False, False, True, 48, "TAB"),
    ("printer", "Imprimante", False, False, True, 72, "IMP"),
    ("server", "Serveur", False, True, True, 60, "SRV"),
    ("switch", "Switch", False, True, True, 84, "SW"),
    ("router", "Routeur", False, True, True, 84, "RTR"),
    ("nas", "NAS", False, True, True, 60, "NAS"),
    ("peripheral", "Périphérique", False, False, False, 60, "PER"),
    ("ups", "Onduleur", False, True, False, 84, "UPS"),
    ("access_point", "Point d'accès Wi-Fi", False, True, True, 72, "WAP"),
    ("firewall", "Pare-feu", False, True, True, 60, "FW"),
    ("vm", "Machine virtuelle", False, True, True, 60, "VM"),
)

CONTRACT_CATEGORIES = (
    ("maintenance", "Maintenance"),
    ("telephony", "Téléphonie"),
    ("internet", "Internet"),
    ("licenses", "Licences"),
    ("antivirus", "Antivirus"),
    ("hosting", "Hébergement"),
    ("printers", "Imprimantes"),
    ("backups", "Sauvegardes"),
    ("managed_services", "Infogérance"),
    ("other", "Autre"),
)

BUDGET_CATEGORIES = (
    ("hardware", "Matériel"),
    ("software", "Logiciels"),
    ("telephony", "Téléphonie"),
    ("network", "Réseau"),
    ("security", "Sécurité"),
    ("services", "Prestations"),
    ("maintenance", "Maintenance"),
    ("infrastructure", "Infrastructure"),
    ("ai", "IA"),
    ("training", "Formation"),
    ("other", "Divers"),
)

DOCUMENT_CATEGORIES = (
    ("procedure", "Procédures"),
    ("user_guide", "Guides utilisateurs"),
    ("technical_sheet", "Fiches techniques"),
    ("diagram", "Schémas"),
    ("configuration", "Configurations"),
    ("minutes", "Comptes rendus"),
    ("supplier", "Documentation fournisseurs"),
    ("security", "Documents sécurité"),
)

DEFAULT_SETTINGS = (
    ("app.name", "SI PILOT", "general", False, "Nom affiché de l'application"),
    ("app.organization", "Votre structure", "general", False, "Nom de la structure ou de l'organisation"),
    ("app.tagline", "Cockpit du système d'information", "general", False, "Accroche affichée sur l'écran de connexion"),
    (
        "app.description",
        "Centralisez votre parc, vos demandes, vos contrats, votre budget, vos projets et votre sécurité dans un outil unique.",
        "general",
        False,
        "Description courte de l'application",
    ),
    ("app.support_email", None, "general", False, "Adresse de contact affichée aux utilisateurs"),
    ("app.primary_color", "#772B2F", "general", False, "Couleur principale de l'interface et des exports"),
    ("app.logo_filename", None, "general", False, "Logo personnalisé de l'application"),
    ("app.logo_version", None, "general", False, "Version technique du logo personnalisé"),
    ("app.timezone", "Europe/Paris", "general", False, "Fuseau horaire d'affichage"),
    ("app.currency", "EUR", "general", False, "Devise utilisée pour les montants"),
    ("dashboard.renewal_threshold", 70, "dashboard", False, "Seuil du score de renouvellement"),
    ("dashboard.contract_alert_days", [180, 90, 60, 30], "dashboard", False, "Seuils d'alerte contrats"),
    ("alerts.ticket_stale_days", 7, "alerts", False, "Délai avant alerte ticket ancien"),
    ("alerts.asset_unassigned_days", 30, "alerts", False, "Délai avant alerte équipement non affecté"),
    ("security.session_timeout_minutes", 480, "security", False, "Expiration de session par inactivité"),
    ("security.password_min_length", 12, "security", False, "Longueur minimale des mots de passe"),
    ("notifications.email_enabled", False, "notifications", False, "Activation des notifications e-mail"),
    ("smtp.host", "", "notifications", False, "Serveur SMTP externe"),
    ("smtp.port", 587, "notifications", False, "Port SMTP"),
    ("smtp.username", "", "notifications", False, "Identifiant SMTP"),
    ("smtp.password_encrypted", "", "notifications", True, "Mot de passe SMTP, chiffré"),
    ("smtp.use_tls", True, "notifications", False, "Utiliser STARTTLS"),
    ("smtp.use_ssl", False, "notifications", False, "Connexion SMTP SSL directe"),
    ("smtp.from_email", "", "notifications", False, "Adresse d'expédition"),
    ("smtp.from_name", "SI PILOT", "notifications", False, "Nom de l'expéditeur"),
    ("wapt.enabled", False, "wapt", False, "Activer la connexion au serveur WAPT"),
    ("wapt.base_url", "", "wapt", False, "URL du serveur WAPT"),
    ("wapt.username", "", "wapt", False, "Identifiant WAPT"),
    ("wapt.password_encrypted", "", "wapt", True, "Mot de passe WAPT, chiffré"),
    ("wapt.verify_tls", True, "wapt", False, "Vérifier le certificat TLS WAPT"),
    ("wapt.hosts_path", "/api/v1/hosts", "wapt", False, "Chemin API de la liste des postes"),
    ("wapt.host_detail_path", "/api/v1/hosts?uuid={uuid}", "wapt", False, "Chemin API du détail d'un poste"),
    ("wapt.fetch_details", False, "wapt", False, "Récupérer l'inventaire détaillé de chaque poste"),
    ("wapt.packages_path", "/api/v3/packages", "wapt", False, "Chemin API des paquets WAPT"),
    ("wapt.host_packages_path", "/api/v1/host_data?uuid={uuid}&field=installed_packages", "wapt", False, "Chemin API des paquets installés"),
    ("wapt.install_path", "/api/v1/hosts/{uuid}/install", "wapt", False, "Chemin API d'installation"),
    ("wapt.uninstall_path", "/api/v1/hosts/{uuid}/uninstall", "wapt", False, "Chemin API de désinstallation"),
    ("wapt.trigger_action_path", "/api/v3/trigger_host_action", "wapt", False, "Chemin API des actions signées"),
    ("wapt.signing_key_path", "", "wapt", False, "Chemin de la clé privée de signature WAPT"),
    ("wapt.signing_cert_path", "", "wapt", False, "Chemin du certificat de signature WAPT"),
    ("wapt.signing_key_password_encrypted", "", "wapt", True, "Mot de passe de la clé privée WAPT, chiffré"),
    ("wapt.package_field", "package", "wapt", False, "Nom du champ paquet dans les requêtes"),
    ("wapt.timeout_seconds", 30, "wapt", False, "Délai maximal des appels WAPT"),
    ("ai.enabled", False, "ai", False, "Activation de l'assistant IA"),
    ("ai.base_url", "", "ai", False, "URL de base Open WebUI / Ollama"),
    ("ai.model", "", "ai", False, "Modèle utilisé par l'assistant IA"),
    ("ldap.enabled", False, "ldap", False, "Activer la synchronisation Active Directory"),
    ("ldap.url", "", "ldap", False, "URL du serveur LDAP (ldap:// ou ldaps://)"),
    ("ldap.base_dn", "", "ldap", False, "Base de recherche des utilisateurs"),
    ("ldap.bind_dn", "", "ldap", False, "Compte de service utilisé pour la lecture"),
    ("ldap.bind_password_encrypted", "", "ldap", True, "Mot de passe du compte de service, chiffré"),
    (
        "ldap.user_filter",
        "(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))",
        "ldap",
        False,
        "Filtre LDAP des utilisateurs actifs",
    ),
    ("ldap.tls_verify", True, "ldap", False, "Vérifier le certificat TLS du serveur LDAP"),
)

CHECKLIST_TEMPLATES = (
    {
        "code": "onboarding",
        "name": "Arrivée d'un agent",
        "type": "onboarding",
        "description": "Procédure standard d'arrivée.",
        "items": (
            "Créer le compte annuaire",
            "Créer la boîte messagerie",
            "Préparer et configurer le poste",
            "Affecter les équipements",
            "Configurer la téléphonie",
            "Ouvrir les accès aux applications métier",
            "Remettre la charte informatique",
            "Former l'agent aux usages et à la sécurité",
        ),
    },
    {
        "code": "offboarding",
        "name": "Départ d'un agent",
        "type": "offboarding",
        "description": "Procédure standard de départ.",
        "items": (
            "Désactiver le compte annuaire",
            "Récupérer les équipements",
            "Archiver la boîte messagerie",
            "Retirer les accès applicatifs",
            "Sauvegarder les données professionnelles",
            "Clôturer les comptes et abonnements",
            "Mettre à jour l'inventaire",
        ),
    },
)


def _now() -> datetime:
    return datetime.now(UTC)


def _upsert_code(db: Session, model, code: str, values: dict) -> object:
    instance = db.scalar(select(model).where(model.code == code))
    if instance is None:
        instance = model(code=code, **values)
        db.add(instance)
    else:
        for key, value in values.items():
            setattr(instance, key, value)
    return instance


def seed_reference_data(db: Session) -> dict[str, int]:
    stats = {"permissions": 0, "roles": 0, "categories": 0, "settings": 0, "templates": 0}

    permissions: dict[str, Permission] = {}
    for definition in PERMISSION_DEFINITIONS:
        permission = db.scalar(select(Permission).where(Permission.code == definition.code))
        if permission is None:
            permission = Permission(
                code=definition.code,
                module=definition.module,
                action=definition.action,
                description=definition.description,
            )
            db.add(permission)
            stats["permissions"] += 1
        else:
            permission.module = definition.module
            permission.action = definition.action
            permission.description = definition.description
        permissions[definition.code] = permission
    db.flush()

    for role_definition in ROLE_DEFINITIONS:
        role = db.scalar(select(Role).where(Role.code == role_definition["code"]))
        if role is None:
            role = Role(**role_definition)
            db.add(role)
            stats["roles"] += 1
        else:
            role.name = str(role_definition["name"])
            role.description = str(role_definition["description"])
            role.data_scope_default = str(role_definition["data_scope_default"])
            role.is_system = bool(role_definition["is_system"])
        role.permissions = [
            permissions[code]
            for code in sorted(ROLE_PERMISSIONS[str(role_definition["code"])])
            if code in permissions
        ]

    for code, name, sla_hours in TICKET_CATEGORIES:
        _upsert_code(db, TicketCategory, code, {"name": name, "sla_hours": sla_hours})
        stats["categories"] += 1

    for code, name, is_closed, color, sort_order in TICKET_STATUSES:
        _upsert_code(
            db,
            TicketStatus,
            code,
            {"name": name, "is_closed": is_closed, "color": color, "sort_order": sort_order},
        )
        stats["categories"] += 1

    for code, name, level, color, response, resolution in TICKET_PRIORITIES:
        _upsert_code(
            db,
            TicketPriority,
            code,
            {
                "name": name,
                "level": level,
                "color": color,
                "response_hours": response,
                "resolution_hours": resolution,
            },
        )
        stats["categories"] += 1

    for code, name, workstation, infrastructure, network, life_months, prefix in ASSET_CATEGORIES:
        _upsert_code(
            db,
            AssetCategory,
            code,
            {
                "name": name,
                "is_workstation": workstation,
                "is_infrastructure": infrastructure,
                "requires_network_fields": network,
                "default_life_months": life_months,
                "tag_prefix": prefix,
                "tag_template": "PNFOR-{PREFIX}-{YEAR}-{SEQ:4}",
                "tag_sequence_mode": "year",
            },
        )
        stats["categories"] += 1

    for code, name in CONTRACT_CATEGORIES:
        _upsert_code(db, ContractCategory, code, {"name": name})
        stats["categories"] += 1

    for index, (code, name) in enumerate(BUDGET_CATEGORIES):
        _upsert_code(db, BudgetCategory, code, {"name": name, "sort_order": index})
        stats["categories"] += 1

    for code, name in DOCUMENT_CATEGORIES:
        _upsert_code(db, DocumentCategory, code, {"name": name})
        stats["categories"] += 1

    for key, value, category, is_secret, description in DEFAULT_SETTINGS:
        setting = db.get(Setting, key)
        if setting is None:
            db.add(
                Setting(
                    key=key,
                    value_json=json.dumps(value, ensure_ascii=False),
                    category=category,
                    is_secret=is_secret,
                    description=description,
                    updated_at=_now(),
                )
            )
            stats["settings"] += 1
        else:
            setting.category = category
            setting.is_secret = is_secret
            setting.description = description

    for template_definition in CHECKLIST_TEMPLATES:
        template = db.scalar(
            select(ChecklistTemplate).where(ChecklistTemplate.code == template_definition["code"])
        )
        if template is None:
            template = ChecklistTemplate(
                code=str(template_definition["code"]),
                name=str(template_definition["name"]),
                type=str(template_definition["type"]),
                description=str(template_definition["description"]),
            )
            db.add(template)
            db.flush()
            for position, label in enumerate(template_definition["items"]):
                db.add(
                    ChecklistTemplateItem(
                        template_id=template.id,
                        position=position,
                        label=label,
                    )
                )
            stats["templates"] += 1

    db.commit()
    return stats
