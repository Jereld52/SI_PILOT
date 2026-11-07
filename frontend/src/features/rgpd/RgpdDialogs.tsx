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
  DataBreachItem,
  DataCollectionItem,
  DpoRequestItem,
  ProcessingActivityItem,
  RightsRequestItem,
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

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

interface DialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
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

// --- Traitement --------------------------------------------------------------

interface ProcessingDialogProps extends DialogBaseProps {
  activity: ProcessingActivityItem | null;
}

export function ProcessingActivityDialog({
  open,
  onOpenChange,
  activity,
  onSaved,
}: ProcessingDialogProps) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("draft");
  const [legalBasis, setLegalBasis] = useState("");
  const [purpose, setPurpose] = useState("");
  const [dataCategories, setDataCategories] = useState("");
  const [dataSubjects, setDataSubjects] = useState("");
  const [recipients, setRecipients] = useState("");
  const [retention, setRetention] = useState("");
  const [security, setSecurity] = useState("");
  const [suppliers, setSuppliers] = useState("");
  const [lastReview, setLastReview] = useState("");
  const [nextReview, setNextReview] = useState("");
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setName(activity?.name ?? "");
    setStatus(activity?.status ?? "draft");
    setLegalBasis(activity?.legal_basis ?? "");
    setPurpose(activity?.purpose ?? "");
    setDataCategories(activity?.data_categories ?? "");
    setDataSubjects(activity?.data_subjects ?? "");
    setRecipients(activity?.recipients ?? "");
    setRetention(activity?.retention_period ?? "");
    setSecurity(activity?.security_measures ?? "");
    setSuppliers(activity?.suppliers ?? "");
    setLastReview(activity?.last_review_at ?? "");
    setNextReview(activity?.next_review_at ?? "");
    setNotes(activity?.dpo_notes ?? "");
    setError(null);
  }, [open, activity, setError]);

  const doSubmit = () => {
    if (!name.trim()) {
      setError("Le nom du traitement est obligatoire.");
      return;
    }
    const payload = {
      name: name.trim(),
      status,
      legal_basis: nullable(legalBasis),
      purpose: nullable(purpose),
      data_categories: nullable(dataCategories),
      data_subjects: nullable(dataSubjects),
      recipients: nullable(recipients),
      retention_period: nullable(retention),
      security_measures: nullable(security),
      suppliers: nullable(suppliers),
      last_review_at: lastReview || null,
      next_review_at: nextReview || null,
      dpo_notes: nullable(notes),
    };
    void submit(
      () =>
        activity
          ? apiFetch(`/rgpd/processing-activities/${activity.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/rgpd/processing-activities", {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      activity ? "Traitement mis à jour." : "Traitement créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{activity ? "Modifier le traitement" : "Nouveau traitement"}</DialogTitle>
          <DialogDescription>
            Registre des activités de traitement au sens de l'article 30 du RGPD.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="processing-name">Nom du traitement</Label>
              <Input
                id="processing-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="processing-status">Statut</Label>
              <Select
                id="processing-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Brouillon</option>
                <option value="active">Actif</option>
                <option value="archived">Archivé</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="processing-purpose">Finalité</Label>
              <Textarea
                id="processing-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="processing-basis">Base légale</Label>
              <Input
                id="processing-basis"
                value={legalBasis}
                onChange={(event) => setLegalBasis(event.target.value)}
                placeholder="Mission d'intérêt public, obligation légale…"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="processing-categories">Catégories de données</Label>
              <Textarea
                id="processing-categories"
                value={dataCategories}
                onChange={(event) => setDataCategories(event.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="processing-subjects">Personnes concernées</Label>
              <Textarea
                id="processing-subjects"
                value={dataSubjects}
                onChange={(event) => setDataSubjects(event.target.value)}
                rows={2}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="processing-recipients">Destinataires</Label>
              <Textarea
                id="processing-recipients"
                value={recipients}
                onChange={(event) => setRecipients(event.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="processing-suppliers">Sous-traitants</Label>
              <Textarea
                id="processing-suppliers"
                value={suppliers}
                onChange={(event) => setSuppliers(event.target.value)}
                rows={2}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="processing-retention">Durée de conservation</Label>
              <Input
                id="processing-retention"
                value={retention}
                onChange={(event) => setRetention(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="processing-last-review">Dernière revue</Label>
              <Input
                id="processing-last-review"
                type="date"
                value={lastReview}
                onChange={(event) => setLastReview(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="processing-next-review">Prochaine revue</Label>
              <Input
                id="processing-next-review"
                type="date"
                value={nextReview}
                onChange={(event) => setNextReview(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="processing-security">Mesures de sécurité</Label>
            <Textarea
              id="processing-security"
              value={security}
              onChange={(event) => setSecurity(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="processing-notes">Notes DPO</Label>
            <Textarea
              id="processing-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
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

// --- Collecte ----------------------------------------------------------------

interface CollectionDialogProps extends DialogBaseProps {
  collection: DataCollectionItem | null;
  activities: ProcessingActivityItem[];
}

export function DataCollectionDialog({
  open,
  onOpenChange,
  collection,
  activities,
  onSaved,
}: CollectionDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState("form");
  const [status, setStatus] = useState("active");
  const [activityId, setActivityId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [categories, setCategories] = useState("");
  const [subjectsCount, setSubjectsCount] = useState("");
  const [collectedAt, setCollectedAt] = useState("");
  const [retentionEnd, setRetentionEnd] = useState("");
  const [notes, setNotes] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setName(collection?.name ?? "");
    setType(collection?.collection_type ?? "form");
    setStatus(collection?.status ?? "active");
    setActivityId(collection?.processing_activity_id ?? "");
    setPurpose(collection?.purpose ?? "");
    setCategories(collection?.data_categories ?? "");
    setSubjectsCount(collection?.subjects_count != null ? String(collection.subjects_count) : "");
    setCollectedAt(collection?.collected_at ?? "");
    setRetentionEnd(collection?.retention_end ?? "");
    setNotes(collection?.notes ?? "");
    setError(null);
  }, [open, collection, setError]);

  const doSubmit = () => {
    if (!name.trim()) {
      setError("Le nom de la collecte est obligatoire.");
      return;
    }
    const payload = {
      name: name.trim(),
      collection_type: type,
      status,
      processing_activity_id: activityId || null,
      purpose: nullable(purpose),
      data_categories: nullable(categories),
      subjects_count: subjectsCount ? Number(subjectsCount) : null,
      collected_at: collectedAt || null,
      retention_end: retentionEnd || null,
      notes: nullable(notes),
    };
    void submit(
      () =>
        collection
          ? apiFetch(`/rgpd/collections/${collection.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/rgpd/collections", { method: "POST", body: JSON.stringify(payload) }),
      collection ? "Collecte mise à jour." : "Collecte créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{collection ? "Modifier la collecte" : "Nouvelle collecte"}</DialogTitle>
          <DialogDescription>
            Formulaire, enquête, liste de contacts ou inscription : justification et durée de
            conservation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="collection-name">Nom</Label>
              <Input id="collection-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="collection-type">Type</Label>
              <Select id="collection-type" value={type} onChange={(event) => setType(event.target.value)}>
                <option value="form">Formulaire</option>
                <option value="survey">Enquête</option>
                <option value="contact_list">Liste de contacts</option>
                <option value="registration">Inscription</option>
                <option value="event">Événement</option>
                <option value="ad_hoc">Ad hoc</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="collection-activity">Traitement lié</Label>
              <Select
                id="collection-activity"
                value={activityId}
                onChange={(event) => setActivityId(event.target.value)}
              >
                <option value="">Non rattaché</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.reference} — {activity.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="collection-status">Statut</Label>
              <Select
                id="collection-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="active">Active</option>
                <option value="archived">Archivée</option>
                <option value="deleted">Supprimée</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="collection-purpose">Finalité</Label>
            <Textarea
              id="collection-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="collection-categories">Données collectées</Label>
              <Input
                id="collection-categories"
                value={categories}
                onChange={(event) => setCategories(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="collection-count">Personnes</Label>
              <Input
                id="collection-count"
                inputMode="numeric"
                value={subjectsCount}
                onChange={(event) => setSubjectsCount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="collection-date">Collecte</Label>
              <Input
                id="collection-date"
                type="date"
                value={collectedAt}
                onChange={(event) => setCollectedAt(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="collection-retention">Fin de conservation</Label>
              <Input
                id="collection-retention"
                type="date"
                value={retentionEnd}
                onChange={(event) => setRetentionEnd(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="collection-notes">Notes</Label>
              <Input id="collection-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
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

// --- Demande DPO -------------------------------------------------------------

interface DpoDialogProps extends DialogBaseProps {
  requestItem: DpoRequestItem | null;
}

export function DpoRequestDialog({ open, onOpenChange, requestItem, onSaved }: DpoDialogProps) {
  const [subject, setSubject] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterType, setRequesterType] = useState("agent");
  const [status, setStatus] = useState("new");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [response, setResponse] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setSubject(requestItem?.subject ?? "");
    setRequesterName(requestItem?.requester_name ?? "");
    setRequesterType(requestItem?.requester_type ?? "agent");
    setStatus(requestItem?.status ?? "new");
    setDueDate(requestItem?.due_date ?? "");
    setDescription(requestItem?.description ?? "");
    setResponse(requestItem?.response ?? "");
    setRecommendations(requestItem?.recommendations ?? "");
    setError(null);
  }, [open, requestItem, setError]);

  const doSubmit = () => {
    if (!subject.trim()) {
      setError("L'objet de la demande est obligatoire.");
      return;
    }
    const payload = {
      subject: subject.trim(),
      requester_name: nullable(requesterName),
      requester_type: requesterType || null,
      status,
      due_date: dueDate || null,
      description: nullable(description),
      response: nullable(response),
      recommendations: nullable(recommendations),
    };
    void submit(
      () =>
        requestItem
          ? apiFetch(`/rgpd/requests/${requestItem.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/rgpd/requests", { method: "POST", body: JSON.stringify(payload) }),
      requestItem ? "Demande mise à jour." : "Demande DPO créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{requestItem ? "Traiter la demande DPO" : "Nouvelle demande DPO"}</DialogTitle>
          <DialogDescription>
            Sollicitation d'un agent, d'un usager ou d'un tiers, réponse et recommandations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="dpo-subject">Objet</Label>
            <Input id="dpo-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="dpo-requester">Demandeur</Label>
              <Input
                id="dpo-requester"
                value={requesterName}
                onChange={(event) => setRequesterName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dpo-type">Type</Label>
              <Select
                id="dpo-type"
                value={requesterType}
                onChange={(event) => setRequesterType(event.target.value)}
              >
                <option value="agent">Agent</option>
                <option value="usager">Usager</option>
                <option value="partenaire">Partenaire</option>
                <option value="prestataire">Prestataire</option>
                <option value="autre">Autre</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="dpo-status">Statut</Label>
              <Select id="dpo-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="new">Nouvelle</option>
                <option value="in_progress">En cours</option>
                <option value="answered">Répondue</option>
                <option value="closed">Clôturée</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dpo-due">Échéance</Label>
              <Input
                id="dpo-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="dpo-description">Description</Label>
            <Textarea
              id="dpo-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="dpo-response">Réponse</Label>
            <Textarea
              id="dpo-response"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="dpo-recommendations">Recommandations</Label>
            <Textarea
              id="dpo-recommendations"
              value={recommendations}
              onChange={(event) => setRecommendations(event.target.value)}
              rows={2}
            />
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

// --- Droits des personnes ----------------------------------------------------

interface RightsDialogProps extends DialogBaseProps {
  rights: RightsRequestItem | null;
  activities: ProcessingActivityItem[];
}

export function RightsRequestDialog({
  open,
  onOpenChange,
  rights,
  activities,
  onSaved,
}: RightsDialogProps) {
  const [requestType, setRequestType] = useState("access");
  const [requesterName, setRequesterName] = useState("");
  const [status, setStatus] = useState("new");
  const [activityId, setActivityId] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [response, setResponse] = useState("");
  const [resolution, setResolution] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setRequestType(rights?.request_type ?? "access");
    setRequesterName(rights?.requester_name ?? "");
    setStatus(rights?.status ?? "new");
    setActivityId(rights?.processing_activity_id ?? "");
    setReceivedAt(rights?.received_at ?? "");
    setDueDate(rights?.due_date ?? "");
    setResponse(rights?.response ?? "");
    setResolution(rights?.resolution ?? "");
    setError(null);
  }, [open, rights, setError]);

  const doSubmit = () => {
    const payload = {
      request_type: requestType,
      requester_name: nullable(requesterName),
      status,
      processing_activity_id: activityId || null,
      received_at: receivedAt || null,
      due_date: dueDate || null,
      response: nullable(response),
      resolution: nullable(resolution),
    };
    void submit(
      () =>
        rights
          ? apiFetch(`/rgpd/rights-requests/${rights.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/rgpd/rights-requests", { method: "POST", body: JSON.stringify(payload) }),
      rights ? "Demande de droits mise à jour." : "Demande de droits créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {rights ? "Traiter la demande de droits" : "Nouvelle demande de droits"}
          </DialogTitle>
          <DialogDescription>
            Accès, rectification, effacement, opposition, portabilité ou limitation. Échéance
            recommandée : un mois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="rights-type">Droit exercé</Label>
              <Select
                id="rights-type"
                value={requestType}
                onChange={(event) => setRequestType(event.target.value)}
              >
                <option value="access">Accès</option>
                <option value="rectification">Rectification</option>
                <option value="erasure">Effacement</option>
                <option value="objection">Opposition</option>
                <option value="portability">Portabilité</option>
                <option value="limitation">Limitation</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rights-status">Statut</Label>
              <Select id="rights-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="new">Nouvelle</option>
                <option value="in_progress">En cours</option>
                <option value="answered">Répondue</option>
                <option value="closed">Clôturée</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rights-requester">Demandeur</Label>
              <Input
                id="rights-requester"
                value={requesterName}
                onChange={(event) => setRequesterName(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="rights-activity">Traitement</Label>
              <Select
                id="rights-activity"
                value={activityId}
                onChange={(event) => setActivityId(event.target.value)}
              >
                <option value="">Non rattaché</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.reference} — {activity.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rights-received">Reçue le</Label>
              <Input
                id="rights-received"
                type="date"
                value={receivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="rights-due">Échéance</Label>
              <Input
                id="rights-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="rights-response">Réponse</Label>
            <Textarea
              id="rights-response"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="rights-resolution">Résolution</Label>
            <Textarea
              id="rights-resolution"
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              rows={2}
            />
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

// --- Violation ---------------------------------------------------------------

interface BreachDialogProps extends DialogBaseProps {
  breach: DataBreachItem | null;
}

export function DataBreachDialog({ open, onOpenChange, breach, onSaved }: BreachDialogProps) {
  const [severity, setSeverity] = useState("medium");
  const [status, setStatus] = useState("open");
  const [occurredAt, setOccurredAt] = useState("");
  const [discoveredAt, setDiscoveredAt] = useState("");
  const [affectedCount, setAffectedCount] = useState("");
  const [description, setDescription] = useState("");
  const [containment, setContainment] = useState("");
  const [cnilNotifiedAt, setCnilNotifiedAt] = useState("");
  const [subjectsNotifiedAt, setSubjectsNotifiedAt] = useState("");
  const [lessons, setLessons] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setSeverity(breach?.severity ?? "medium");
    setStatus(breach?.status ?? "open");
    setOccurredAt(toLocalInput(breach?.occurred_at ?? null));
    setDiscoveredAt(toLocalInput(breach?.discovered_at ?? null));
    setAffectedCount(breach?.affected_count != null ? String(breach.affected_count) : "");
    setDescription(breach?.description ?? "");
    setContainment(breach?.containment ?? "");
    setCnilNotifiedAt(toLocalInput(breach?.cnil_notified_at ?? null));
    setSubjectsNotifiedAt(toLocalInput(breach?.subjects_notified_at ?? null));
    setLessons(breach?.lessons_learned ?? "");
    setError(null);
  }, [open, breach, setError]);

  const doSubmit = () => {
    const payload = {
      severity,
      status,
      occurred_at: toIso(occurredAt),
      discovered_at: toIso(discoveredAt),
      affected_count: affectedCount ? Number(affectedCount) : null,
      description: nullable(description),
      containment: nullable(containment),
      cnil_notified_at: toIso(cnilNotifiedAt),
      subjects_notified_at: toIso(subjectsNotifiedAt),
      lessons_learned: nullable(lessons),
    };
    void submit(
      () =>
        breach
          ? apiFetch(`/rgpd/breaches/${breach.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/rgpd/breaches", { method: "POST", body: JSON.stringify(payload) }),
      breach ? "Violation mise à jour." : "Violation enregistrée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {breach ? "Mettre à jour la violation" : "Déclarer une violation de données"}
          </DialogTitle>
          <DialogDescription>
            Qualification, mesures de containment et notifications CNIL / personnes concernées.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="breach-severity">Gravité</Label>
              <Select
                id="breach-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="low">Faible</option>
                <option value="medium">Moyenne</option>
                <option value="high">Élevée</option>
                <option value="critical">Critique</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="breach-status">Statut</Label>
              <Select id="breach-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="open">Ouverte</option>
                <option value="contained">Contenue</option>
                <option value="closed">Clôturée</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="breach-count">Personnes</Label>
              <Input
                id="breach-count"
                inputMode="numeric"
                value={affectedCount}
                onChange={(event) => setAffectedCount(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="breach-occurred">Survenue le</Label>
              <Input
                id="breach-occurred"
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="breach-discovered">Découverte le</Label>
              <Input
                id="breach-discovered"
                type="datetime-local"
                value={discoveredAt}
                onChange={(event) => setDiscoveredAt(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="breach-description">Description</Label>
            <Textarea
              id="breach-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="breach-containment">Mesures de containment</Label>
            <Textarea
              id="breach-containment"
              value={containment}
              onChange={(event) => setContainment(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="breach-cnil">Notification CNIL</Label>
              <Input
                id="breach-cnil"
                type="datetime-local"
                value={cnilNotifiedAt}
                onChange={(event) => setCnilNotifiedAt(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="breach-subjects">Information des personnes</Label>
              <Input
                id="breach-subjects"
                type="datetime-local"
                value={subjectsNotifiedAt}
                onChange={(event) => setSubjectsNotifiedAt(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="breach-lessons">Retour d'expérience</Label>
            <Textarea
              id="breach-lessons"
              value={lessons}
              onChange={(event) => setLessons(event.target.value)}
              rows={2}
            />
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
