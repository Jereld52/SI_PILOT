import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { ApiError, apiFetch } from "@/lib/api";
import type {
  CalendarActionItem,
  CalendarEventItem,
  TicketUserRef,
} from "@/types/api";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

function useSubmit(onSaved: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<unknown>, message: string, close: () => void) => {
    setLoading(true);
    setError(null);
    try {
      await action();
      toast.success(message);
      onSaved();
      close();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };
  return { loading, error, setError, submit };
}

interface EventDialogProps extends BaseDialogProps {
  event: CalendarEventItem | null;
  defaultDate: Date | null;
  users: TicketUserRef[];
  canDelete?: boolean;
  onDelete?: (event: CalendarEventItem) => void;
}

export function CalendarEventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  users,
  onSaved,
  canDelete = false,
  onDelete,
}: EventDialogProps) {
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("meeting");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [priority, setPriority] = useState("medium");
  const [ownerId, setOwnerId] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? "");
    setEventType(event?.event_type ?? "meeting");
    setStartAt(
      event ? toLocalInput(event.start_at) : defaultDate ? localDateTime(defaultDate) : "",
    );
    setEndAt(event ? toLocalInput(event.end_at) : "");
    setLocation(event?.location ?? "");
    setDescription(event?.description ?? "");
    setStatus(event?.status ?? "planned");
    setPriority(event?.priority ?? "medium");
    setOwnerId(event?.owner_user_id ?? "");
    setError(null);
  }, [open, event, defaultDate, setError]);

  const doSubmit = () => {
    if (!title.trim() || !startAt) {
      setError("Le titre et la date de début sont obligatoires.");
      return;
    }
    const payload = {
      title: title.trim(),
      event_type: eventType,
      start_at: toIso(startAt),
      end_at: toIso(endAt),
      location: nullable(location),
      description: nullable(description),
      status,
      priority,
      owner_user_id: ownerId || null,
    };
    void submit(
      () =>
        event
          ? apiFetch(`/calendar/events/${event.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/calendar/events", { method: "POST", body: JSON.stringify(payload) }),
      event ? "Événement mis à jour." : "Événement créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Modifier l'événement" : "Nouvel événement"}</DialogTitle>
          <DialogDescription>
            Maintenance, échéance, réunion ou action planifiée.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="event-title">Titre</Label>
            <Input id="event-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="event-type">Type</Label>
              <Select
                id="event-type"
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
              >
                <option value="maintenance">Maintenance</option>
                <option value="intervention">Intervention</option>
                <option value="deadline">Échéance</option>
                <option value="renewal">Renouvellement</option>
                <option value="audit">Audit</option>
                <option value="project">Projet</option>
                <option value="meeting">Réunion</option>
                <option value="action">Action</option>
                <option value="other">Autre</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="event-status">Statut</Label>
              <Select
                id="event-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="planned">Planifié</option>
                <option value="done">Terminé</option>
                <option value="cancelled">Annulé</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="event-start">Début</Label>
              <Input
                id="event-start"
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="event-end">Fin</Label>
              <Input
                id="event-end"
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="event-location">Lieu</Label>
              <Input
                id="event-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="event-priority">Priorité</Label>
              <Select
                id="event-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="low">Basse</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="event-owner">Responsable</Label>
            <Select
              id="event-owner"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
            >
              <option value="">Non précisé</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.first_name} {user.last_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="event-description">Description</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          {event && canDelete && onDelete ? (
            <Button
              variant="secondary"
              className="text-danger"
              onClick={() => {
                onDelete(event);
                onOpenChange(false);
              }}
            >
              Supprimer
            </Button>
          ) : null}
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ActionDialogProps extends BaseDialogProps {
  action: CalendarActionItem | null;
  users: TicketUserRef[];
}

export function CalendarActionDialog({
  open,
  onOpenChange,
  action,
  users,
  onSaved,
}: ActionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [module, setModule] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [dueDate, setDueDate] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(action?.title ?? "");
    setDescription(action?.description ?? "");
    setModule(action?.module ?? "");
    setPriority(action?.priority ?? "medium");
    setStatus(action?.status ?? "todo");
    setDueDate(toLocalInput(action?.due_date ?? null));
    setOwnerId(action?.owner_user_id ?? "");
    setError(null);
  }, [open, action, setError]);

  const doSubmit = () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: nullable(description),
      module: nullable(module),
      priority,
      status,
      due_date: toIso(dueDate),
      owner_user_id: ownerId || null,
    };
    void submit(
      () =>
        action
          ? apiFetch(`/calendar/actions/${action.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/calendar/actions", { method: "POST", body: JSON.stringify(payload) }),
      action ? "Action mise à jour." : "Action créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{action ? "Modifier l'action" : "Nouvelle action"}</DialogTitle>
          <DialogDescription>
            Action à réaliser, avec échéance, priorité et responsable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="calendar-action-title">Titre</Label>
            <Input
              id="calendar-action-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="calendar-action-description">Description</Label>
            <Textarea
              id="calendar-action-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="calendar-action-module">Module</Label>
              <Input
                id="calendar-action-module"
                value={module}
                onChange={(event) => setModule(event.target.value)}
                placeholder="parc, réseau, sécurité…"
              />
            </div>
            <div>
              <Label htmlFor="calendar-action-owner">Responsable</Label>
              <Select
                id="calendar-action-owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="calendar-action-priority">Priorité</Label>
              <Select
                id="calendar-action-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="low">Basse</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="calendar-action-status">Statut</Label>
              <Select
                id="calendar-action-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="blocked">Bloquée</option>
                <option value="done">Terminée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="calendar-action-due">Échéance</Label>
              <Input
                id="calendar-action-due"
                type="datetime-local"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={doSubmit}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
