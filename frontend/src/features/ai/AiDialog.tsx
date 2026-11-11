import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Copy,
  LockKeyhole,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { useBranding } from "@/features/branding/BrandingProvider";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  AiChatResponse,
  AiContextRef,
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
}

const genericPrompts = [
  "Fais-moi un bilan du parc informatique.",
  "Quels postes sont en panne ?",
  "Quels équipements sont à renouveler ou hors garantie ?",
  "Quelles mises à jour WAPT sont en attente ?",
  "Quels tickets sont en retard ?",
  "Quels contrats arrivent à échéance ?",
  "Quels incidents de sécurité sont ouverts ?",
  "Prépare un bilan mensuel pour la direction.",
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
  const branding = useBranding();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoStarted = useRef<string>("");

  const canUse = hasPermission("ai.use");
  const canConfigure = hasPermission("ai.configure");
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
  const status = statusQuery.data;
  const tools = toolsQuery.data ?? [];
  const toolLabels = new Map(tools.map((tool) => [tool.key, tool.label]));

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) return;
    setMessages([]);
    setInput("");
    setError(null);
    setCopiedIndex(null);
    autoStarted.current = "";
  }, [open, contextKey]);

  const payloadContext = context
    ? { type: context.type, id: context.id }
    : undefined;

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
        },
      ]);
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
        },
      ]);
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

  const prompts = context ? contextPrompts[context.type] ?? genericPrompts : genericPrompts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-primary-strong/20 bg-primary/15 text-primary-strong">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Assistant IA
            {status ? (
              <Badge
                tone={
                  !status.enabled
                    ? "neutral"
                    : status.configured
                      ? "success"
                      : "warning"
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
            {status?.model ? (
              <span className="font-mono text-[10px] font-normal text-muted-2">
                {status.model}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Aide à l'analyse du parc, des demandes, des logiciels, des contrats et des échéances de{" "}
            {branding.organization_name || "votre structure"}.
          </DialogDescription>
        </DialogHeader>

        {!canUse ? (
          <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
            Votre rôle ne permet pas d'utiliser l'assistant IA.
          </div>
        ) : statusQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : !status?.enabled ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border-soft bg-background-soft/60 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                <LockKeyhole className="h-3.5 w-3.5 text-primary-strong" />
                Assistant IA désactivé
              </p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                L'intégration est configurée mais désactivée. Un administrateur peut l'activer dans
                Administration → Assistant IA.
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
          <div className="space-y-3">
            <div className="rounded-lg border border-border-soft bg-background-soft/60 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                <LockKeyhole className="h-3.5 w-3.5 text-primary-strong" />
                Assistant non configuré
              </p>
              <p className="mt-1 text-[11px] leading-5 text-muted">
                Un administrateur doit connecter un fournisseur : OpenAI, Azure OpenAI, Mistral,
                Gemini, Anthropic, Ollama local, Open WebUI ou tout endpoint compatible OpenAI.
              </p>
            </div>
            <div className="rounded-lg border border-border-soft bg-background-soft/60 p-3">
              <p className="text-xs font-medium text-foreground">Ce que l'assistant pourra faire</p>
              <ul className="mt-1 grid gap-1 text-[11px] leading-5 text-muted sm:grid-cols-2">
                <li>• Bilan du parc, pannes et renouvellements</li>
                <li>• Postes avec mises à jour WAPT en attente</li>
                <li>• Analyse des demandes et priorités</li>
                <li>• Échéances de contrats et garanties</li>
                <li>• Synthèses et comptes rendus</li>
                <li>• Aide à la qualification d'incidents</li>
              </ul>
            </div>
            <p className="flex items-start gap-2 text-[10px] leading-4 text-muted-2">
              <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" />
              Aucune donnée n'est transmise tant que l'intégration n'est pas activée et testée.
            </p>
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
          <>
            <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-border-soft bg-background-soft/40 p-3">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted">
                    {context
                      ? "Contexte chargé. Choisissez une action ou posez votre question."
                      : "Posez une question sur le parc ou choisissez une suggestion."}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {prompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void send(prompt)}
                        className="rounded-lg border border-border-soft bg-background/60 px-2.5 py-2 text-left text-[11px] text-foreground transition-colors hover:border-primary/35 hover:bg-surface-2"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  {tools.length > 0 ? (
                    <details className="rounded-lg border border-border-soft bg-background/40 px-2.5 py-2">
                      <summary className="cursor-pointer text-[10px] font-medium text-muted">
                        Outils de lecture disponibles ({tools.length})
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tools.map((tool) => (
                          <Badge
                            key={tool.key}
                            tone="neutral"
                            className="text-[9px]"
                            title={tool.description}
                          >
                            {tool.label}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 text-[9px] leading-4 text-muted-2">
                        L'assistant choisit automatiquement les outils utiles et respecte vos
                        permissions. Aucune donnée n'est modifiée.
                      </p>
                    </details>
                  ) : null}
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary/15 px-3 py-2 text-xs text-foreground"
                        : "mr-auto max-w-[92%] rounded-lg border border-border-soft bg-background/70 px-3 py-2 text-xs leading-5 text-foreground"
                    }
                  >
                    {message.role === "assistant" ? (
                      <MarkdownText text={message.content} />
                    ) : (
                      message.content
                    )}
                    {message.role === "assistant" ? (
                      <>
                        {message.tools && message.tools.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-border-soft/60 pt-1.5">
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
                        <div className="mt-1.5 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] text-muted-2"
                            onClick={() => void copyMessage(message.content, index)}
                          >
                            {copiedIndex === index ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            Copier
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ))
              )}
              {sending ? (
                <div className="mr-auto rounded-lg border border-border-soft bg-background/70 px-3 py-2 text-[11px] text-muted">
                  L'assistant analyse le contexte…
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            {error ? (
              <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                {error}
              </p>
            ) : null}

            <div className="space-y-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={2}
                placeholder="Posez une question sur le parc, les demandes, les logiciels, les contrats…"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={sending}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Nouvelle conversation
                </Button>
                <Button size="sm" loading={sending} onClick={() => void send()}>
                  <Send className="h-3.5 w-3.5" />
                  Envoyer
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-[10px] leading-4 text-muted-2">
                <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" />
                L'assistant ne modifie pas les données. Vérifiez ses réponses avant toute action.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
