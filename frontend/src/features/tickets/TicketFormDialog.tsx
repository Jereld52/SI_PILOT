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
  AgentItem,
  AssetItem,
  ServiceItem,
  TicketMeta,
  TicketUserRef,
} from "@/types/api";

interface TicketFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: TicketMeta | null;
  agents: AgentItem[];
  services: ServiceItem[];
  assets: AssetItem[];
  assignees: TicketUserRef[];
  onSaved: () => void;
}

export function TicketFormDialog({
  open,
  onOpenChange,
  meta,
  agents,
  services,
  assets,
  assignees,
  onSaved,
}: TicketFormDialogProps) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [requesterAgentId, setRequesterAgentId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [source, setSource] = useState("manual");
  const [assetId, setAssetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubject("");
    setDescription("");
    setCategoryId(meta?.categories[0]?.id ?? "");
    setPriorityId(meta?.priorities.find((item) => item.code === "medium")?.id ?? meta?.priorities[0]?.id ?? "");
    setRequesterAgentId("");
    setServiceId("");
    setAssigneeId("");
    setSource("manual");
    setAssetId("");
    setError(null);
  }, [open, meta]);

  const submit = async () => {
    if (!subject.trim()) {
      setError("L'objet de la demande est obligatoire.");
      return;
    }
    if (!categoryId || !priorityId) {
      setError("La catégorie et la priorité sont obligatoires.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      subject: subject.trim(),
      description: description.trim() || null,
      category_id: categoryId,
      priority_id: priorityId,
      requester_agent_id: requesterAgentId || null,
      service_id: serviceId || null,
      assignee_user_id: assigneeId || null,
      source,
      asset_ids: assetId ? [assetId] : [],
    };
    try {
      await apiFetch("/tickets", { method: "POST", body: JSON.stringify(payload) });
      toast.success("Demande IT créée.");
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Création impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nouvelle demande IT</DialogTitle>
          <DialogDescription>
            La référence et l'échéance sont calculées automatiquement à partir de la priorité.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div>
            <Label htmlFor="ticket-subject">Objet</Label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Décrivez brièvement le besoin"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ticket-category">Catégorie</Label>
              <Select
                id="ticket-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {(meta?.categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ticket-priority">Priorité</Label>
              <Select
                id="ticket-priority"
                value={priorityId}
                onChange={(event) => setPriorityId(event.target.value)}
              >
                {(meta?.priorities ?? []).map((priority) => (
                  <option key={priority.id} value={priority.id}>
                    {priority.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ticket-requester">Agent demandeur</Label>
              <Select
                id="ticket-requester"
                value={requesterAgentId}
                onChange={(event) => {
                  setRequesterAgentId(event.target.value);
                  const agent = agents.find((item) => item.id === event.target.value);
                  if (agent?.service_id) setServiceId(agent.service_id);
                }}
              >
                <option value="">Non précisé</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.first_name} {agent.last_name} — {agent.email_pro}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ticket-service">Service</Label>
              <Select
                id="ticket-service"
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">Non précisé</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.code} — {service.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <details className="rounded-lg border border-border-soft bg-background-soft/40 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted">
              Options avancées — assignation, origine, équipement
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="ticket-assignee">Assigné à</Label>
                <Select
                  id="ticket-assignee"
                  value={assigneeId}
                  onChange={(event) => setAssigneeId(event.target.value)}
                >
                  <option value="">Non assigné</option>
                  {assignees.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="ticket-source">Origine</Label>
                <Select
                  id="ticket-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="manual">Saisie manuelle</option>
                  <option value="phone">Téléphone</option>
                  <option value="email">E-mail</option>
                  <option value="portal">Portail</option>
                  <option value="import">Import</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ticket-asset">Équipement concerné</Label>
                <Select
                  id="ticket-asset"
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                >
                  <option value="">Aucun</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.asset_tag} — {asset.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </details>
          <div>
            <Label htmlFor="ticket-description">Description</Label>
            <Textarea
              id="ticket-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            Créer la demande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
