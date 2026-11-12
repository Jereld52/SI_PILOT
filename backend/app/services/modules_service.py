from __future__ import annotations

import json
from dataclasses import dataclass

from app.core.errors import ValidationAppError
from app.models.auth import User
from app.models.setting import Setting
from app.schemas.modules import ModuleRead, ModuleSettingsRead, ModuleSettingsUpdate
from app.services.audit_service import write_audit
from fastapi import Request
from sqlalchemy.orm import Session

SETTING_KEY = "modules.disabled"


@dataclass(frozen=True)
class ModuleDefinition:
    key: str
    label: str
    description: str
    path: str
    permission: str
    section: str


MODULE_DEFINITIONS: tuple[ModuleDefinition, ...] = (
    ModuleDefinition(
        "statistics",
        "Statistiques",
        "Indicateurs consolidés du parc, du support, des contrats et du budget.",
        "/statistiques",
        "statistics.read",
        "Pilotage",
    ),
    ModuleDefinition(
        "exports",
        "Exports",
        "Exports sur mesure et historiques de génération.",
        "/exports",
        "exports.run",
        "Pilotage",
    ),
    ModuleDefinition(
        "tickets",
        "Demandes IT",
        "Tickets, priorités, SLA, interventions et suivi du support.",
        "/demandes",
        "tickets.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "assets",
        "Parc informatique",
        "Inventaire des équipements, affectations, garanties et QR codes.",
        "/parc",
        "assets.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "software",
        "Logiciels",
        "Parc logiciel WAPT, versions, mises à jour et déploiement.",
        "/logiciels",
        "assets.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "stock",
        "Stock IT",
        "Consommables, accessoires, seuils et mouvements.",
        "/stock",
        "stock.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "reservations",
        "Réservations",
        "Réservation du matériel mobile et des salles.",
        "/reservations",
        "reservations.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "mobile",
        "Téléphonie mobile",
        "Lignes, forfaits, terminaux et secrets chiffrés.",
        "/telephonie",
        "mobile_lines.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "agents",
        "Agents",
        "Annuaire, arrivées, départs et équipements affectés.",
        "/agents",
        "agents.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "onboarding",
        "Arrivées & départs",
        "Dossiers d'intégration et de sortie, checklists et suivi.",
        "/arrivees-departs",
        "agents.read",
        "Support & parc",
    ),
    ModuleDefinition(
        "communications",
        "Communications",
        "Messages aux utilisateurs, ciblage, publication et suivi de lecture.",
        "/communication/communications",
        "communications.read",
        "Communication",
    ),
    ModuleDefinition(
        "meetings",
        "Réunions",
        "Réunions d'équipe, de service, de projet et points responsables.",
        "/communication/reunions",
        "meetings.read",
        "Communication",
    ),
    ModuleDefinition(
        "trainings",
        "Formations",
        "Formations, participants, coûts et obligations.",
        "/communication/formations",
        "trainings.read",
        "Communication",
    ),
    ModuleDefinition(
        "manager_points",
        "Points 1:1",
        "Sujets en cours avec la responsable, échéances et décisions.",
        "/communication/points",
        "manager_points.read",
        "Communication",
    ),
    ModuleDefinition(
        "infrastructure",
        "Infrastructure",
        "Serveurs, VM, réseau et dépendances.",
        "/infrastructure",
        "infrastructure.read",
        "Infrastructure",
    ),
    ModuleDefinition(
        "supervision",
        "Supervision",
        "Plans de site, positionnement et état des contrôles.",
        "/supervision",
        "infrastructure.topology",
        "Infrastructure",
    ),
    ModuleDefinition(
        "network_shares",
        "Partages réseau",
        "Volumétrie des partages, seuils et alertes.",
        "/partages-reseau",
        "infrastructure.read",
        "Infrastructure",
    ),
    ModuleDefinition(
        "security",
        "Cybersécurité",
        "Incidents, vulnérabilités, sauvegardes et certificats.",
        "/cybersecurite",
        "security.read",
        "Infrastructure",
    ),
    ModuleDefinition(
        "backups",
        "Sauvegardes",
        "Suivi des jobs, sessions et dépôts Veeam.",
        "/sauvegardes",
        "security.read",
        "Infrastructure",
    ),
    ModuleDefinition(
        "suppliers",
        "Fournisseurs & licences",
        "Fournisseurs, contacts, licences et sièges.",
        "/fournisseurs",
        "suppliers.read",
        "Gestion",
    ),
    ModuleDefinition(
        "contracts",
        "Contrats",
        "Contrats, préavis, reconduction et échéances.",
        "/contrats",
        "contracts.read",
        "Gestion",
    ),
    ModuleDefinition(
        "budget",
        "Budget",
        "Exercices, lignes, engagements et factures.",
        "/budget",
        "budget.read",
        "Gestion",
    ),
    ModuleDefinition(
        "projects",
        "Projets",
        "Projets, jalons, tâches, risques et décisions.",
        "/projets",
        "projects.read",
        "Gestion",
    ),
    ModuleDefinition(
        "rgpd",
        "RGPD",
        "Traitements, droits, violations et registre.",
        "/rgpd",
        "rgpd.read",
        "Conformité",
    ),
    ModuleDefinition(
        "documents",
        "Documentation",
        "Documents, procédures, tags et versions.",
        "/documentation",
        "documents.read",
        "Conformité",
    ),
    ModuleDefinition(
        "calendar",
        "Calendrier",
        "Événements, actions et échéances.",
        "/calendrier",
        "calendar.read",
        "Pilotage",
    ),
    ModuleDefinition(
        "ai",
        "Assistant IA",
        "Assistant conversationnel et configuration du fournisseur.",
        "/admin/ai",
        "ai.use",
        "Intelligence",
    ),
)

MODULE_KEYS = frozenset(item.key for item in MODULE_DEFINITIONS)


def _raw_disabled(db: Session) -> list[str]:
    setting = db.get(Setting, SETTING_KEY)
    if setting is None or not setting.value_json:
        return []
    try:
        value = json.loads(setting.value_json)
    except json.JSONDecodeError:
        return []
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item) in MODULE_KEYS]


def get_disabled(db: Session) -> list[str]:
    return sorted(_raw_disabled(db))


def get_settings(db: Session) -> ModuleSettingsRead:
    disabled = set(_raw_disabled(db))
    return ModuleSettingsRead(
        disabled=sorted(disabled),
        modules=[
            ModuleRead(
                key=item.key,
                label=item.label,
                description=item.description,
                path=item.path,
                permission=item.permission,
                section=item.section,
                enabled=item.key not in disabled,
            )
            for item in MODULE_DEFINITIONS
        ],
    )


def update_settings(
    db: Session,
    payload: ModuleSettingsUpdate,
    *,
    actor: User,
    request: Request | None = None,
) -> ModuleSettingsRead:
    unknown = sorted(set(payload.disabled) - MODULE_KEYS)
    if unknown:
        raise ValidationAppError(
            f"Module(s) inconnu(s) : {', '.join(unknown)}."
        )
    disabled = sorted(set(payload.disabled))
    setting = db.get(Setting, SETTING_KEY)
    if setting is None:
        setting = Setting(
            key=SETTING_KEY,
            category="modules",
            is_secret=False,
            description="Modules désactivés",
        )
        db.add(setting)
    setting.value_json = json.dumps(disabled, ensure_ascii=False)
    write_audit(
        db,
        module="admin",
        action="modules_updated",
        actor=actor,
        entity_type="setting",
        entity_id="modules",
        entity_label="Modules de l'application",
        after={"disabled": disabled},
        request=request,
    )
    db.commit()
    return get_settings(db)
