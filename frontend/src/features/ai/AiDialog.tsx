import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarPlus,
  Check,
  Copy,
  FileText,
  History,
  LayoutGrid,
  LockKeyhole,
  MessageSquare,
  Plug,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  actionCapabilities,
  aiIntegrations,
  groupTools,
  workspacePromptGroups,
} from "@/features/ai/aiCatalog";
import { useAuth } from "@/features/auth/AuthProvider";
import { useBranding } from "@/features/branding/BrandingProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type {
  AiActionExecuteResponse,
  AiActionProposal,
  AiChatResponse,
  AiContextRef,
  AiRunItem,
  AiStatus,
  AiToolInfo,
} from "@/types/api";

interface AiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: AiContextRef | null;
  initialPrompt?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  suggestions?: string[];
  actions?: AiActionProposal[];
  actionsDone?: boolean;
  actionsIgnored?: boolean;
}

type WorkspaceView =
  | "chat"
  | "prompts"
  | "tools"
  | "actions"
  | "integrations"
  | "history";

const genericPrompts = [
  "Fais-moi le briefing du jour.",
  "Prépare le bilan mensuel pour la direction.",
  "Fais-moi un bilan du parc informatique.",
  "Quels postes sont en panne ?",
  "Quels équipements sont à renouveler ou hors garantie ?",
  "Quelles mises à jour WAPT sont en attente ?",
  "Quels tickets sont en retard ?",
  "Quels contrats arrivent à échéance ?",
  "Quels devis sont en attente ?",
  "Quels bons de commande n'ont pas de numéro d'engagement ?",
  "Quelles livraisons sont en retard ?",
  "Quels incidents de sécurité sont ouverts ?",
  "Prépare une synthèse pour la direction.",
];

const contextPrompts: Record<string, string[]> = {
  asset: [
    "Analyse ce poste : état, risques et points d'attention.",
    "Ce poste doit-il être renouvelé ?",
    "Quelles mises à jour sont prioritaires sur ce poste ?",
    "Prépare une fiche de diagnostic pour ce poste.",
  ],
  ticket: [
    "Résume cette demande.",
    "Propose une qualification et une priorité.",
    "Rédige une réponse à l'utilisateur.",
    "Quelles informations manquent pour traiter cette demande ?",
  ],
  meeting: [
    "Résume cette réunion.",
    "Extrais les décisions et les actions.",
    "Prépare le prochain point avec la responsable.",
  ],
  training: [
    "Résume cette formation.",
    "Propose un plan de suivi pour les participants.",
    "Rédige une communication aux participants.",
  ],
  communication: [
    "Améliore ce message.",
    "Propose une version plus courte.",
    "Adapte le ton pour les utilisateurs.",
  ],
};

const contextLabels: Record<string, string> = {
  asset: "Poste",
  ticket: "Demande",
  meeting: "Réunion",
  training: "Formation",
  communication: "Communication",
};

const actionPriorityLabels: Record<string, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
};

const actionTypeLabels: Record<string, string> = {
  create_action: "Action de suivi",
  create_ticket: "Demande IT",
  create_meeting: "Réunion",
  create_communication: "Communication",
  create_quote: "Devis",
  create_purchase_order: "Bon de commande",
};

const actionButtonLabels: Record<string, string> = {
  create_action: "Créer l'action",
  create_ticket: "Créer la demande",
  create_meeting: "Créer la réunion",
  create_communication: "Créer le brouillon",
  create_quote: "Créer le devis",
  create_purchase_order: "Créer le bon de commande",
};

const actionIcons: Record<string, typeof CalendarPlus> = {
  create_action: CalendarPlus,
  create_ticket: Sparkles,
  create_meeting: CalendarPlus,
  create_communication: Send,
  create_quote: FileText,
  create_purchase_order: ShoppingCart,
};

const featureLabels: Record<string, string> = {
  assistant_chat: "Conversation",
  ai_compose: "Rédaction assistée",
  document_intake: "Import documentaire",
  ticket_triage: "Copilote de demande",
  daily_briefing: "Briefing du jour",
  monthly_report_summary: "Bilan mensuel",
};

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={index}
              className="rounded bg-background/70 px-1 py-0.5 font-mono text-[10px] text-accent"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-1" />;
        if (trimmed.startsWith("### ")) {
          return (
            <p key={index} className="text-xs font-semibold text-foreground">
              <InlineText text={trimmed.slice(4)} />
            </p>
          );
        }
        if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
          return (
            <p key={index} className="text-xs font-semibold text-foreground">
              <InlineText text={trimmed.replace(/^#+\s/, "")} />
            </p>
          );
        }
        if (/^[-*]\s/.test(trimmed)) {
          return (
            <div key={index} className="flex gap-1.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>
                <InlineText text={trimmed.replace(/^[-*]\s/, "")} />
              </span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          return (
            <p key={index} className="pl-3">
              <InlineText text={trimmed} />
            </p>
          );
        }
        return (
          <p key={index}>
            <InlineText text={line} />
          </p>
        );
      })}
    </div>
  );
}

export function AiDialog({ open, onOpenChange, context, initialPrompt }: AiDialogProps) {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const branding = useBranding();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>("chat");
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [promptSearch, setPromptSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoStarted = useRef<string>("");

  const canUse = hasPermission("ai.use");
  const canConfigure = hasPermission("ai.configure");
  const canCreateAction = hasPermission("actions.create");
  const canCreateTicket = hasPermission("tickets.create");
  const canCreateMeeting = hasPermission("meetings.manage");
  const canCreateCommunication = hasPermission("communications.manage");
  const canManageCommercial = hasPermission("suppliers.manage");
  const canExecuteAction = (type: string) =>
    type === "create_ticket"
      ? canCreateTicket
      : type === "create_meeting"
        ? canCreateMeeting
        : type === "create_communication"
          ? canCreateCommunication
          : type === "create_quote" || type === "create_purchase_order"
            ? canManageCommercial
            : canCreateAction;
  const contextKey = context ? `${context.type}:${context.id}` : "general";

  const statusQuery = useQuery({
    queryKey: ["ai", "status"],
    queryFn: () => apiFetch<AiStatus>("/ai/status"),
    enabled: open && canUse,
  });
  const toolsQuery = useQuery({
    queryKey: ["ai", "tools"],
    queryFn: () => apiFetch<AiToolInfo[]>("/ai/tools"),
    enabled: open && canUse,
    staleTime: 5 * 60_000,
  });
  const runsQuery = useQuery({
    queryKey: ["ai", "runs", 20],
    queryFn: () => apiFetch<AiRunItem[]>("/ai/runs?limit=20"),
    enabled: open && canUse && view === "history",
  });
  const status = statusQuery.data;
  const tools = toolsQuery.data ?? [];

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
  const toolGroups = useMemo(() => groupTools(tools), [tools]);
  const filteredToolGroups = useMemo(() => {
    const needle = toolSearch.trim().toLowerCase();
    return toolGroups
      .filter((group) => !activeDomain || group.key === activeDomain)
      .map((group) => ({
        ...group,
        tools: group.tools.filter((tool) =>
          needle
            ? `${tool.label} ${tool.description}`.toLowerCase().includes(needle)
            : true,
        ),
      }))
      .filter((group) => group.tools.length > 0);
  }, [activeDomain, toolGroups, toolSearch]);
  const filteredPromptGroups = useMemo(() => {
    const needle = promptSearch.trim().toLowerCase();
    return workspacePromptGroups
      .map((group) => ({
        ...group,
        prompts: group.prompts.filter((prompt) =>
          needle
            ? `${prompt.title} ${prompt.prompt}`.toLowerCase().includes(needle)
            : true,
        ),
      }))
      .filter((group) => group.prompts.length > 0);
  }, [promptSearch]);
  const toolLabels = useMemo(() => new Map(tools.map((tool) => [tool.key, tool.label])), [tools]);

  const menuItems = [
    {
      key: "chat" as const,
      label: "Conversation",
      icon: MessageSquare,
      hint: messages.length > 0 ? `${messages.length} message(s)` : "Espace de dialogue",
    },
    {
      key: "prompts" as const,
      label: "Raccourcis",
      icon: Zap,
      hint: `${workspacePromptGroups.reduce((total, group) => total + group.prompts.length, 0)} requêtes prêtes`,
    },
    {
      key: "tools" as const,
      label: "Outils",
      icon: Wrench,
      hint: `${tools.length} outil(s) accessible(s)`,
    },
    {
      key: "actions" as const,
      label: "Actions",
      icon: Sparkles,
      hint: `${availableActions.length} action(s) assistée(s)`,
    },
    {
      key: "integrations" as const,
      label: "Intégrations",
      icon: Plug,
      hint: `${availableIntegrations.length} connexion(s)`,
    },
    {
      key: "history" as const,
      label: "Historique",
      icon: History,
      hint: "Vos dernières demandes",
    },
  ];

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open, view]);

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput("");
    setError(null);
    setCopiedIndex(null);
    setView("chat");
    setActiveDomain(null);
    setPromptSearch("");
    setToolSearch("");
    autoStarted.current = "";
  }, [open, contextKey]);

  const payloadContext = context ? { type: context.type, id: context.id } : undefined;

  const complete = async (history: ChatMessage[]) => {
    return apiFetch<AiChatResponse>("/ai/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: history.slice(-12),
        include_context: true,
        context: payloadContext,
      }),
    });
  };

  const startWithPrompt = async (prompt: string) => {
    setView("chat");
    const userMessage: ChatMessage = { role: "user", content: prompt };
    setMessages([userMessage]);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const result = await complete([userMessage]);
      setMessages([
        userMessage,
        {
          role: "assistant",
          content: result.message,
          tools: result.tools_used,
          suggestions: result.suggestions,
          actions: result.actions,
        },
      ]);
      void queryClient.invalidateQueries({ queryKey: ["ai", "runs"] });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "L'assistant IA est indisponible.",
      );
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!open || !initialPrompt) return;
    const key = `${contextKey}:${initialPrompt}`;
    if (autoStarted.current === key) return;
    autoStarted.current = key;
    void startWithPrompt(initialPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPrompt, contextKey]);

  const send = async (prompt?: string) => {
    const content = (prompt ?? input).trim();
    if (!content || sending) return;
    setView("chat");
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const result = await complete(next);
      setMessages([
        ...next,
        {
          role: "assistant",
          content: result.message,
          tools: result.tools_used,
          suggestions: result.suggestions,
          actions: result.actions,
        },
      ]);
      void queryClient.invalidateQueries({ queryKey: ["ai", "runs"] });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "L'assistant IA est indisponible.",
      );
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    setError(null);
    setCopiedIndex(null);
    setView("chat");
    autoStarted.current = "";
  };

  const copyMessage = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      toast.success("Réponse copiée.");
      window.setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      toast.error("Copie impossible.");
    }
  };

  const executeAction = async (action: AiActionProposal, index: number) => {
    const key = `${index}-${action.title}`;
    setExecutingAction(key);
    try {
      const result = await apiFetch<AiActionExecuteResponse>("/ai/actions/execute", {
        method: "POST",
        body: JSON.stringify(action),
      });
      setMessages((current) =>
        current.map((message, messageIndex) =>
          messageIndex === index ? { ...message, actionsDone: true } : message,
        ),
      );
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["ai", "runs"] });
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Création de l'action impossible.",
      );
    } finally {
      setExecutingAction(null);
    }
  };

  const openIntegration = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const prompts = context ? contextPrompts[context.type] ?? genericPrompts : genericPrompts;
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const lastTools = lastAssistantMessage?.tools ?? [];

  const renderChatMessage = (message: ChatMessage, index: number) => (
    <div
      key={index}
      className={
        message.role === "user"
          ? "ml-auto max-w-[88%] whitespace-pre-wrap rounded-2xl bg-primary/15 px-4 py-2.5 text-sm text-foreground shadow-sm"
          : "mr-auto max-w-[94%] rounded-2xl border border-border-soft bg-background/75 px-4 py-3 text-sm leading-6 text-foreground shadow-sm"
      }
    >
      {message.role === "assistant" ? <MarkdownText text={message.content} /> : message.content}
      {message.role === "assistant" &&
      message.actions?.length &&
      !message.actionsIgnored ? (
        <div className="mt-3 space-y-2">
          {message.actions.map((action) => {
            const ActionIcon = actionIcons[action.type] ?? CalendarPlus;
            return (
              <div
                key={`${action.type}-${action.title}`}
                className="rounded-xl border border-accent/30 bg-accent/5 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{action.title}</p>
                    {action.description ? (
                      <p className="mt-0.5 text-[11px] leading-5 text-muted">
                        {action.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-muted-2">
                      {actionTypeLabels[action.type] ?? action.type}
                      {action.type === "create_ticket"
                        ? ` · priorité ${
                            actionPriorityLabels[action.priority] ?? action.priority
                          }${action.category ? ` · ${action.category}` : ""}`
                        : ""}
                      {action.type === "create_meeting" && action.scheduled_at
                        ? ` · ${new Date(action.scheduled_at).toLocaleString("fr-FR")}`
                        : ""}
                      {action.type === "create_action" && action.due_date
                        ? ` · échéance ${formatDate(action.due_date)}`
                        : ""}
                      {action.type === "create_quote" ||
                      action.type === "create_purchase_order"
                        ? `${
                            action.supplier_name ? ` · ${action.supplier_name}` : ""
                          }${
                            action.engagement_number
                              ? ` · engagement ${action.engagement_number}`
                              : ""
                          }${
                            action.amount_ttc != null
                              ? ` · ${formatCurrency(action.amount_ttc, 2)} TTC`
                              : ""
                          }${
                            action.source_quote_reference
                              ? ` · depuis ${action.source_quote_reference}`
                              : ""
                          }`
                        : ""}
                    </p>
                  </div>
                  <Badge tone={message.actionsDone ? "success" : "info"}>
                    {message.actionsDone
                      ? "Créé"
                      : actionTypeLabels[action.type] ?? "Action proposée"}
                  </Badge>
                </div>
                {!message.actionsDone ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {canExecuteAction(action.type) ? (
                      <Button
                        size="sm"
                        loading={executingAction === `${index}-${action.title}`}
                        onClick={() => void executeAction(action, index)}
                      >
                        <ActionIcon className="h-3.5 w-3.5" />
                        {actionButtonLabels[action.type] ?? "Confirmer"}
                      </Button>
                    ) : (
                      <span className="text-[10px] text-warning">
                        Permission requise pour créer cet élément.
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setMessages((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, actionsIgnored: true }
                              : item,
                          ),
                        )
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                      Ignorer
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {message.role === "assistant" && message.suggestions?.length && !sending ? (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border-soft/60 pt-2">
          {message.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void send(suggestion)}
              className="rounded-full border border-border-soft bg-background/60 px-2.5 py-1 text-[10px] text-muted transition-colors hover:border-primary/35 hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      {message.role === "assistant" ? (
        <>
          {message.tools && message.tools.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border-soft/60 pt-2">
              <span className="text-[9px] uppercase tracking-wide text-muted-2">
                Outils :
              </span>
              {message.tools.map((key) => (
                <Badge key={key} tone="neutral" className="text-[9px]">
                  {toolLabels.get(key) ?? key}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px] text-muted-2"
              onClick={() => void copyMessage(message.content, index)}
            >
              {copiedIndex === index ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              Copier
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );

  const renderChatView = () => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-4xl space-y-5 py-2">
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 text-primary-strong shadow-lg">
                <Sparkles className="h-7 w-7" />
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                Que voulez-vous simplifier aujourd'hui ?
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted">
                {context
                  ? "Contexte chargé. Choisissez une action ou posez votre question."
                  : `Interrogez ${branding.organization_name || "votre système d'information"} : parc, support, achats, infrastructure, sécurité, documents et pilotage.`}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(context ? prompts : genericPrompts.slice(0, 8)).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="group flex items-start gap-2 rounded-xl border border-border-soft bg-background/60 px-3 py-2.5 text-left text-xs text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface-2 hover:shadow-lg"
                >
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                  <span className="flex-1">{prompt}</span>
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-2 transition-colors group-hover:text-accent" />
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => setView("tools")}
                className="rounded-xl border border-border-soft bg-surface/60 p-3 text-left transition-colors hover:border-primary/35"
              >
                <Wrench className="h-4 w-4 text-accent" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  {tools.length} outils connectés
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted">
                  Parc, support, achats, infrastructure, sécurité…
                </p>
              </button>
              <button
                type="button"
                onClick={() => setView("actions")}
                className="rounded-xl border border-border-soft bg-surface/60 p-3 text-left transition-colors hover:border-primary/35"
              >
                <Sparkles className="h-4 w-4 text-accent" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  {availableActions.length} actions assistées
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted">
                  Créer, préparer, rédiger avec confirmation.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setView("integrations")}
                className="rounded-xl border border-border-soft bg-surface/60 p-3 text-left transition-colors hover:border-primary/35"
              >
                <Plug className="h-4 w-4 text-accent" />
                <p className="mt-2 text-xs font-semibold text-foreground">
                  {availableIntegrations.length} intégrations
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-muted">
                  WAPT, Veeam, OCR, réseau, SMTP, LDAP…
                </p>
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl space-y-4">
            {messages.map(renderChatMessage)}
            {sending ? (
              <div className="mr-auto flex max-w-[70%] items-center gap-2 rounded-2xl border border-border-soft bg-background/75 px-4 py-3 text-sm text-muted">
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.2s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                </span>
                L'assistant analyse le contexte…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border-soft bg-surface/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-4xl space-y-2">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              {error}
            </p>
          ) : null}
          {messages.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {prompts.slice(0, 4).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="rounded-full border border-border-soft bg-background/50 px-2.5 py-1 text-[10px] text-muted transition-colors hover:border-primary/35 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          <div className="rounded-2xl border border-border-soft bg-background/70 p-2 shadow-lg focus-within:border-primary/40">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder="Posez une question sur le parc, les demandes, les achats, l'infrastructure…"
              className="min-h-[84px] resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={sending}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Nouveau
                </Button>
                <span className="hidden text-[10px] text-muted-2 sm:inline">
                  Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne
                </span>
              </div>
              <Button
                size="sm"
                loading={sending}
                onClick={() => void send()}
                disabled={!input.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                Envoyer
              </Button>
            </div>
          </div>
          <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-2">
            <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" />
            L'assistant respecte vos permissions. Les actions proposées ne sont créées
            qu'après confirmation.
          </p>
        </div>
      </div>
    </div>
  );

  const renderPromptsView = () => (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Raccourcis
            </p>
            <h2 className="text-lg font-semibold text-foreground">Requêtes prêtes à l'emploi</h2>
            <p className="text-xs text-muted">
              Cliquez sur une requête pour l'envoyer directement à l'assistant.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-2" />
            <Input
              value={promptSearch}
              onChange={(event) => setPromptSearch(event.target.value)}
              placeholder="Rechercher un raccourci…"
              className="pl-8"
            />
          </div>
        </div>

        {filteredPromptGroups.length === 0 ? (
          <p className="rounded-xl border border-border-soft bg-background/40 py-8 text-center text-xs text-muted-2">
            Aucun raccourci trouvé.
          </p>
        ) : (
          <div className="space-y-4">
            {filteredPromptGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <section key={group.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border-soft bg-background/40 text-accent">
                      <GroupIcon className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.prompts.map((prompt) => (
                      <button
                        key={prompt.title}
                        type="button"
                        onClick={() => void send(prompt.prompt)}
                        className="group rounded-xl border border-border-soft bg-surface/60 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground">{prompt.title}</p>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-colors group-hover:text-accent" />
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted">{prompt.prompt}</p>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderToolsView = () => (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Outils connectés
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              Tout ce que l'assistant peut interroger
            </h2>
            <p className="text-xs text-muted">
              {tools.length} outil(s) de lecture accessibles avec vos permissions.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-2" />
            <Input
              value={toolSearch}
              onChange={(event) => setToolSearch(event.target.value)}
              placeholder="Rechercher un outil…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveDomain(null)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
              !activeDomain
                ? "border-primary/40 bg-primary/15 text-foreground"
                : "border-border-soft bg-background/50 text-muted hover:text-foreground",
            )}
          >
            Tous ({tools.length})
          </button>
          {toolGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => setActiveDomain(group.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] transition-colors",
                activeDomain === group.key
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border-soft bg-background/50 text-muted hover:text-foreground",
              )}
            >
              {group.label} ({group.tools.length})
            </button>
          ))}
        </div>

        {toolsQuery.isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : filteredToolGroups.length === 0 ? (
          <p className="rounded-xl border border-border-soft bg-background/40 py-8 text-center text-xs text-muted-2">
            Aucun outil trouvé.
          </p>
        ) : (
          <div className="space-y-4">
            {filteredToolGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <section key={group.key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border-soft bg-background/40 text-accent">
                      <GroupIcon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
                      <p className="text-[10px] text-muted-2">{group.description}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.tools.map((tool) => (
                      <div
                        key={tool.key}
                        className="rounded-xl border border-border-soft bg-surface/60 p-3 transition-colors hover:border-primary/30"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-foreground">{tool.label}</p>
                          <Badge tone="neutral" className="text-[9px]">
                            Lecture
                          </Badge>
                        </div>
                        <p className="mt-1 text-[10px] leading-4 text-muted">{tool.description}</p>
                        <p className="mt-2 font-mono text-[9px] text-muted-2">{tool.permission}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderActionsView = () => (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            Actions assistées
          </p>
          <h2 className="text-lg font-semibold text-foreground">
            Ce que l'assistant peut préparer
          </h2>
          <p className="text-xs text-muted">
            Toute création reste une proposition : rien n'est enregistré sans votre
            confirmation. Les permissions de votre rôle sont appliquées.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {actionCapabilities.map((action) => {
            const Icon = action.icon;
            const allowed = canExecuteAction(action.type);
            return (
              <div
                key={action.type}
                className={cn(
                  "rounded-xl border border-border-soft bg-surface/60 p-3",
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
                <p className="mt-2 text-sm font-semibold text-foreground">{action.label}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted">{action.description}</p>
                <p className="mt-1 font-mono text-[9px] text-muted-2">{action.permission}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  disabled={!allowed}
                  onClick={() => void send(action.prompt)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Demander à l'IA
                </Button>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-warning/25 bg-warning/5 p-3 text-[11px] leading-5 text-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            Les montants, dates, numéros d'engagement et références proposés doivent toujours
            être vérifiés avant validation. L'assistant ne contourne jamais les permissions.
          </p>
        </div>
      </div>
    </div>
  );

  const renderIntegrationsView = () => (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
            Intégrations
          </p>
          <h2 className="text-lg font-semibold text-foreground">
            Les systèmes que l'assistant peut exploiter
          </h2>
          <p className="text-xs text-muted">
            L'IA s'appuie sur les modules actifs et vos permissions. Cliquez sur une
            intégration pour ouvrir l'écran correspondant.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {aiIntegrations.map((integration) => {
            const Icon = integration.icon;
            const enabled =
              (!integration.moduleKey || isEnabled(integration.moduleKey)) &&
              hasPermission(integration.permission);
            return (
              <button
                key={integration.key}
                type="button"
                onClick={() => (enabled ? openIntegration(integration.to) : undefined)}
                disabled={!enabled}
                className={cn(
                  "group rounded-xl border border-border-soft bg-surface/60 p-3 text-left transition-all",
                  enabled
                    ? "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                    : "cursor-not-allowed opacity-50",
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
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {integration.label}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted">
                  {integration.description}
                </p>
                {enabled ? (
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-accent">
                    Ouvrir
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                ) : (
                  <span className="mt-2 inline-block text-[10px] text-muted-2">
                    Module désactivé ou permission manquante
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] leading-5 text-muted">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            Les intégrations restent en lecture seule pour l'assistant. Les écritures sont
            des actions proposées, confirmées puis contrôlées côté serveur.
          </p>
        </div>
      </div>
    </div>
  );

  const renderHistoryView = () => (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
              Historique
            </p>
            <h2 className="text-lg font-semibold text-foreground">Vos dernières demandes IA</h2>
            <p className="text-xs text-muted">
              Journalisées pour l'audit et limitées à vos propres échanges.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualiser l'historique"
            onClick={() => void runsQuery.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {runsQuery.isLoading ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (runsQuery.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-border-soft bg-background/40 py-8 text-center text-xs text-muted-2">
            Aucune conversation enregistrée pour le moment.
          </p>
        ) : (
          <div className="space-y-1.5">
            {(runsQuery.data ?? []).map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-surface/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">
                    {run.request_summary || featureLabels[run.feature_code] || run.feature_code}
                  </p>
                  <p className="text-[10px] text-muted-2">
                    {featureLabels[run.feature_code] ?? run.feature_code} ·{" "}
                    {formatDateTime(run.created_at)}
                    {run.duration_ms != null
                      ? ` · ${(run.duration_ms / 1000).toFixed(1)} s`
                      : ""}
                  </p>
                </div>
                <Badge
                  tone={
                    run.status === "success"
                      ? "success"
                      : run.status === "error"
                        ? "danger"
                        : "warning"
                  }
                >
                  {run.status === "success" ? "OK" : run.status === "error" ? "Erreur" : run.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderView = () => {
    switch (view) {
      case "prompts":
        return renderPromptsView();
      case "tools":
        return renderToolsView();
      case "actions":
        return renderActionsView();
      case "integrations":
        return renderIntegrationsView();
      case "history":
        return renderHistoryView();
      case "chat":
      default:
        return renderChatView();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] max-h-[94vh] w-[97vw] max-w-[1680px] flex-col overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft bg-surface/90 px-4 py-3 pr-12 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-strong/20 bg-primary/15 text-primary-strong">
              <Sparkles className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-base font-semibold">Assistant IA</DialogTitle>
                {status ? (
                  <Badge
                    tone={
                      !status.enabled ? "neutral" : status.configured ? "success" : "warning"
                    }
                  >
                    {!status.enabled
                      ? "Désactivé"
                      : status.configured
                        ? "Connecté"
                        : "Non configuré"}
                  </Badge>
                ) : null}
                {context ? (
                  <Badge tone="info">
                    {contextLabels[context.type] ?? "Contexte"}
                    {context.label ? ` : ${context.label}` : ""}
                  </Badge>
                ) : null}
              </div>
              <DialogDescription className="truncate text-[11px]">
                Espace de travail IA · parc, support, achats, infrastructure, sécurité,
                documents et pilotage.
              </DialogDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status?.model ? (
              <span className="hidden rounded-full border border-border-soft bg-background/50 px-2.5 py-1 font-mono text-[10px] text-muted-2 sm:inline">
                {status.model}
              </span>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setView("history")}>
              <History className="h-3.5 w-3.5" />
              Historique
            </Button>
            <Button size="sm" onClick={reset} disabled={!canUse || sending}>
              <Sparkles className="h-3.5 w-3.5" />
              Nouvelle conversation
            </Button>
          </div>
        </div>

        {!canUse ? (
          <div className="m-4 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
            Votre rôle ne permet pas d'utiliser l'assistant IA.
          </div>
        ) : statusQuery.isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : !status?.enabled ? (
          <div className="m-4 max-w-2xl space-y-3">
            <div className="rounded-lg border border-border-soft bg-background-soft/60 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <LockKeyhole className="h-4 w-4 text-primary-strong" />
                Assistant IA désactivé
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                L'intégration est configurée mais désactivée. Un administrateur peut
                l'activer dans Administration → Assistant IA.
              </p>
            </div>
            {canConfigure ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/admin/ai");
                }}
              >
                Ouvrir la configuration
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ) : !status?.configured ? (
          <div className="m-4 max-w-2xl space-y-3">
            <div className="rounded-lg border border-border-soft bg-background-soft/60 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <LockKeyhole className="h-4 w-4 text-primary-strong" />
                Assistant non configuré
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Un administrateur doit connecter un fournisseur : OpenAI, Azure OpenAI,
                Mistral, Gemini, Anthropic, Ollama local, Open WebUI ou tout endpoint
                compatible OpenAI.
              </p>
            </div>
            {canConfigure ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/admin/ai");
                }}
              >
                Configurer l'assistant
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-60 shrink-0 flex-col border-r border-border-soft bg-background/35 md:flex">
              <div className="border-b border-border-soft/70 px-3 py-3">
                <Button className="w-full" onClick={reset} disabled={sending}>
                  <Sparkles className="h-3.5 w-3.5" />
                  Nouvelle conversation
                </Button>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto p-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setView(item.key)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-primary/15 text-foreground"
                          : "text-muted hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          active ? "text-accent" : "text-muted-2",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium">{item.label}</span>
                        <span className="mt-0.5 block text-[9px] leading-4 text-muted-2">
                          {item.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}

                <div className="pt-3">
                  <p className="px-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-2">
                    Domaines
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {toolGroups.map((group) => (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => {
                          setActiveDomain(group.key);
                          setView("tools");
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[10px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                      >
                        <span className="truncate">{group.label}</span>
                        <span className="shrink-0 rounded-full bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-2">
                          {group.tools.length}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </nav>
              <div className="space-y-1 border-t border-border-soft/70 p-2">
                {canConfigure ? (
                  <button
                    type="button"
                    onClick={() => openIntegration("/admin/ai")}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Configuration IA
                  </button>
                ) : null}
                <div className="rounded-lg border border-border-soft bg-background/40 px-2.5 py-2">
                  <p className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-2">
                    <ShieldCheck className="h-3 w-3 text-success" />
                    Sécurisé
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-muted-2">
                    Permissions appliquées, actions confirmées, secrets masqués.
                  </p>
                </div>
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex gap-1 overflow-x-auto border-b border-border-soft/70 px-2 py-2 md:hidden">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setView(item.key)}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px]",
                        view === item.key
                          ? "border-primary/40 bg-primary/15 text-foreground"
                          : "border-border-soft bg-background/40 text-muted",
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="min-h-0 flex-1">{renderView()}</div>
            </div>

            <aside className="hidden w-72 shrink-0 flex-col border-l border-border-soft bg-background/25 xl:flex">
              <div className="flex-1 space-y-3 overflow-y-auto p-3">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
                    État
                  </p>
                  <div className="mt-2 space-y-1.5 text-[11px] text-muted">
                    <p className="flex items-center justify-between gap-2">
                      <span>Fournisseur</span>
                      <strong className="text-foreground">{status.provider || "—"}</strong>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span>Modèle</span>
                      <strong className="truncate font-mono text-[10px] text-foreground">
                        {status.model || "—"}
                      </strong>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span>Outils</span>
                      <strong className="text-foreground">{tools.length}</strong>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span>Intégrations</span>
                      <strong className="text-foreground">{availableIntegrations.length}</strong>
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border-soft bg-surface/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-2">
                      Derniers outils
                    </p>
                    <Wrench className="h-3.5 w-3.5 text-accent" />
                  </div>
                  {lastTools.length === 0 ? (
                    <p className="mt-2 text-[10px] leading-4 text-muted-2">
                      Les outils utilisés apparaîtront ici après une première question.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {lastTools.map((key) => (
                        <Badge key={key} tone="neutral" className="text-[9px]">
                          {toolLabels.get(key) ?? key}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border-soft bg-surface/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-2">
                      Accès rapide
                    </p>
                    <LayoutGrid className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div className="mt-2 grid gap-1">
                    {[
                      { key: "prompts", label: "Raccourcis", icon: Zap },
                      { key: "tools", label: "Tous les outils", icon: Wrench },
                      { key: "actions", label: "Actions assistées", icon: Sparkles },
                      { key: "integrations", label: "Intégrations", icon: Plug },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setView(item.key as WorkspaceView)}
                          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[10px] text-muted transition-colors hover:bg-background/60 hover:text-foreground"
                        >
                          <Icon className="h-3 w-3 text-muted-2" />
                          {item.label}
                          <ArrowRight className="ml-auto h-3 w-3 text-muted-2" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    À vérifier
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-2">
                    Montants, dates, références et numéros d'engagement restent à contrôler
                    avant toute validation.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
