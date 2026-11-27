import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Cpu,
  FileText,
  FileUp,
  History,
  LayoutGrid,
  LifeBuoy,
  MonitorSmartphone,
  Plug,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  actionCapabilities,
  aiIntegrations,
  aiTaskGroups,
  groupTools,
} from "@/features/ai/aiCatalog";
import { AiCollapsibleSection } from "@/features/ai/AiCollapsibleSection";
import { useAiAssistant } from "@/features/ai/AiAssistantProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type { AiRunItem, AiStatus, AiToolInfo } from "@/types/api";

interface AiShortcut {
  key: string;
  title: string;
  description: string;
  prompt?: string;
  to?: string;
  permission?: string;
  moduleKey?: string;
}

interface AiShortcutGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: AiShortcut[];
}

const shortcutGroups: AiShortcutGroup[] = [
  {
    key: "support",
    label: "Support & demandes",
    icon: LifeBuoy,
    items: [
      {
        key: "daily-briefing",
        title: "Briefing du jour",
        description: "Contrôles, sauvegardes, tickets et alertes à traiter aujourd'hui.",
        prompt:
          "Fais-moi le briefing du jour avec les contrôles en échec, les sauvegardes, les tickets prioritaires et les alertes.",
        moduleKey: "ai",
      },
      {
        key: "tickets-open",
        title: "Demandes à prioriser",
        description: "Demandes ouvertes, priorités et échéances les plus urgentes.",
        prompt: "Quels tickets sont ouverts et lesquels sont prioritaires ?",
        permission: "tickets.read",
        moduleKey: "tickets",
      },
      {
        key: "tickets-overdue",
        title: "Demandes en retard",
        description: "Tickets hors SLA, proches de l'échéance ou en attente.",
        prompt: "Quels tickets sont en retard ou proches de l'échéance ?",
        permission: "tickets.read",
        moduleKey: "tickets",
      },
      {
        key: "ticket-reply",
        title: "Rédiger une réponse",
        description: "Réponse professionnelle pour une demande de dépannage.",
        prompt:
          "Rédige une réponse professionnelle et rassurante pour une demande de dépannage informatique.",
        permission: "tickets.read",
        moduleKey: "tickets",
      },
      {
        key: "ticket-copilot",
        title: "Copilote de demande",
        description: "Ouvrir les demandes pour analyser, qualifier et répondre.",
        to: "/demandes",
        permission: "tickets.read",
        moduleKey: "tickets",
      },
    ],
  },
  {
    key: "parc",
    label: "Parc & logiciels",
    icon: MonitorSmartphone,
    items: [
      {
        key: "fleet-bilan",
        title: "Bilan du parc",
        description: "État du parc, pannes, renouvellements et garanties.",
        prompt:
          "Fais-moi un bilan du parc informatique : état, équipements en panne, renouvellements et garanties.",
        permission: "assets.read",
        moduleKey: "assets",
      },
      {
        key: "assets-broken",
        title: "Postes en panne",
        description: "Liste des équipements en panne et priorités de réparation.",
        prompt: "Quels équipements sont en panne ?",
        permission: "assets.read",
        moduleKey: "assets",
      },
      {
        key: "assets-renewal",
        title: "Renouvellements",
        description: "Postes à renouveler ou hors garantie.",
        prompt: "Quels équipements sont à renouveler ou hors garantie ?",
        permission: "assets.read",
        moduleKey: "assets",
      },
      {
        key: "wapt",
        title: "Mises à jour WAPT",
        description: "Logiciels à mettre à jour et postes concernés.",
        prompt: "Quelles mises à jour WAPT sont en attente et sur quels postes ?",
        permission: "assets.read",
        moduleKey: "software",
      },
      {
        key: "stock",
        title: "Stock IT",
        description: "Articles sous le seuil et consommables à commander.",
        prompt: "Quels articles du stock IT sont sous le seuil d'alerte ?",
        permission: "stock.read",
        moduleKey: "stock",
      },
    ],
  },
  {
    key: "achats",
    label: "Achats, contrats & budget",
    icon: ShoppingCart,
    items: [
      {
        key: "commercial-pipeline",
        title: "Pipeline achats",
        description: "Devis, bons de commande, montants et conversion.",
        prompt:
          "Analyse les devis et bons de commande : devis en attente, montants, taux de conversion et actions à mener.",
        permission: "suppliers.read",
        moduleKey: "suppliers",
      },
      {
        key: "commercial-engagement",
        title: "BC sans engagement",
        description: "Bons de commande sans numéro d'engagement à compléter.",
        prompt: "Quels bons de commande n'ont pas de numéro d'engagement ?",
        permission: "suppliers.read",
        moduleKey: "suppliers",
      },
      {
        key: "commercial-late",
        title: "Livraisons en retard",
        description: "Commandes dont la date de livraison est dépassée.",
        prompt: "Quelles livraisons de bons de commande sont en retard ?",
        permission: "suppliers.read",
        moduleKey: "suppliers",
      },
      {
        key: "contracts",
        title: "Contrats à échéance",
        description: "Contrats à renouveler dans les 90 jours.",
        prompt: "Quels contrats arrivent à échéance dans les 90 jours ?",
        permission: "contracts.read",
        moduleKey: "contracts",
      },
      {
        key: "budget",
        title: "Point budget",
        description: "Engagements, factures et budget disponible.",
        prompt:
          "Analyse le budget informatique : engagements, factures et budget disponible. Quels points d'attention ?",
        permission: "budget.read",
        moduleKey: "budget",
      },
    ],
  },
  {
    key: "infrastructure",
    label: "Infrastructure & sécurité",
    icon: Server,
    items: [
      {
        key: "infra",
        title: "État de l'infrastructure",
        description: "Équipements, dépendances et contrôles en échec.",
        prompt:
          "Fais-moi un point sur l'infrastructure et les contrôles de supervision en échec.",
        permission: "infrastructure.read",
        moduleKey: "infrastructure",
      },
      {
        key: "network-scan",
        title: "Découverte réseau",
        description: "Scanner un sous-réseau privé et rapprocher les hôtes du parc.",
        prompt:
          "Scanne 192.168.1.0/24 et indique les hôtes détectés qui ne sont pas encore dans la base.",
        permission: "infrastructure.read",
        moduleKey: "infrastructure",
      },
      {
        key: "security",
        title: "Incidents de sécurité",
        description: "Incidents ouverts, gravité et actions à mener.",
        prompt:
          "Quels incidents de sécurité sont ouverts et quelles actions dois-je mener en priorité ?",
        permission: "security.read",
        moduleKey: "security",
      },
      {
        key: "veeam",
        title: "Sauvegardes Veeam",
        description: "Jobs, échecs, dépôts et sauvegardes trop anciennes.",
        prompt: "Quel est l'état des sauvegardes Veeam et des derniers jobs ?",
        permission: "security.read",
        moduleKey: "backups",
      },
      {
        key: "shares",
        title: "Partages réseau",
        description: "Volumétrie et alertes des partages réseau.",
        prompt: "Quels partages réseau sont en alerte ou proches de la saturation ?",
        permission: "infrastructure.read",
        moduleKey: "network_shares",
      },
    ],
  },
  {
    key: "agents",
    label: "Agents & organisation",
    icon: Users,
    items: [
      {
        key: "onboarding",
        title: "Arrivées & départs",
        description: "Dossiers incomplets, retards et oublis.",
        prompt: "Quelles arrivées et quels départs sont incomplets ou en retard ?",
        permission: "agents.read",
        moduleKey: "onboarding",
      },
      {
        key: "agent-lookup",
        title: "Rechercher un agent",
        description: "Équipements, demandes et dossiers d'un agent.",
        prompt:
          "Que possède l'agent Marie Dupont ? Donne ses équipements, ses demandes et ses dossiers.",
        permission: "agents.read",
        moduleKey: "agents",
      },
      {
        key: "agents-fleet",
        title: "Annuaire et affectations",
        description: "Agents actifs et équipements affectés.",
        prompt: "Quels agents sont actifs et quels équipements leur sont affectés ?",
        permission: "agents.read",
        moduleKey: "agents",
      },
    ],
  },
  {
    key: "documents",
    label: "Documents, projets & conformité",
    icon: FileText,
    items: [
      {
        key: "import",
        title: "Import intelligent",
        description: "Analyser un PDF ou un texte et l'intégrer au bon endroit.",
        to: "/import-documents",
        permission: "documents.create",
        moduleKey: "documents",
      },
      {
        key: "documents",
        title: "Documentation",
        description: "Documents publiés, à mettre à jour ou à classer.",
        prompt:
          "Quels documents de documentation sont à mettre à jour ou à compléter ?",
        permission: "documents.read",
        moduleKey: "documents",
      },
      {
        key: "projects",
        title: "Projets à risque",
        description: "Projets en retard, bloqués ou proches de l'échéance.",
        prompt: "Quels projets sont en retard ou à risque ?",
        permission: "projects.read",
        moduleKey: "projects",
      },
      {
        key: "rgpd",
        title: "Points RGPD",
        description: "Traitements à revue, demandes de droits et obligations.",
        prompt:
          "Quels traitements RGPD arrivent à revue et quels sont les points d'attention ?",
        permission: "rgpd.read",
        moduleKey: "rgpd",
      },
    ],
  },
  {
    key: "pilotage",
    label: "Pilotage & direction",
    icon: BarChart3,
    items: [
      {
        key: "monthly",
        title: "Bilan mensuel",
        description: "Synthèse du mois précédent pour la direction.",
        prompt: "Prépare le bilan mensuel pour la direction.",
        permission: "statistics.read",
        moduleKey: "statistics",
      },
      {
        key: "statistics",
        title: "Analyse des statistiques",
        description: "Points d'attention et actions prioritaires.",
        prompt:
          "Analyse les statistiques de la période et propose une synthèse avec les points d'attention et les actions prioritaires.",
        permission: "statistics.read",
        moduleKey: "statistics",
      },
      {
        key: "report",
        title: "Rapport d'exploitation",
        description: "Rapport mensuel d'exploitation en PDF.",
        prompt: "Prépare le rapport d'exploitation du mois précédent.",
        permission: "statistics.read",
        moduleKey: "statistics",
      },
      {
        key: "action-plan",
        title: "Plan d'action 30 jours",
        description: "Priorités, responsables et échéances à court terme.",
        prompt:
          "Prépare un plan d'action priorisé pour les 30 prochains jours à partir des alertes et anomalies.",
        permission: "statistics.read",
        moduleKey: "statistics",
      },
      {
        key: "steering",
        title: "Comité de pilotage",
        description: "Ordre du jour, indicateurs et décisions attendues.",
        prompt:
          "Prépare un comité de pilotage informatique : ordre du jour, indicateurs et décisions attendues.",
        permission: "statistics.read",
        moduleKey: "statistics",
      },
      {
        key: "stats-commercial",
        title: "Statistiques achats",
        description: "Ouvrir l'onglet Achats avec ses filtres et exports.",
        to: "/statistiques",
        permission: "statistics.read",
        moduleKey: "statistics",
      },
    ],
  },
  {
    key: "qualite",
    label: "Qualité & contrôles",
    icon: CheckCircle2,
    items: [
      {
        key: "quality-anomalies",
        title: "Anomalies de données",
        description: "Anomalies détectées et plan de correction priorisé.",
        prompt:
          "Analyse les anomalies de qualité des données et propose un plan de correction priorisé.",
        permission: "dashboard.read",
      },
      {
        key: "quality-duplicates",
        title: "Doublons documentaires",
        description: "Références, fichiers ou montants en double.",
        prompt:
          "Quels doublons documentaires ou références en double existent dans la base ?",
        permission: "documents.read",
        moduleKey: "documents",
      },
      {
        key: "quality-imports",
        title: "Imports en erreur",
        description: "Imports interrompus, en erreur ou non finalisés.",
        prompt: "Quels imports sont en erreur ou non finalisés, et que faut-il corriger ?",
        permission: "dashboard.read",
      },
      {
        key: "quality-assets",
        title: "Équipements sans site",
        description: "Équipements sans site ou sans affectation.",
        prompt:
          "Quels équipements sont sans site ou sans affectation, et quelles corrections proposer ?",
        permission: "assets.read",
        moduleKey: "assets",
      },
    ],
  },
  {
    key: "redaction",
    label: "Rédaction & communication",
    icon: FileText,
    items: [
      {
        key: "write-communication",
        title: "Communication interne",
        description: "Annonce, maintenance ou changement d'organisation.",
        prompt:
          "Rédige une communication interne professionnelle pour annoncer une maintenance réseau.",
        permission: "ai.use",
      },
      {
        key: "write-procedure",
        title: "Procédure d'arrivée",
        description: "Procédure courte pour intégrer un nouvel agent.",
        prompt: "Rédige une procédure courte et claire pour l'arrivée d'un nouvel agent.",
        permission: "ai.use",
      },
      {
        key: "write-meeting",
        title: "Compte rendu de réunion",
        description: "Décisions, actions, responsables et échéances.",
        prompt:
          "Prépare un compte rendu de réunion structuré avec décisions, actions et responsables.",
        permission: "ai.use",
      },
      {
        key: "write-reply",
        title: "Réponse utilisateur",
        description: "Réponse professionnelle et rassurante à un utilisateur.",
        prompt:
          "Rédige une réponse professionnelle et rassurante à un utilisateur mécontent.",
        permission: "ai.use",
      },
    ],
  },
];

const featureLabels: Record<string, string> = {
  assistant_chat: "Conversation",
  document_intake: "Import documentaire",
  ticket_triage: "Copilote de demande",
  daily_briefing: "Briefing du jour",
  monthly_report_summary: "Bilan mensuel",
};

const statusTones: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  success: "success",
  error: "danger",
  pending: "warning",
};

export function AiHubPage() {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const { open: openAi } = useAiAssistant();
  const [question, setQuestion] = useState("");
  const [search, setSearch] = useState("");

  const canUse = hasPermission("ai.use");
  const canConfigure = hasPermission("ai.configure");
  const canImport = hasPermission("documents.create");

  const statusQuery = useQuery({
    queryKey: ["ai", "status"],
    queryFn: () => apiFetch<AiStatus>("/ai/status"),
    enabled: canUse,
  });
  const toolsQuery = useQuery({
    queryKey: ["ai", "tools"],
    queryFn: () => apiFetch<AiToolInfo[]>("/ai/tools"),
    enabled: canUse,
    staleTime: 5 * 60_000,
  });
  const runsQuery = useQuery({
    queryKey: ["ai", "runs", 10],
    queryFn: () => apiFetch<AiRunItem[]>("/ai/runs?limit=10"),
    enabled: canUse,
  });

  const status = statusQuery.data;
  const tools = toolsQuery.data ?? [];
  const runs = runsQuery.data ?? [];

  const toolGroups = useMemo(() => groupTools(tools), [tools]);
  const availableActions = useMemo(
    () => actionCapabilities.filter((action) => hasPermission(action.permission)),
    [hasPermission],
  );
  const availableIntegrations = useMemo(
    () =>
      aiIntegrations.filter(
        (integration) =>
          hasPermission(integration.permission) &&
          (!integration.moduleKey || isEnabled(integration.moduleKey)),
      ),
    [hasPermission, isEnabled],
  );
  const availableIntegrationKeys = useMemo(
    () => new Set(availableIntegrations.map((integration) => integration.key)),
    [availableIntegrations],
  );

  const filteredGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return shortcutGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (item.permission && !hasPermission(item.permission)) return false;
          if (item.moduleKey && !isEnabled(item.moduleKey)) return false;
          if (!needle) return true;
          return `${item.title} ${item.description}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [hasPermission, isEnabled, search]);

  const submitQuestion = () => {
    const value = question.trim();
    if (!value) return;
    openAi(null, value);
    setQuestion("");
  };

  return (
    <div className="space-y-6">
      <section
        id="conversation"
        className="relative scroll-mt-24 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/25 via-surface to-accent/15 p-6 shadow-2xl sm:p-10"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex items-center gap-3">
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/20 text-primary-strong shadow-xl">
                <Sparkles className="h-7 w-7" />
                <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-accent" />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                  Assistant IA
                </p>
                <p className="text-xs text-muted">Votre copilote SI PILOT</p>
              </div>
            </div>
            <h1 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Que voulez-vous simplifier aujourd'hui ?
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted sm:text-base">
              Un espace de travail unique pour analyser le parc, les achats, les contrats,
              l'infrastructure, la sécurité, les documents et le pilotage. L'assistant choisit
              les outils, résume les données et propose des actions à confirmer.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted">
              <span className="rounded-full border border-border-soft bg-background/50 px-3 py-1.5">
                Fournisseur{" "}
                <strong className="text-foreground">{status?.provider || "—"}</strong>
              </span>
              <span className="rounded-full border border-border-soft bg-background/50 px-3 py-1.5">
                Modèle <strong className="text-foreground">{status?.model || "—"}</strong>
              </span>
              <span className="rounded-full border border-border-soft bg-background/50 px-3 py-1.5">
                {tools.length} outil(s)
              </span>
              <span className="rounded-full border border-border-soft bg-background/50 px-3 py-1.5">
                {availableIntegrations.length} intégration(s)
              </span>
              <span
                className={cn(
                  "rounded-full border px-3 py-1.5",
                  status?.enabled && status.configured
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-warning/30 bg-warning/10 text-warning",
                )}
              >
                {status?.enabled && status.configured ? "Prêt" : "À configurer"}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => openAi(null, undefined)}>
              <Sparkles className="h-4 w-4" />
              Ouvrir l'espace IA
            </Button>
            {canImport ? (
              <Link
                to="/import-documents"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                <FileUp className="h-4 w-4" />
                Import intelligent
              </Link>
            ) : null}
            {canConfigure ? (
              <Link
                to="/admin/ai"
                className={buttonVariants({ variant: "secondary", size: "lg" })}
              >
                <Settings className="h-4 w-4" />
                Configuration
              </Link>
            ) : null}
          </div>
        </div>

        {statusQuery.isError ? (
          <div className="relative mt-4">
            <ErrorState
              message="Impossible de charger l'état de l'assistant."
              onRetry={() => void statusQuery.refetch()}
            />
          </div>
        ) : null}

        <form
          className="relative mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <div className="rounded-2xl border border-primary/20 bg-background/75 p-4 shadow-2xl backdrop-blur">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={8}
              placeholder="Exemple : analyse les achats, les livraisons en retard et les bons de commande sans engagement. Propose un plan d'action."
              className="min-h-[200px] resize-y border-0 bg-transparent text-base shadow-none focus-visible:ring-0 sm:text-lg"
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  submitQuestion();
                }
              }}
            />
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Fais-moi le briefing du jour.",
                  "Quels bons de commande sont en retard ?",
                  "Quels équipements sont à renouveler ?",
                  "Analyse les anomalies de qualité des données.",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setQuestion(prompt)}
                    className="rounded-full border border-border-soft bg-background/50 px-2.5 py-1 text-[10px] text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openAi(null, question.trim() || undefined)}
                  disabled={!canUse}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Plein écran
                </Button>
                <Button type="submit" size="sm" disabled={!question.trim() || !canUse}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Demander
                </Button>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-muted-2">
              Ctrl + Entrée pour envoyer. L'assistant ne modifie aucune donnée sans
              confirmation et respecte vos permissions.
            </p>
          </div>
        </form>

        <div className="relative mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Briefing du jour",
              text: "Contrôles, sauvegardes, tickets et alertes.",
              icon: LifeBuoy,
              prompt: "Fais-moi le briefing du jour.",
            },
            {
              title: "Achats & livraisons",
              text: "Devis, commandes, engagement et retards.",
              icon: ShoppingCart,
              prompt:
                "Analyse les achats : devis en attente, bons de commande sans engagement et livraisons en retard.",
            },
            {
              title: "Parc & renouvellement",
              text: "Pannes, garanties et postes à remplacer.",
              icon: MonitorSmartphone,
              prompt:
                "Quels équipements sont en panne, à renouveler ou hors garantie ?",
            },
            {
              title: "Qualité des données",
              text: "Anomalies et plan de correction.",
              icon: ShieldCheck,
              prompt:
                "Analyse les anomalies de qualité des données et propose un plan de correction priorisé.",
            },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.title}
                type="button"
                onClick={() => openAi(null, action.prompt)}
                disabled={!canUse}
                className="group rounded-xl border border-border-soft bg-background/55 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background/80 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary-strong">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="mt-2 text-[11px] font-semibold text-foreground">
                  {action.title}
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted">{action.text}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-accent">
                  Demander à l'IA
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Card className="sticky top-[72px] z-20 border-primary/20 bg-surface/90 p-2 shadow-lg backdrop-blur">
        <nav className="flex flex-wrap items-center gap-1">
          {[
            { href: "#conversation", label: "Conversation", icon: Sparkles },
            { href: "#raccourcis", label: "Raccourcis", icon: Zap },
            { href: "#outils", label: "Outils", icon: Wrench },
            { href: "#actions", label: "Actions", icon: LayoutGrid },
            { href: "#taches", label: "Tâches", icon: Search },
            { href: "#integrations", label: "Intégrations", icon: Plug },
            { href: "#historique", label: "Historique", icon: History },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </a>
            );
          })}
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => openAi(null, undefined)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ouvrir en plein écran
          </Button>
        </nav>
      </Card>

      <Card id="raccourcis" className="panel-sheen scroll-mt-24 border-primary/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Aides par domaine
            </p>
            <h2 className="text-base font-semibold text-foreground">
              Que voulez-vous simplifier aujourd'hui ?
            </h2>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une aide : tickets, achats, WAPT…"
              className="pl-8"
            />
          </div>
        </div>
      </Card>

      {filteredGroups.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="Aucune aide trouvée"
            description="Essayez un autre mot-clé ou ouvrez directement l'assistant."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {filteredGroups.map((group, index) => {
            const GroupIcon = group.icon;
            return (
              <AiCollapsibleSection
                key={`${group.key}-${search}`}
                title={group.label}
                icon={GroupIcon}
                badge={`${group.items.length} action(s)`}
                defaultOpen={Boolean(search) || index === 0}
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) =>
                    item.to ? (
                      <Link
                        key={item.key}
                        to={item.to}
                        className="group rounded-lg border border-border-soft bg-surface/70 p-3.5 shadow-card transition-colors hover:border-primary/40 hover:bg-surface-2/60"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-semibold text-foreground">
                            {item.title}
                          </p>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted">
                          {item.description}
                        </p>
                        <span className="mt-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-accent">
                          Ouvrir
                        </span>
                      </Link>
                    ) : (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => openAi(null, item.prompt)}
                        disabled={!canUse}
                        className={cn(
                          "group rounded-lg border border-border-soft bg-surface/70 p-3.5 text-left shadow-card transition-colors hover:border-primary/40 hover:bg-surface-2/60",
                          !canUse && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] font-semibold text-foreground">
                            {item.title}
                          </p>
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-colors group-hover:text-accent" />
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted">
                          {item.description}
                        </p>
                        <span className="mt-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-accent">
                          Demander à l'IA
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </AiCollapsibleSection>
            );
          })}
        </div>
      )}

      <Card id="outils" className="panel-sheen scroll-mt-24 border-primary/20">
        <CardHeader>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Catalogue
            </p>
            <h2 className="text-base font-semibold text-foreground">
              Tous les outils de l'assistant
            </h2>
            <p className="mt-1 text-xs text-muted">
              {tools.length} outil(s) de lecture accessibles avec vos permissions, classés par
              domaine.
            </p>
          </div>
          <Cpu className="h-4 w-4 text-accent" />
        </CardHeader>
        <CardContent className="space-y-5 pt-3">
          {toolsQuery.isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ) : toolGroups.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-muted-2">
              Aucun outil accessible. Vérifiez vos permissions.
            </p>
          ) : (
            toolGroups.map((group, index) => {
              const GroupIcon = group.icon;
              return (
                <AiCollapsibleSection
                  key={group.key}
                  title={group.label}
                  description={group.description}
                  icon={GroupIcon}
                  badge={`${group.tools.length} outil(s)`}
                  defaultOpen={index === 0}
                >
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.tools.map((tool) => (
                      <div
                        key={tool.key}
                        className="rounded-xl border border-border-soft bg-background/40 p-3 transition-colors hover:border-primary/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground">{tool.label}</p>
                          <Badge tone="neutral" className="text-[9px]">
                            Lecture
                          </Badge>
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted">
                          {tool.description}
                        </p>
                        <p className="mt-2 font-mono text-[9px] text-muted-2">
                          {tool.permission}
                        </p>
                      </div>
                    ))}
                  </div>
                </AiCollapsibleSection>
              );
            })
          )}
        </CardContent>
      </Card>

      <div id="actions" className="grid scroll-mt-24 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="panel-sheen border-primary/20">
          <CardHeader>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                Actions assistées
              </p>
              <h2 className="text-base font-semibold text-foreground">
                Ce que l'assistant peut préparer
              </h2>
              <p className="mt-1 text-xs text-muted">
                {availableActions.length} action(s) disponible(s). Rien n'est enregistré sans
                votre confirmation.
              </p>
            </div>
            <LayoutGrid className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent className="grid gap-2 pt-3 sm:grid-cols-2">
            {actionCapabilities.map((action) => {
              const Icon = action.icon;
              const allowed = availableActions.some((item) => item.type === action.type);
              return (
                <div
                  key={action.type}
                  className={cn(
                    "rounded-xl border border-border-soft bg-background/40 p-3",
                    !allowed && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary-strong">
                      <Icon className="h-4 w-4" />
                    </span>
                    <Badge tone={allowed ? "success" : "neutral"}>
                      {allowed ? "Disponible" : "Permission requise"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-foreground">{action.label}</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted">{action.description}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    disabled={!allowed || !canUse}
                    onClick={() => openAi(null, action.prompt)}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Demander à l'IA
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="panel-sheen border-primary/20">
          <CardHeader>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                Bonnes pratiques
              </p>
              <h2 className="text-sm font-semibold text-foreground">
                Utiliser l'IA sans risque
              </h2>
            </div>
            <ShieldCheck className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent className="space-y-2 pt-3 text-[11px] leading-5 text-muted">
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              Les réponses s'appuient sur les données auxquelles vous avez accès.
            </p>
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              Les actions proposées ne sont exécutées qu'après confirmation.
            </p>
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              Les numéros d'engagement et les montants restent à vérifier avant validation.
            </p>
            <p className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              Aucune clé d'API ni secret n'est exposé dans les réponses.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/aide"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Aide SI PILOT
              </Link>
              <Link
                to="/statistiques"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Statistiques
              </Link>
              <Link
                to="/fournisseurs"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                <Wallet className="h-3.5 w-3.5" />
                Achats
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card id="taches" className="panel-sheen scroll-mt-24 border-primary/20">
        <CardHeader>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Tâches guidées
            </p>
            <h2 className="text-base font-semibold text-foreground">
              Analyser, rédiger, contrôler, préparer
            </h2>
            <p className="mt-1 text-xs text-muted">
              {aiTaskGroups.reduce((total, group) => total + group.tasks.length, 0)} tâches
              prêtes à lancer. Elles n'écrivent rien sans confirmation.
            </p>
          </div>
          <Search className="h-4 w-4 text-accent" />
        </CardHeader>
        <CardContent className="space-y-2 pt-3">
          {aiTaskGroups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <AiCollapsibleSection
                key={group.key}
                title={group.label}
                description={group.description}
                icon={GroupIcon}
                badge={`${group.tasks.length} tâche(s)`}
              >
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {group.tasks.map((task) => (
                    <button
                      key={task.title}
                      type="button"
                      onClick={() => openAi(null, task.prompt)}
                      disabled={!canUse}
                      className="group rounded-lg border border-border-soft bg-surface/70 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-semibold text-foreground">{task.title}</p>
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-colors group-hover:text-accent" />
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-muted">{task.prompt}</p>
                    </button>
                  ))}
                </div>
              </AiCollapsibleSection>
            );
          })}
        </CardContent>
      </Card>

      <Card id="integrations" className="panel-sheen scroll-mt-24 border-primary/20">
        <CardHeader>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Intégrations
            </p>
            <h2 className="text-base font-semibold text-foreground">
              Les systèmes que l'assistant peut exploiter
            </h2>
            <p className="mt-1 text-xs text-muted">
              {availableIntegrations.length} intégration(s) accessible(s) sur votre périmètre.
              Cliquez pour ouvrir l'écran correspondant.
            </p>
          </div>
          <Plug className="h-4 w-4 text-accent" />
        </CardHeader>
        <CardContent className="grid gap-2 pt-3 sm:grid-cols-2 xl:grid-cols-3">
          {aiIntegrations.map((integration) => {
            const Icon = integration.icon;
            const enabled = availableIntegrationKeys.has(integration.key);
            return (
              <Link
                key={integration.key}
                to={enabled ? integration.to : "#"}
                onClick={(event) => {
                  if (!enabled) event.preventDefault();
                }}
                className={cn(
                  "group rounded-xl border border-border-soft bg-background/40 p-3 transition-all",
                  enabled
                    ? "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                    : "pointer-events-none opacity-50",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary-strong">
                    <Icon className="h-4 w-4" />
                  </span>
                  <Badge tone={enabled ? "success" : "neutral"}>
                    {enabled ? "Disponible" : "Indisponible"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs font-semibold text-foreground">{integration.label}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted">
                  {integration.description}
                </p>
                {enabled ? (
                  <span className="mt-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-accent">
                    Ouvrir
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                ) : (
                  <span className="mt-2 inline-block text-[9px] text-muted-2">
                    Module désactivé ou permission manquante
                  </span>
                )}
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card id="historique" className="panel-sheen scroll-mt-24 border-primary/20">
        <CardHeader>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Historique récent
            </p>
            <h2 className="text-sm font-semibold text-foreground">
              Vos dernières demandes IA
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualiser l'historique"
            onClick={() => void runsQuery.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="max-h-56 space-y-1.5 overflow-auto pt-2">
          {runsQuery.isLoading ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : runs.length === 0 ? (
            <p className="py-3 text-center text-[11px] text-muted-2">
              Aucune conversation enregistrée pour le moment.
            </p>
          ) : (
            runs.slice(0, 8).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border-soft bg-background/40 px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-medium text-foreground">
                    {run.request_summary || featureLabels[run.feature_code] || run.feature_code}
                  </p>
                  <p className="text-[9px] text-muted-2">
                    {featureLabels[run.feature_code] ?? run.feature_code} ·{" "}
                    {formatDateTime(run.created_at)}
                    {run.duration_ms != null
                      ? ` · ${formatNumber(run.duration_ms / 1000, 1)} s`
                      : ""}
                  </p>
                </div>
                <Badge tone={statusTones[run.status] ?? "neutral"}>
                  {run.status === "success"
                    ? "OK"
                    : run.status === "error"
                      ? "Erreur"
                      : run.status}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[11px] leading-5 text-muted">
            Chaque échange est journalisé dans <span className="font-mono">ai_runs</span> pour
            l'audit et le suivi. L'historique affiché ici est limité à vos propres demandes.
          </p>
        </div>
      </Card>
    </div>
  );
}
