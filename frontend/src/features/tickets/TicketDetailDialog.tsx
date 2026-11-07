import { Clock, MessageSquare, Send, UserRound } from "lucide-react";
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
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime, fullName } from "@/lib/utils";
import type { TicketDetailItem, TicketMeta, TicketUserRef } from "@/types/api";

const priorityTones: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
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
  const { hasPermission } = useAuth();
  const [statusId, setStatusId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [timeComment, setTimeComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !ticket) return;
    setStatusId(ticket.status_id);
    setAssigneeId(ticket.assignee_user_id ?? "");
    setComment("");
    setInternal(false);
    setMinutes("");
    setTimeComment("");
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
