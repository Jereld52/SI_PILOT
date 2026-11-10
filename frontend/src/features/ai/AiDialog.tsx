import { useQuery } from "@tanstack/react-query";
import { ArrowRight, LockKeyhole, RefreshCw, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

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
import type { AiChatResponse, AiStatus } from "@/types/api";

interface AiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const suggestedPrompts = [
  "Fais-moi un bilan du parc informatique.",
  "Quels postes sont en panne ou à renouveler ?",
  "Quelles mises à jour WAPT sont en attente ?",
  "Quels contrats arrivent à échéance ?",
  "Quelles demandes IT sont prioritaires ?",
  "Prépare un bilan mensuel pour la direction.",
];

export function AiDialog({ open, onOpenChange }: AiDialogProps) {
  const { hasPermission } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canUse = hasPermission("ai.use");
  const canConfigure = hasPermission("ai.configure");

  const statusQuery = useQuery({
    queryKey: ["ai", "status"],
    queryFn: () => apiFetch<AiStatus>("/ai/status"),
    enabled: open && canUse,
  });
  const status = statusQuery.data;

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  const send = async (prompt?: string) => {
    const content = (prompt ?? input).trim();
    if (!content || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError(null);
    setSending(true);
    try {
      const result = await apiFetch<AiChatResponse>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: next.slice(-12),
          include_context: true,
        }),
      });
      setMessages([...next, { role: "assistant", content: result.message }]);
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
  };

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
                    Posez une question sur le parc ou choisissez une suggestion.
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {suggestedPrompts.map((prompt) => (
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
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-[85%] rounded-lg bg-primary/15 px-3 py-2 text-xs text-foreground"
                        : "mr-auto max-w-[92%] whitespace-pre-wrap rounded-lg border border-border-soft bg-background/70 px-3 py-2 text-xs leading-5 text-foreground"
                    }
                  >
                    {message.content}
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
