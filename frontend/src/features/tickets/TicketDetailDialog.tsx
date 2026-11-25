import { Check, Clock, MessageSquare, Send, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAiAssistant } from "@/features/ai/AiAssistantProvider";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime, fullName } from "@/lib/utils";
import type { TicketDetailItem, TicketMeta, TicketTriage, TicketUserRef } from "@/types/api";

const priorityTones: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const sourceLabels: Record<string, string> = {
  manual: "Saisie manuelle",
  direct: "Demande directe",
  email: "E-mail",
  tchap: "Tchap",
  phone: "Téléphone",
  portal: "Portail",
  import: "Import",
};

function statusTone(ticket: TicketDetailItem) {
  if (ticket.status.is_closed) return "success" as const;
  if (ticket.status.code === "in_progress") return "info" as const;
  if (ticket.status.code.startsWith("waiting")) return "warning" as const;
  return "neutral" as const;
}

interface TicketDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketDetailItem | null;
  meta: TicketMeta | null;
  assignees: TicketUserRef[];
  loading: boolean;
  onChanged: () => void;
}

export function TicketDetailDialog({
  open,
  onOpenChange,
  ticket,
  meta,
  assignees,
  loading,
  onChanged,
}: TicketDetailDialogProps) {
  const { hasPermission, user } = useAuth();
  const { open: openAi } = useAiAssistant();
  const [statusId, setStatusId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [timeComment, setTimeComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [triage, setTriage] = useState<TicketTriage | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [applyingTriage, setApplyingTriage] = useState(false);
  const [replyText, setReplyText] = useState("");

  useEffect(() => {
    if (!open || !ticket) return;
    setStatusId(ticket.status_id);
    setAssigneeId(ticket.assignee_user_id ?? "");
    setComment("");
    setInternal(false);
    setMinutes("");
    setTimeComment("");
    setTriage(null);
    setReplyText("");
  }, [open, ticket]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Opération impossible.");
    } finally {
      setBusy(false);
    }
  };

  const findStatus = (code: string) =>
    (meta?.statuses ?? []).find((status) => status.code === code);

  const takeCharge = async () => {
    if (!ticket || !user) return;
    const target = findStatus("in_progress");
    setBusy(true);
    try {
      if (ticket.assignee_user_id !== user.id) {
        await apiFetch(`/tickets/${ticket.id}/assign`, {
          method: "POST",
          body: JSON.stringify({ assignee_user_id: user.id }),
        });
      }
      if (target && ticket.status_id !== target.id) {
        await apiFetch(`/tickets/${ticket.id}/transition`, {
          method: "POST",
          body: JSON.stringify({ status_id: target.id }),
        });
      }
      toast.success("Ticket pris en charge.");
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Prise en charge impossible.");
    } finally {
      setBusy(false);
    }
  };

  const moveTo = (code: string, label: string) => {
    const target = findStatus(code);
    if (!target) {
      toast.error(`Statut « ${label} » non configuré.`);
      return;
    }
    void run(
      () =>
        apiFetch(`/tickets/${ticket?.id}/transition`, {
          method: "POST",
          body: JSON.stringify({ status_id: target.id }),
        }),
      `Ticket ${label.toLowerCase()}.`,
    );
  };

  const analyzeTicket = async () => {
    if (!ticket) return;
    setTriageLoading(true);
    try {
      const result = await apiFetch<TicketTriage>(`/tickets/${ticket.id}/ai/triage`, {
        method: "POST",
      });
      setTriage(result);
      setReplyText(result.suggested_reply);
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Analyse IA impossible.",
      );
    } finally {
      setTriageLoading(false);
    }
  };

  const applyTriage = async () => {
    if (!ticket || !triage) return;
    setApplyingTriage(true);
    try {
      await apiFetch(`/tickets/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          category_id: triage.category_id,
          priority_id: triage.priority_id,
        }),
      });
      toast.success("Qualification appliquée.");
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Application impossible.",
      );
    } finally {
      setApplyingTriage(false);
    }
  };

  const addSuggestedReply = async () => {
    if (!ticket || !replyText.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/tickets/${ticket.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: replyText.trim(), is_internal: false }),
      });
      toast.success("Réponse ajoutée à la demande.");
      setReplyText("");
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Ajout du commentaire impossible.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {ticket?.subject ?? "Demande IT"}
            {ticket ? <Badge tone={statusTone(ticket)}>{ticket.status.name}</Badge> : null}
            {ticket ? (
              <Badge tone={priorityTones[ticket.priority.code] ?? "neutral"}>
                {ticket.priority.name}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {ticket?.reference} · {ticket?.category.name} · ouverte le{" "}
            {ticket ? formatDateTime(ticket.opened_at) : "—"}
          </DialogDescription>
        </DialogHeader>

        {loading && !ticket ? (
          <p className="py-8 text-center text-xs text-muted">Chargement de la demande…</p>
        ) : ticket ? (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 rounded-lg border border-border-soft bg-background-soft/60 p-3 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Demandeur</p>
                <p className="mt-0.5 text-xs text-foreground">
                  {ticket.requester_agent
                    ? fullName(ticket.requester_agent.first_name, ticket.requester_agent.last_name)
                    : "Non précisé"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Service</p>
                <p className="mt-0.5 text-xs text-foreground">{ticket.service?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Assigné</p>
                <p className="mt-0.5 text-xs text-foreground">
                  {ticket.assignee
                    ? fullName(ticket.assignee.first_name, ticket.assignee.last_name)
                    : "Non assigné"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Échéance</p>
                <p className="mt-0.5 text-xs text-foreground">{formatDateTime(ticket.due_at)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Temps passé</p>
                <p className="mt-0.5 text-xs text-foreground">{ticket.time_spent_minutes} min</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Première réponse</p>
                <p className="mt-0.5 text-xs text-foreground">{formatDateTime(ticket.first_response_at)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Résolution</p>
                <p className="mt-0.5 text-xs text-foreground">{formatDateTime(ticket.resolved_at)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Clôture</p>
                <p className="mt-0.5 text-xs text-foreground">{formatDateTime(ticket.closed_at)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Origine</p>
                <p className="mt-0.5 text-xs text-foreground">
                  {sourceLabels[ticket.source] ?? ticket.source}
                </p>
              </div>
            </div>

            {ticket.description ? (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">Description</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{ticket.description}</p>
              </div>
            ) : null}

            {ticket.assets.length > 0 ? (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                  Équipements concernés
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {ticket.assets.map((asset) => (
                    <Badge key={asset.id} tone="outline">
                      {asset.asset_tag} — {asset.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 p-3">
              <p className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">
                Actions rapides
              </p>
              {hasPermission("tickets.assign") &&
              user &&
              !ticket.status.is_closed &&
              ticket.status.code !== "in_progress" ? (
                <Button size="sm" loading={busy} onClick={() => void takeCharge()}>
                  Prendre en charge
                </Button>
              ) : null}
              {hasPermission("tickets.transition") &&
              !ticket.status.is_closed &&
              ticket.status.code !== "resolved" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => moveTo("resolved", "Résolu")}
                >
                  Marquer résolu
                </Button>
              ) : null}
              {hasPermission("tickets.close") && !ticket.status.is_closed ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onClick={() => moveTo("closed", "Clos")}
                >
                  Clore
                </Button>
              ) : null}
            </div>

            {hasPermission("ai.use") ? (
              <div className="space-y-3 rounded-lg border border-accent/25 bg-accent/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-accent" />
                      Copilote de la demande
                    </p>
                    <p className="mt-0.5 text-[10px] leading-4 text-muted">
                      Résumé, qualification, doublons, informations manquantes et réponse
                      suggérée.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={triageLoading}
                    onClick={() => void analyzeTicket()}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {triage ? "Relancer l'analyse" : "Analyser avec l'IA"}
                  </Button>
                </div>

                {triage ? (
                  <div className="space-y-3">
                    <p className="whitespace-pre-wrap text-[11px] leading-5 text-foreground">
                      {triage.summary}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="info">Catégorie : {triage.category_name}</Badge>
                      <Badge tone="warning">Priorité : {triage.priority_name}</Badge>
                      <Badge tone="neutral">
                        Confiance {Math.round(triage.confidence * 100)} %
                      </Badge>
                      {hasPermission("tickets.update") ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={applyingTriage}
                          onClick={() => void applyTriage()}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Appliquer la qualification
                        </Button>
                      ) : null}
                    </div>

                    {triage.missing_info.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                          Informations manquantes
                        </p>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-muted">
                          {triage.missing_info.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {triage.duplicates.length > 0 ? (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                          Demandes similaires
                        </p>
                        <div className="mt-1 space-y-1">
                          {triage.duplicates.map((duplicate) => (
                            <div
                              key={duplicate.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-soft bg-background/50 px-2 py-1 text-[10px]"
                            >
                              <span className="text-foreground">
                                {duplicate.reference} — {duplicate.subject}
                              </span>
                              <span className="text-muted-2">
                                {duplicate.status} · {Math.round(duplicate.score * 100)} %
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {replyText ? (
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-2">
                          Réponse suggérée
                        </p>
                        <Textarea
                          className="mt-1"
                          rows={5}
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {hasPermission("tickets.comment") ? (
                            <Button
                              size="sm"
                              loading={busy}
                              onClick={() => void addSuggestedReply()}
                            >
                              <Send className="h-3.5 w-3.5" />
                              Ajouter comme commentaire
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              void navigator.clipboard
                                .writeText(replyText)
                                .then(() => toast.success("Réponse copiée."))
                                .catch(() => toast.error("Copie impossible."));
                            }}
                          >
                            Copier
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border-soft p-3">
                <p className="mb-2 text-xs font-semibold text-foreground">Statut</p>
                {hasPermission("tickets.transition") ? (
                  <div className="flex gap-2">
                    <Select value={statusId} onChange={(event) => setStatusId(event.target.value)}>
                      {(meta?.statuses ?? []).map((status) => (
                        <option key={status.id} value={status.id}>
                          {status.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={statusId === ticket.status_id}
                      onClick={() =>
                        void run(
                          () =>
                            apiFetch(`/tickets/${ticket.id}/transition`, {
                              method: "POST",
                              body: JSON.stringify({ status_id: statusId }),
                            }),
                          "Statut mis à jour.",
                        )
                      }
                    >
                      Appliquer
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted">{ticket.status.name}</p>
                )}
              </div>

              <div className="rounded-lg border border-border-soft p-3">
                <p className="mb-2 text-xs font-semibold text-foreground">Assignation</p>
                {hasPermission("tickets.assign") ? (
                  <div className="flex gap-2">
                    <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                      <option value="">Non assigné</option>
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.first_name} {user.last_name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      loading={busy}
                      onClick={() =>
                        void run(
                          () =>
                            apiFetch(`/tickets/${ticket.id}/assign`, {
                              method: "POST",
                              body: JSON.stringify({ assignee_user_id: assigneeId || null }),
                            }),
                          "Assignation enregistrée.",
                        )
                      }
                    >
                      Assigner
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted">
                    {ticket.assignee
                      ? fullName(ticket.assignee.first_name, ticket.assignee.last_name)
                      : "Non assigné"}
                  </p>
                )}
              </div>
            </div>

            {hasPermission("tickets.comment") ? (
              <div className="rounded-lg border border-border-soft p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-accent" />
                  Ajouter un commentaire
                </p>
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={3}
                  placeholder="Réponse, diagnostic, action réalisée…"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-[11px] text-muted">
                    <Checkbox
                      checked={internal}
                      onChange={(event) => setInternal(event.target.checked)}
                    />
                    Commentaire interne
                  </label>
                  <Button
                    size="sm"
                    loading={busy}
                    disabled={!comment.trim()}
                    onClick={() =>
                      void run(
                        () =>
                          apiFetch(`/tickets/${ticket.id}/comments`, {
                            method: "POST",
                            body: JSON.stringify({ body: comment, is_internal: internal }),
                          }),
                        "Commentaire ajouté.",
                      )
                    }
                  >
                    <Send className="h-3.5 w-3.5" />
                    Envoyer
                  </Button>
                </div>
              </div>
            ) : null}

            {hasPermission("tickets.update") ? (
              <div className="rounded-lg border border-border-soft p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Clock className="h-3.5 w-3.5 text-accent" />
                  Enregistrer du temps
                </p>
                <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                  <div>
                    <Label htmlFor="ticket-minutes">Minutes</Label>
                    <Input
                      id="ticket-minutes"
                      inputMode="numeric"
                      value={minutes}
                      onChange={(event) => setMinutes(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ticket-time-comment">Commentaire</Label>
                    <Input
                      id="ticket-time-comment"
                      value={timeComment}
                      onChange={(event) => setTimeComment(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={!minutes || Number(minutes) <= 0}
                      onClick={() =>
                        void run(
                          () =>
                            apiFetch(`/tickets/${ticket.id}/time-entries`, {
                              method: "POST",
                              body: JSON.stringify({
                                minutes: Number(minutes),
                                comment: timeComment.trim() || null,
                              }),
                            }),
                          "Temps enregistré.",
                        )
                      }
                    >
                      Ajouter
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <UserRound className="h-3.5 w-3.5 text-accent" />
                  Commentaires
                </p>
                {ticket.comments.length === 0 ? (
                  <p className="text-xs text-muted-2">Aucun commentaire.</p>
                ) : (
                  <div className="space-y-2">
                    {ticket.comments.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-border-soft p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-medium text-foreground">
                            {entry.author
                              ? fullName(entry.author.first_name, entry.author.last_name)
                              : "Système"}
                            {entry.is_internal ? (
                              <Badge tone="warning" className="ml-2">
                                Interne
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-[10px] text-muted-2">{formatDateTime(entry.created_at)}</p>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{entry.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">Historique</p>
                <div className="space-y-1.5">
                  {ticket.history.map((entry) => (
                    <div key={entry.id} className="flex items-start justify-between gap-2 text-[11px]">
                      <p className="text-muted">
                        <span className="font-medium text-foreground">{entry.field}</span>
                        {entry.old_value || entry.new_value
                          ? ` : ${entry.old_value ?? "—"} → ${entry.new_value ?? "—"}`
                          : ""}
                        {entry.note ? ` · ${entry.note}` : ""}
                      </p>
                      <p className="shrink-0 text-[10px] text-muted-2">
                        {formatDateTime(entry.occurred_at)}
                      </p>
                    </div>
                  ))}
                </div>
                {ticket.time_entries.length > 0 ? (
                  <div className="mt-3">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">Temps</p>
                    {ticket.time_entries.map((entry) => (
                      <p key={entry.id} className="text-[11px] text-muted">
                        {entry.minutes} min · {formatDateTime(entry.performed_on)}
                        {entry.comment ? ` · ${entry.comment}` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {ticket ? (
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                openAi(
                  {
                    type: "ticket",
                    id: ticket.id,
                    label: ticket.reference,
                  },
                  "Analyse cette demande : résumé, qualification, priorité, informations manquantes et réponse suggérée à l'utilisateur.",
                );
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Aider avec l'IA
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
