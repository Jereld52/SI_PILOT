import {
  Activity,
  BarChart3,
  CalendarClock,
  DatabaseBackup,
  FileText,
  FolderTree,
  LifeBuoy,
  Mail,
  MonitorSmartphone,
  Network,
  Radar,
  ScanText,
  Search,
  Server,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { AiToolInfo } from "@/types/api";

export interface ToolDomainMeta {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const toolDomains: ToolDomainMeta[] = [
  {
    key: "support",
    label: "Support & demandes",
    description: "Tickets, priorités, SLA et réponses.",
    icon: LifeBuoy,
  },
  {
    key: "parc",
    label: "Parc & logiciels",
    description: "Équipements, pannes, garanties et WAPT.",
    icon: MonitorSmartphone,
  },
  {
    key: "achats",
    label: "Achats & contrats",
    description: "Devis, bons de commande, engagement et contrats.",
    icon: ShoppingCart,
  },
  {
    key: "infrastructure",
    label: "Infrastructure & réseau",
    description: "Serveurs, réseau, partages et découverte.",
    icon: Server,
  },
  {
    key: "securite",
    label: "Cybersécurité & sauvegardes",
    description: "Incidents, certificats et jobs Veeam.",
    icon: ShieldCheck,
  },
  {
    key: "agents",
    label: "Agents & organisation",
    description: "Annuaire, affectations et arrivées/départs.",
    icon: Users,
  },
  {
    key: "documents",
    label: "Documentation & procédures",
    description: "Documents, guides, procédures et cohérence documentaire.",
    icon: FileText,
  },
  {
    key: "conformite",
    label: "Conformité RGPD",
    description: "Traitements, droits, violations et durées de conservation.",
    icon: ShieldCheck,
  },
  {
    key: "pilotage",
    label: "Pilotage & audit",
    description: "Briefing, bilan mensuel et activité récente.",
    icon: BarChart3,
  },
  {
    key: "general",
    label: "Autres outils",
    description: "Outils complémentaires.",
    icon: Wrench,
  },
];

export const toolDomainByKey = new Map(toolDomains.map((domain) => [domain.key, domain]));

export interface ToolGroup {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tools: AiToolInfo[];
}

export function groupTools(tools: AiToolInfo[]): ToolGroup[] {
  const groups = new Map<string, AiToolInfo[]>();
  tools.forEach((tool) => {
    const key = tool.domain || "general";
    groups.set(key, [...(groups.get(key) ?? []), tool]);
  });
  return toolDomains
    .filter((domain) => (groups.get(domain.key)?.length ?? 0) > 0)
    .map((domain) => ({
      key: domain.key,
      label: domain.label,
      description: domain.description,
      icon: domain.icon,
      tools: groups.get(domain.key) ?? [],
    }));
}

export interface AiActionCapability {
  type: string;
  label: string;
  description: string;
  permission: string;
  prompt: string;
  icon: LucideIcon;
}

export const actionCapabilities: AiActionCapability[] = [
  {
    type: "create_action",
    label: "Action de suivi",
    description: "Créer une action avec priorité, échéance et responsable.",
    permission: "actions.create",
    prompt: "Propose une action de suivi priorisée pour les anomalies du parc.",
    icon: Activity,
  },
  {
    type: "create_ticket",
    label: "Demande IT",
    description: "Préparer une demande qualifiée avec priorité et catégorie.",
    permission: "tickets.create",
    prompt: "Prépare une demande IT pour un poste qui ne démarre plus.",
    icon: LifeBuoy,
  },
  {
    type: "create_meeting",
    label: "Réunion",
    description: "Proposer une réunion, un ordre du jour et une date.",
    permission: "meetings.manage",
    prompt: "Propose une réunion de suivi du plan de renouvellement du parc.",
    icon: CalendarClock,
  },
  {
    type: "create_communication",
    label: "Communication",
    description: "Rédiger un brouillon de communication interne.",
    permission: "communications.manage",
    prompt: "Rédige une communication interne sur la maintenance du réseau.",
    icon: Mail,
  },
  {
    type: "create_quote",
    label: "Devis",
    description: "Préparer un brouillon de devis fournisseur.",
    permission: "suppliers.manage",
    prompt: "Prépare un devis pour le renouvellement de dix postes.",
    icon: FileText,
  },
  {
    type: "create_purchase_order",
    label: "Bon de commande",
    description: "Préparer un bon de commande avec engagement obligatoire.",
    permission: "suppliers.manage",
    prompt: "Prépare un bon de commande avec numéro d'engagement pour du matériel.",
    icon: ShoppingCart,
  },
  {
    type: "create_document",
    label: "Document / procédure",
    description: "Créer un brouillon de procédure, de guide ou de fiche technique.",
    permission: "documents.create",
    prompt:
      "Rédige une procédure documentée à partir des tickets résolus et des interventions passées.",
    icon: FileText,
  },
];

export interface AiIntegration {
  key: string;
  label: string;
  description: string;
  to: string;
  permission: string;
  moduleKey?: string;
  icon: LucideIcon;
}

export const aiIntegrations: AiIntegration[] = [
  {
    key: "wapt",
    label: "WAPT",
    description: "Parc logiciel, versions et mises à jour à déployer.",
    to: "/logiciels",
    permission: "assets.read",
    moduleKey: "software",
    icon: MonitorSmartphone,
  },
  {
    key: "veeam",
    label: "Veeam",
    description: "Jobs, sessions, échecs et dépôts de sauvegarde.",
    to: "/sauvegardes",
    permission: "security.read",
    moduleKey: "backups",
    icon: DatabaseBackup,
  },
  {
    key: "ocr",
    label: "OCR & import intelligent",
    description: "Analyse locale de PDF, détection de doublons et intégration.",
    to: "/import-documents",
    permission: "documents.create",
    moduleKey: "documents",
    icon: ScanText,
  },
  {
    key: "network-discovery",
    label: "Découverte réseau",
    description: "Scanner un sous-réseau et rapprocher les hôtes du parc.",
    to: "/decouverte-reseau",
    permission: "infrastructure.read",
    moduleKey: "infrastructure",
    icon: Radar,
  },
  {
    key: "supervision",
    label: "Supervision",
    description: "Contrôles, incidents techniques et dépendances.",
    to: "/supervision",
    permission: "infrastructure.read",
    moduleKey: "supervision",
    icon: Activity,
  },
  {
    key: "network-shares",
    label: "Partages réseau",
    description: "Volumétrie, saturation et alertes des partages.",
    to: "/partages-reseau",
    permission: "infrastructure.read",
    moduleKey: "network_shares",
    icon: FolderTree,
  },
  {
    key: "calendar",
    label: "Calendrier",
    description: "Événements, réunions, réservations et échéances.",
    to: "/calendrier",
    permission: "calendar.read",
    moduleKey: "calendar",
    icon: CalendarClock,
  },
  {
    key: "smtp",
    label: "Messagerie SMTP",
    description: "Notifications et envois d'e-mails depuis l'application.",
    to: "/admin/settings",
    permission: "admin.settings.read",
    icon: Mail,
  },
  {
    key: "ldap",
    label: "Annuaire LDAP / AD",
    description: "Synchronisation des utilisateurs et des groupes.",
    to: "/admin/sources",
    permission: "admin.settings.read",
    icon: Network,
  },
];

export interface WorkspacePromptGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  prompts: { title: string; prompt: string }[];
}

export interface AiTaskGroup {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tasks: { title: string; prompt: string }[];
}

export const aiTaskGroups: AiTaskGroup[] = [
  {
    key: "analyse",
    label: "Analyser et contrôler",
    description: "Qualité des données, doublons, imports et incohérences.",
    icon: Search,
    tasks: [
      {
        title: "Anomalies de données",
        prompt:
          "Analyse les anomalies de qualité des données et propose un plan de correction priorisé.",
      },
      {
        title: "Doublons documentaires",
        prompt:
          "Quels doublons documentaires ou références en double existent dans la base ?",
      },
      {
        title: "Imports en erreur",
        prompt:
          "Quels imports sont en erreur ou non finalisés, et que faut-il corriger ?",
      },
      {
        title: "Équipements sans site",
        prompt:
          "Quels équipements sont sans site ou sans affectation, et quelles corrections proposer ?",
      },
      {
        title: "Contrats incomplets",
        prompt:
          "Quels contrats sont sans date de fin ou proches de l'échéance ?",
      },
    ],
  },
  {
    key: "conformite",
    label: "Conformité & documentation",
    description: "RGPD, registre, durées de conservation, procédures et cohérence documentaire.",
    icon: ShieldCheck,
    tasks: [
      {
        title: "Registre RGPD",
        prompt:
          "Analyse le registre RGPD : traitements à revue, informations manquantes et priorités.",
      },
      {
        title: "Analyse d'impact",
        prompt:
          "Prépare une analyse d'impact RGPD pour un nouveau traitement de données personnelles.",
      },
      {
        title: "Durées de conservation",
        prompt:
          "Propose des durées de conservation adaptées aux traitements et données personnelles de l'organisation.",
      },
      {
        title: "Recherche documentaire",
        prompt:
          "Recherche dans la documentation les procédures et guides correspondant à ma question, avec les sources.",
      },
      {
        title: "Procédure depuis les tickets",
        prompt:
          "Génère une procédure à partir des tickets résolus et des interventions passées, avec les étapes et les points de contrôle.",
      },
      {
        title: "Cohérence documentaire",
        prompt:
          "Contrôle la cohérence de la documentation : documents obsolètes, sans version, doublons et versions manquantes.",
      },
    ],
  },
  {
    key: "redaction",
    label: "Rédiger et communiquer",
    description: "Communications, procédures, comptes rendus et réponses.",
    icon: FileText,
    tasks: [
      {
        title: "Communication interne",
        prompt:
          "Rédige une communication interne professionnelle pour annoncer une maintenance réseau.",
      },
      {
        title: "Procédure d'arrivée",
        prompt:
          "Rédige une procédure courte et claire pour l'arrivée d'un nouvel agent.",
      },
      {
        title: "Compte rendu de réunion",
        prompt:
          "Prépare un compte rendu de réunion structuré avec décisions, actions et responsables.",
      },
      {
        title: "Réponse à un utilisateur",
        prompt:
          "Rédige une réponse professionnelle et rassurante à un utilisateur mécontent.",
      },
    ],
  },
  {
    key: "pilotage",
    label: "Préparer et piloter",
    description: "Plans d'action, comités, budget et renouvellement.",
    icon: BarChart3,
    tasks: [
      {
        title: "Plan d'action 30 jours",
        prompt:
          "Prépare un plan d'action priorisé pour les 30 prochains jours à partir des alertes et anomalies.",
      },
      {
        title: "Comité de pilotage",
        prompt:
          "Prépare un comité de pilotage informatique : ordre du jour, indicateurs et décisions attendues.",
      },
      {
        title: "Plan de renouvellement",
        prompt:
          "Propose un plan de renouvellement du parc sur 12 mois, avec priorités et estimation budgétaire.",
      },
      {
        title: "Arbitrages budget",
        prompt:
          "Analyse le budget informatique et propose des économies ou des arbitrages argumentés.",
      },
    ],
  },
  {
    key: "securite",
    label: "Sécurité et sauvegardes",
    description: "Incidents, certificats, vulnérabilités et Veeam.",
    icon: ShieldCheck,
    tasks: [
      {
        title: "Incidents ouverts",
        prompt:
          "Quels incidents de sécurité sont ouverts et quelles actions dois-je mener en priorité ?",
      },
      {
        title: "Certificats à expirer",
        prompt: "Quels certificats arrivent à expiration dans les 90 jours ?",
      },
      {
        title: "Sauvegardes Veeam",
        prompt: "Quel est l'état des sauvegardes Veeam et des derniers jobs ?",
      },
      {
        title: "Vulnérabilités critiques",
        prompt:
          "Quelles vulnérabilités sont critiques et quels plans de remédiation proposer ?",
      },
    ],
  },
  {
    key: "support",
    label: "Support et utilisateurs",
    description: "Demandes, priorités, agents et dossiers.",
    icon: LifeBuoy,
    tasks: [
      {
        title: "Demandes à traiter",
        prompt:
          "Résume les demandes ouvertes et propose un ordre de traitement en fonction des priorités.",
      },
      {
        title: "Demandes en retard",
        prompt: "Quels tickets sont en retard ou proches de l'échéance ?",
      },
      {
        title: "Équipements des agents",
        prompt:
          "Quels agents ont des équipements à renouveler ou hors garantie ?",
      },
      {
        title: "Dossiers incomplets",
        prompt:
          "Quels dossiers d'arrivée ou de départ sont incomplets ou en retard ?",
      },
    ],
  },
];

export const workspacePromptGroups: WorkspacePromptGroup[] = [
  {
    key: "support",
    label: "Support & demandes",
    icon: LifeBuoy,
    prompts: [
      {
        title: "Briefing du jour",
        prompt:
          "Fais-moi le briefing du jour avec les contrôles en échec, les sauvegardes, les tickets prioritaires et les alertes.",
      },
      {
        title: "Demandes à prioriser",
        prompt: "Quels tickets sont ouverts et lesquels sont prioritaires ?",
      },
      {
        title: "Demandes en retard",
        prompt: "Quels tickets sont en retard ou proches de l'échéance ?",
      },
      {
        title: "Rédiger une réponse",
        prompt:
          "Rédige une réponse professionnelle et rassurante pour une demande de dépannage informatique.",
      },
    ],
  },
  {
    key: "parc",
    label: "Parc & logiciels",
    icon: MonitorSmartphone,
    prompts: [
      {
        title: "Bilan du parc",
        prompt:
          "Fais-moi un bilan du parc informatique : état, équipements en panne, renouvellements et garanties.",
      },
      {
        title: "Postes en panne",
        prompt: "Quels équipements sont en panne ?",
      },
      {
        title: "Renouvellements",
        prompt: "Quels équipements sont à renouveler ou hors garantie ?",
      },
      {
        title: "Mises à jour WAPT",
        prompt: "Quelles mises à jour WAPT sont en attente et sur quels postes ?",
      },
    ],
  },
  {
    key: "achats",
    label: "Achats, contrats & budget",
    icon: ShoppingCart,
    prompts: [
      {
        title: "Pipeline achats",
        prompt:
          "Analyse les devis et bons de commande : devis en attente, montants, taux de conversion et actions à mener.",
      },
      {
        title: "BC sans engagement",
        prompt: "Quels bons de commande n'ont pas de numéro d'engagement ?",
      },
      {
        title: "Livraisons en retard",
        prompt: "Quelles livraisons de bons de commande sont en retard ?",
      },
      {
        title: "Contrats à échéance",
        prompt: "Quels contrats arrivent à échéance dans les 90 jours ?",
      },
      {
        title: "Point budget",
        prompt:
          "Analyse le budget informatique : engagements, factures et budget disponible. Quels points d'attention ?",
      },
    ],
  },
  {
    key: "infrastructure",
    label: "Infrastructure & sécurité",
    icon: Server,
    prompts: [
      {
        title: "État de l'infrastructure",
        prompt:
          "Fais-moi un point sur l'infrastructure et les contrôles de supervision en échec.",
      },
      {
        title: "Découverte réseau",
        prompt:
          "Scanne 192.168.1.0/24 et indique les hôtes détectés qui ne sont pas encore dans la base.",
      },
      {
        title: "Incidents de sécurité",
        prompt:
          "Quels incidents de sécurité sont ouverts et quelles actions dois-je mener en priorité ?",
      },
      {
        title: "Sauvegardes Veeam",
        prompt: "Quel est l'état des sauvegardes Veeam et des derniers jobs ?",
      },
    ],
  },
  {
    key: "agents",
    label: "Agents & organisation",
    icon: Users,
    prompts: [
      {
        title: "Arrivées & départs",
        prompt: "Quelles arrivées et quels départs sont incomplets ou en retard ?",
      },
      {
        title: "Rechercher un agent",
        prompt:
          "Que possède l'agent Marie Dupont ? Donne ses équipements, ses demandes et ses dossiers.",
      },
      {
        title: "Annuaire et affectations",
        prompt: "Quels agents sont actifs et quels équipements leur sont affectés ?",
      },
    ],
  },
  {
    key: "conformite",
    label: "Conformité & documentation",
    icon: ShieldCheck,
    prompts: [
      {
        title: "Registre RGPD",
        prompt:
          "Analyse le registre RGPD : traitements à revue, informations manquantes et priorités.",
      },
      {
        title: "Analyse d'impact",
        prompt:
          "Prépare une analyse d'impact RGPD pour un nouveau traitement de données personnelles.",
      },
      {
        title: "Durées de conservation",
        prompt:
          "Propose des durées de conservation adaptées aux traitements et données personnelles de l'organisation.",
      },
      {
        title: "Recherche documentaire",
        prompt:
          "Recherche dans la documentation les procédures et guides correspondant à ma question, avec les sources.",
      },
      {
        title: "Procédure depuis les tickets",
        prompt:
          "Génère une procédure à partir des tickets résolus et des interventions passées, avec les étapes et les points de contrôle.",
      },
      {
        title: "Cohérence documentaire",
        prompt:
          "Contrôle la cohérence de la documentation : documents obsolètes, sans version, doublons et versions manquantes.",
      },
    ],
  },
  {
    key: "pilotage",
    label: "Documents, projets & pilotage",
    icon: BarChart3,
    prompts: [
      {
        title: "Documents à mettre à jour",
        prompt: "Quels documents de documentation sont à mettre à jour ou à compléter ?",
      },
      {
        title: "Projets à risque",
        prompt: "Quels projets sont en retard ou à risque ?",
      },
      {
        title: "Points RGPD",
        prompt: "Quels traitements RGPD arrivent à revue et quels sont les points d'attention ?",
      },
      {
        title: "Bilan mensuel",
        prompt: "Prépare le bilan mensuel pour la direction.",
      },
      {
        title: "Rapport d'exploitation",
        prompt: "Prépare le rapport d'exploitation du mois précédent.",
      },
    ],
  },
];
