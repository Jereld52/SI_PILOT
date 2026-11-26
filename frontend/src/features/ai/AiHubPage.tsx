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
  LifeBuoy,
  MonitorSmartphone,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
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
        key: "stats-commercial",
        title: "Statistiques achats",
        description: "Ouvrir l'onglet Achats avec ses filtres et exports.",
        to: "/statistiques",
        permission: "statistics.read",
        moduleKey: "statistics",
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
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/20 via-surface to-accent/10 p-5 shadow-2xl sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/20 text-primary-strong shadow-lg">
                <Sparkles className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
                  Assistant IA
                </p>
                <p className="text-[10px] text-muted">Votre copilote SI PILOT</p>
              </div>
            </div>
            <h1 className="mt-4 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Que voulez-vous simplifier aujourd'hui ?
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Analysez le parc, les achats, les contrats, l'infrastructure, la sécurité,
              les documents et le pilotage. L'assistant choisit les outils, résume les
              données et propose des actions à confirmer.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-muted">
              <span className="rounded-full border border-border-soft bg-background/50 px-2.5 py-1">
                Fournisseur{" "}
                <strong className="text-foreground">{status?.provider || "—"}</strong>
              </span>
              <span className="rounded-full border border-border-soft bg-background/50 px-2.5 py-1">
                Modèle <strong className="text-foreground">{status?.model || "—"}</strong>
              </span>
              <span className="rounded-full border border-border-soft bg-background/50 px-2.5 py-1">
                {tools.length} outil(s)
              </span>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1",
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
            <Button size="md" onClick={() => openAi(null, undefined)}>
              <Sparkles className="h-4 w-4" />
              Ouvrir l'assistant
            </Button>
            {canImport ? (
              <Link
                to="/import-documents"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                <FileUp className="h-4 w-4" />
                Import intelligent
              </Link>
            ) : null}
            {canConfigure ? (
              <Link
                to="/admin/ai"
                className={buttonVariants({ variant: "secondary", size: "md" })}
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
          <div className="rounded-2xl border border-primary/20 bg-background/75 p-3 shadow-2xl backdrop-blur">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={6}
              placeholder="Exemple : analyse les achats, les livraisons en retard et les bons de commande sans engagement. Propose un plan d'action."
              className="min-h-[160px] resize-y border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
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

      <Card className="panel-sheen border-primary/20 p-4">
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
          {filteredGroups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section key={group.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border-soft bg-background/40 text-accent">
                    <GroupIcon className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                </div>
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
              </section>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="panel-sheen border-primary/20">
          <CardHeader>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                Capacités
              </p>
              <h2 className="text-sm font-semibold text-foreground">Outils disponibles</h2>
              <p className="mt-1 text-xs text-muted">
                Outils de lecture accessibles avec vos permissions.
              </p>
            </div>
            <Cpu className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent className="pt-3">
            {toolsQuery.isLoading ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : tools.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-muted-2">
                Aucun outil accessible. Vérifiez vos permissions.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {tools.map((tool) => (
                  <div
                    key={tool.key}
                    className="rounded-lg border border-border-soft bg-background/40 px-2.5 py-2"
                  >
                    <p className="text-[11px] font-medium text-foreground">{tool.label}</p>
                    <p className="mt-0.5 text-[9px] leading-4 text-muted-2">
                      {tool.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
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

      <Card className="panel-sheen border-primary/20">
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
