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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  AgentItem,
  CommunicationItem,
  MeetingItem,
  MeetingPointItem,
  Role,
  ServiceItem,
  TicketUserRef,
  TrainingItem,
} from "@/types/api";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface PickerItem {
  id: string;
  label: string;
}

function Picker({
  items,
  selected,
  onChange,
  emptyLabel = "Aucun élément disponible.",
}: {
  items: PickerItem[];
  selected: string[];
  onChange: (values: string[]) => void;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-[11px] text-muted-2">{emptyLabel}</p>;
  }
  return (
    <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border-soft bg-background/40 p-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-[11px] text-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={selected.includes(item.id)}
            onChange={(event) => {
              if (event.target.checked) {
                onChange([...selected, item.id]);
              } else {
                onChange(selected.filter((value) => value !== item.id));
              }
            }}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}

interface CommunicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communication: CommunicationItem | null;
  services: ServiceItem[];
  roles: Role[];
  users: TicketUserRef[];
  onSaved: () => void;
}

export function CommunicationDialog({
  open,
  onOpenChange,
  communication,
  services,
  roles,
  users,
  onSaved,
}: CommunicationDialogProps) {
  const editing = Boolean(communication);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("information");
  const [audience, setAudience] = useState("all");
  const [serviceId, setServiceId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [userIds, setUserIds] = useState<string[]>([]);
  const [channel, setChannel] = useState("in_app");
  const [status, setStatus] = useState("draft");
  const [isPinned, setIsPinned] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(communication?.title ?? "");
    setBody(communication?.body ?? "");
    setCategory(communication?.category ?? "information");
    setAudience(communication?.audience ?? "all");
    setServiceId(communication?.audience_service_id ?? "");
    setRoleId(communication?.audience_role_id ?? "");
    setUserIds(communication?.audience_user_ids ?? []);
    setChannel(communication?.channel ?? "in_app");
    setStatus(communication?.status ?? "draft");
    setIsPinned(communication?.is_pinned ?? false);
    setScheduledAt(toLocalInput(communication?.scheduled_at ?? null));
    setExpiresAt(toLocalInput(communication?.expires_at ?? null));
    setError(null);
  }, [open, communication]);

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Le titre et le contenu sont obligatoires.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      title: title.trim(),
      body: body.trim(),
      category,
      audience,
      audience_service_id: audience === "service" ? serviceId || null : null,
      audience_role_id: audience === "role" ? roleId || null : null,
      audience_user_ids: audience === "users" ? userIds : [],
      channel,
      status,
      is_pinned: isPinned,
      scheduled_at: toIso(scheduledAt),
      expires_at: toIso(expiresAt),
    };
    try {
      if (communication) {
        await apiFetch(`/communication/communications/${communication.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Communication mise à jour.");
      } else {
        await apiFetch("/communication/communications", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Communication créée.");
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier la communication" : "Nouvelle communication"}</DialogTitle>
          <DialogDescription>
            Message diffusé aux utilisateurs. La publication crée une notification et peut aussi
            envoyer un e-mail selon le canal choisi.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Label htmlFor="communication-title">Titre</Label>
            <Input
              id="communication-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="communication-body">Contenu</Label>
            <Textarea
              id="communication-body"
              rows={6}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="communication-category">Catégorie</Label>
              <Select
                id="communication-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="information">Information</option>
                <option value="maintenance">Maintenance</option>
                <option value="security">Sécurité</option>
                <option value="change">Changement</option>
                <option value="event">Événement</option>
                <option value="other">Autre</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="communication-channel">Canal</Label>
              <Select
                id="communication-channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value)}
              >
                <option value="in_app">Notification interne</option>
                <option value="email">E-mail</option>
                <option value="both">Notification + e-mail</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="communication-status">Statut</Label>
              <Select
                id="communication-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Brouillon</option>
                <option value="scheduled">Planifiée</option>
                <option value="published">Publiée</option>
                <option value="archived">Archivée</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="communication-audience">Destinataires</Label>
              <Select
                id="communication-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
              >
                <option value="all">Tous les utilisateurs</option>
                <option value="service">Un service</option>
                {roles.length > 0 ? <option value="role">Un rôle</option> : null}
                <option value="users">Utilisateurs sélectionnés</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="communication-scheduled">Publication planifiée</Label>
              <Input
                id="communication-scheduled"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </div>
          </div>
          {audience === "service" ? (
            <div>
              <Label htmlFor="communication-service">Service</Label>
              <Select
                id="communication-service"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">Sélectionner un service</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.code} — {service.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {audience === "role" ? (
            <div>
              <Label htmlFor="communication-role">Rôle</Label>
              <Select
                id="communication-role"
                value={roleId}
                onChange={(event) => setRoleId(event.target.value)}
              >
                <option value="">Sélectionner un rôle</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          {audience === "users" ? (
            <div>
              <Label>Utilisateurs</Label>
              <Picker
                items={users.map((user) => ({
                  id: user.id,
                  label: `${user.first_name} ${user.last_name}`,
                }))}
                selected={userIds}
                onChange={setUserIds}
              />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="communication-expires">Fin de diffusion</Label>
              <Input
                id="communication-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pt-5 text-[11px] text-muted">
              <Switch checked={isPinned} onCheckedChange={setIsPinned} />
              Épingler en tête de liste
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            {editing ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingItem | null;
  users: TicketUserRef[];
  onSaved: () => void;
}

export function MeetingDialog({ open, onOpenChange, meeting, users, onSaved }: MeetingDialogProps) {
  const editing = Boolean(meeting);
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState("team");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [visioUrl, setVisioUrl] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [agenda, setAgenda] = useState("");
  const [notes, setNotes] = useState("");
  const [decisions, setDecisions] = useState("");
  const [status, setStatus] = useState("planned");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(meeting?.title ?? "");
    setMeetingType(meeting?.meeting_type ?? "team");
    setScheduledAt(toLocalInput(meeting?.scheduled_at ?? null));
    setDuration(String(meeting?.duration_minutes ?? 60));
    setLocation(meeting?.location ?? "");
    setVisioUrl(meeting?.visio_url ?? "");
    setParticipantIds(meeting?.participant_user_ids ?? []);
    setAgenda(meeting?.agenda ?? "");
    setNotes(meeting?.notes ?? "");
    setDecisions(meeting?.decisions ?? "");
    setStatus(meeting?.status ?? "planned");
    setError(null);
  }, [open, meeting]);

  const submit = async () => {
    if (!title.trim() || !scheduledAt) {
      setError("Le titre et la date sont obligatoires.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      title: title.trim(),
      meeting_type: meetingType,
      scheduled_at: toIso(scheduledAt),
      duration_minutes: Number(duration) || 60,
      location: nullable(location),
      visio_url: nullable(visioUrl),
      participant_user_ids: participantIds,
      agenda: nullable(agenda),
      notes: nullable(notes),
      decisions: nullable(decisions),
      status,
    };
    try {
      if (meeting) {
        await apiFetch(`/communication/meetings/${meeting.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Réunion mise à jour.");
      } else {
        await apiFetch("/communication/meetings", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Réunion créée.");
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier la réunion" : "Nouvelle réunion"}</DialogTitle>
          <DialogDescription>
            Réunion d'équipe, de service, projet ou point individuel avec la responsable.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="meeting-title">Titre</Label>
              <Input
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="meeting-type">Type</Label>
              <Select
                id="meeting-type"
                value={meetingType}
                onChange={(event) => setMeetingType(event.target.value)}
              >
                <option value="team">Réunion d'équipe</option>
                <option value="service">Réunion de service</option>
                <option value="project">Réunion projet</option>
                <option value="manager_1on1">Point avec la responsable</option>
                <option value="crisis">Cellule de crise</option>
                <option value="other">Autre</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="meeting-status">Statut</Label>
              <Select
                id="meeting-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="planned">Planifiée</option>
                <option value="done">Réalisée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="meeting-date">Date et heure</Label>
              <Input
                id="meeting-date"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="meeting-duration">Durée (minutes)</Label>
              <Input
                id="meeting-duration"
                type="number"
                min={5}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="meeting-location">Lieu</Label>
              <Input
                id="meeting-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="meeting-visio">Lien visio</Label>
              <Input
                id="meeting-visio"
                value={visioUrl}
                onChange={(event) => setVisioUrl(event.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <div>
            <Label>Participants</Label>
            <Picker
              items={users.map((user) => ({
                id: user.id,
                label: `${user.first_name} ${user.last_name}`,
              }))}
              selected={participantIds}
              onChange={setParticipantIds}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="meeting-agenda">Ordre du jour</Label>
              <Textarea
                id="meeting-agenda"
                rows={4}
                value={agenda}
                onChange={(event) => setAgenda(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="meeting-notes">Compte rendu</Label>
              <Textarea
                id="meeting-notes"
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="meeting-decisions">Décisions et actions</Label>
            <Textarea
              id="meeting-decisions"
              rows={3}
              value={decisions}
              onChange={(event) => setDecisions(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            {editing ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MeetingPointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  point: MeetingPointItem | null;
  meetings: MeetingItem[];
  users: TicketUserRef[];
  onSaved: () => void;
}

export function MeetingPointDialog({
  open,
  onOpenChange,
  point,
  meetings,
  users,
  onSaved,
}: MeetingPointDialogProps) {
  const editing = Boolean(point);
  const [meetingId, setMeetingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [nextReview, setNextReview] = useState("");
  const [lastDiscussed, setLastDiscussed] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMeetingId(point?.meeting_id ?? "");
    setTitle(point?.title ?? "");
    setDescription(point?.description ?? "");
    setStatus(point?.status ?? "open");
    setPriority(point?.priority ?? "medium");
    setDueDate(point?.due_date ?? "");
    setNextReview(point?.next_review_at ?? "");
    setLastDiscussed(point?.last_discussed_at ?? "");
    setOwnerId(point?.owner_user_id ?? "");
    setNotes(point?.notes ?? "");
    setError(null);
  }, [open, point]);

  const submit = async () => {
    if (!title.trim()) {
      setError("Le titre du point est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      meeting_id: meetingId || null,
      title: title.trim(),
      description: nullable(description),
      status,
      priority,
      due_date: dueDate || null,
      next_review_at: nextReview || null,
      last_discussed_at: lastDiscussed || null,
      owner_user_id: ownerId || null,
      notes: nullable(notes),
    };
    try {
      if (point) {
        await apiFetch(`/communication/points/${point.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Point de suivi mis à jour.");
      } else {
        await apiFetch("/communication/points", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Point de suivi créé.");
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le point" : "Nouveau point de suivi"}</DialogTitle>
          <DialogDescription>
            Points en cours à aborder avec la responsable : sujets, échéances et décisions.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="point-title">Intitulé</Label>
              <Input
                id="point-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="point-meeting">Réunion associée</Label>
              <Select
                id="point-meeting"
                value={meetingId}
                onChange={(event) => setMeetingId(event.target.value)}
              >
                <option value="">Aucune</option>
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="point-owner">Responsable</Label>
              <Select
                id="point-owner"
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
              >
                <option value="">Moi</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="point-status">Statut</Label>
              <Select
                id="point-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="open">Ouvert</option>
                <option value="in_progress">En cours</option>
                <option value="blocked">Bloqué</option>
                <option value="done">Traité</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="point-priority">Priorité</Label>
              <Select
                id="point-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="low">Basse</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="point-due">Échéance</Label>
              <Input
                id="point-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="point-review">Prochaine revue</Label>
              <Input
                id="point-review"
                type="date"
                value={nextReview}
                onChange={(event) => setNextReview(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="point-discussed">Dernier échange</Label>
              <Input
                id="point-discussed"
                type="date"
                value={lastDiscussed}
                onChange={(event) => setLastDiscussed(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="point-description">Description</Label>
            <Textarea
              id="point-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="point-notes">Notes</Label>
            <Textarea
              id="point-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            {editing ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TrainingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  training: TrainingItem | null;
  agents: AgentItem[];
  onSaved: () => void;
}

export function TrainingDialog({
  open,
  onOpenChange,
  training,
  agents,
  onSaved,
}: TrainingDialogProps) {
  const editing = Boolean(training);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [duration, setDuration] = useState("");
  const [location, setLocation] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [cost, setCost] = useState("");
  const [status, setStatus] = useState("planned");
  const [capacity, setCapacity] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(training?.title ?? "");
    setProvider(training?.provider ?? "");
    setCategory(training?.category ?? "");
    setDescription(training?.description ?? "");
    setStartDate(training?.start_date ?? "");
    setEndDate(training?.end_date ?? "");
    setDuration(training?.duration_hours != null ? String(training.duration_hours) : "");
    setLocation(training?.location ?? "");
    setMandatory(training?.mandatory ?? false);
    setCost(training?.cost != null ? String(training.cost) : "");
    setStatus(training?.status ?? "planned");
    setCapacity(training?.capacity != null ? String(training.capacity) : "");
    setParticipantIds(training?.participant_agent_ids ?? []);
    setNotes(training?.notes ?? "");
    setError(null);
  }, [open, training]);

  const submit = async () => {
    if (!title.trim()) {
      setError("Le titre de la formation est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      title: title.trim(),
      provider: nullable(provider),
      description: nullable(description),
      category: nullable(category),
      start_date: startDate || null,
      end_date: endDate || null,
      duration_hours: duration ? Number(duration) : null,
      location: nullable(location),
      mandatory,
      cost: cost ? Number(cost) : null,
      status,
      capacity: capacity ? Number(capacity) : null,
      participant_agent_ids: participantIds,
      notes: nullable(notes),
    };
    try {
      if (training) {
        await apiFetch(`/communication/trainings/${training.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Formation mise à jour.");
      } else {
        await apiFetch("/communication/trainings", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Formation créée.");
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier la formation" : "Nouvelle formation"}</DialogTitle>
          <DialogDescription>
            Formations internes ou externes : programme, dates, participants et coûts.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="training-title">Titre</Label>
              <Input
                id="training-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="training-provider">Organisme</Label>
              <Input
                id="training-provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="training-category">Catégorie</Label>
              <Input
                id="training-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Sécurité, bureautique, technique…"
              />
            </div>
            <div>
              <Label htmlFor="training-start">Début</Label>
              <Input
                id="training-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="training-end">Fin</Label>
              <Input
                id="training-end"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="training-duration">Durée (heures)</Label>
              <Input
                id="training-duration"
                type="number"
                min={0}
                step="0.5"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="training-status">Statut</Label>
              <Select
                id="training-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="planned">Planifiée</option>
                <option value="in_progress">En cours</option>
                <option value="completed">Terminée</option>
                <option value="cancelled">Annulée</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="training-location">Lieu</Label>
              <Input
                id="training-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="training-cost">Coût (€)</Label>
              <Input
                id="training-cost"
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="training-capacity">Places</Label>
              <Input
                id="training-capacity"
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pt-5 text-[11px] text-muted">
              <Switch checked={mandatory} onCheckedChange={setMandatory} />
              Formation obligatoire
            </label>
          </div>
          <div>
            <Label>Participants</Label>
            <Picker
              items={agents.map((agent) => ({
                id: agent.id,
                label: `${agent.first_name} ${agent.last_name}`,
              }))}
              selected={participantIds}
              onChange={setParticipantIds}
            />
          </div>
          <div>
            <Label htmlFor="training-description">Description</Label>
            <Textarea
              id="training-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="training-notes">Notes</Label>
            <Textarea
              id="training-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            {editing ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
