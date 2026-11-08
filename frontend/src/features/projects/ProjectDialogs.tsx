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
  MilestoneItem,
  ProjectDecisionItem,
  ProjectItem,
  ProjectRiskItem,
  ProjectTaskItem,
  TicketUserRef,
} from "@/types/api";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function money(value: string): number | null {
  return value ? Number(value.replace(",", ".")) : null;
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

// --- Projet ------------------------------------------------------------------

interface ProjectDialogProps extends BaseDialogProps {
  project: ProjectItem | null;
  users: TicketUserRef[];
}

export function ProjectDialog({ open, onOpenChange, project, users, onSaved }: ProjectDialogProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objectives, setObjectives] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [budget, setBudget] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("planned");
  const [progress, setProgress] = useState("0");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setCode(project?.code ?? "");
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setObjectives(project?.objectives ?? "");
    setOwnerId(project?.owner_user_id ?? "");
    setStartDate(project?.start_date ?? "");
    setDueDate(project?.due_date ?? "");
    setBudget(project?.planned_budget != null ? String(project.planned_budget) : "");
    setPriority(project?.priority ?? "medium");
    setStatus(project?.status ?? "planned");
    setProgress(project ? String(project.progress_percent) : "0");
    setError(null);
  }, [open, project, setError]);

  const doSubmit = () => {
    if (!code.trim() || !name.trim()) {
      setError("Le code et le nom sont obligatoires.");
      return;
    }
    const payload = {
      code: code.trim(),
      name: name.trim(),
      description: nullable(description),
      objectives: nullable(objectives),
      owner_user_id: ownerId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      planned_budget: money(budget),
      priority,
      status,
      progress_percent: Math.max(0, Math.min(100, Number(progress) || 0)),
    };
    void submit(
      () =>
        project
          ? apiFetch(`/projects/${project.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch("/projects", { method: "POST", body: JSON.stringify(payload) }),
      project ? "Projet mis à jour." : "Projet créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{project ? "Modifier le projet" : "Nouveau projet"}</DialogTitle>
          <DialogDescription>
            Cadrage, budget, échéance et avancement du projet informatique.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="project-code">Code</Label>
              <Input id="project-code" value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="project-name">Nom</Label>
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="project-objectives">Objectifs</Label>
            <Textarea
              id="project-objectives"
              value={objectives}
              onChange={(event) => setObjectives(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="project-owner">Responsable</Label>
              <Select
                id="project-owner"
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
              <Label htmlFor="project-priority">Priorité</Label>
              <Select
                id="project-priority"
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
              <Label htmlFor="project-status">Statut</Label>
              <Select
                id="project-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="idea">Idée</option>
                <option value="planned">Planifié</option>
                <option value="in_progress">En cours</option>
                <option value="on_hold">En pause</option>
                <option value="done">Terminé</option>
                <option value="cancelled">Annulé</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="project-start">Début</Label>
              <Input
                id="project-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="project-due">Échéance</Label>
              <Input
                id="project-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="project-budget">Budget prévu</Label>
              <Input
                id="project-budget"
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="project-progress">Avancement (%)</Label>
              <Input
                id="project-progress"
                inputMode="numeric"
                value={progress}
                onChange={(event) => setProgress(event.target.value)}
                disabled={Boolean(project && project.task_count > 0)}
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

// --- Jalon -------------------------------------------------------------------

interface MilestoneDialogProps extends BaseDialogProps {
  projectId: string;
  milestone: MilestoneItem | null;
}

export function MilestoneDialog({
  open,
  onOpenChange,
  projectId,
  milestone,
  onSaved,
}: MilestoneDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("todo");
  const [weight, setWeight] = useState("1");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setName(milestone?.name ?? "");
    setDescription(milestone?.description ?? "");
    setDueDate(milestone?.due_date ?? "");
    setStatus(milestone?.status ?? "todo");
    setWeight(milestone ? String(milestone.weight) : "1");
    setError(null);
  }, [open, milestone, setError]);

  const doSubmit = () => {
    if (!name.trim()) {
      setError("Le nom du jalon est obligatoire.");
      return;
    }
    const payload = {
      name: name.trim(),
      description: nullable(description),
      due_date: dueDate || null,
      status,
      weight: Math.max(1, Number(weight) || 1),
    };
    void submit(
      () =>
        milestone
          ? apiFetch(`/projects/milestones/${milestone.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch(`/projects/${projectId}/milestones`, {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      milestone ? "Jalon mis à jour." : "Jalon créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{milestone ? "Modifier le jalon" : "Nouveau jalon"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="milestone-name">Nom</Label>
            <Input id="milestone-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="milestone-description">Description</Label>
            <Textarea
              id="milestone-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="milestone-due">Échéance</Label>
              <Input
                id="milestone-due"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="milestone-status">Statut</Label>
              <Select
                id="milestone-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="done">Terminé</option>
                <option value="cancelled">Annulé</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="milestone-weight">Poids</Label>
              <Input
                id="milestone-weight"
                inputMode="numeric"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
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

// --- Tâche -------------------------------------------------------------------

interface TaskDialogProps extends BaseDialogProps {
  projectId: string;
  task: ProjectTaskItem | null;
  milestones: MilestoneItem[];
  users: TicketUserRef[];
}

export function TaskDialog({
  open,
  onOpenChange,
  projectId,
  task,
  milestones,
  users,
  onSaved,
}: TaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setMilestoneId(task?.milestone_id ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? "medium");
    setAssigneeId(task?.assignee_user_id ?? "");
    setDueDate(task?.due_date ?? "");
    setError(null);
  }, [open, task, setError]);

  const doSubmit = () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: nullable(description),
      milestone_id: milestoneId || null,
      status,
      priority,
      assignee_user_id: assigneeId || null,
      due_date: dueDate || null,
    };
    void submit(
      () =>
        task
          ? apiFetch(`/projects/tasks/${task.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch(`/projects/${projectId}/tasks`, {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      task ? "Tâche mise à jour." : "Tâche créée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="task-title">Titre</Label>
            <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="task-milestone">Jalon</Label>
              <Select
                id="task-milestone"
                value={milestoneId}
                onChange={(event) => setMilestoneId(event.target.value)}
              >
                <option value="">Aucun</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="task-status">Statut</Label>
              <Select
                id="task-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="blocked">Bloquée</option>
                <option value="done">Terminée</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="task-priority">Priorité</Label>
              <Select
                id="task-priority"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="task-assignee">Assigné à</Label>
              <Select
                id="task-assignee"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">Non assigné</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="task-due">Échéance</Label>
              <Input
                id="task-due"
                type="date"
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

// --- Risque ------------------------------------------------------------------

interface RiskDialogProps extends BaseDialogProps {
  projectId: string;
  risk: ProjectRiskItem | null;
  users: TicketUserRef[];
}

export function RiskDialog({ open, onOpenChange, projectId, risk, users, onSaved }: RiskDialogProps) {
  const [description, setDescription] = useState("");
  const [probability, setProbability] = useState("3");
  const [impact, setImpact] = useState("3");
  const [mitigation, setMitigation] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("open");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setDescription(risk?.description ?? "");
    setProbability(risk ? String(risk.probability) : "3");
    setImpact(risk ? String(risk.impact) : "3");
    setMitigation(risk?.mitigation ?? "");
    setOwnerId(risk?.owner_user_id ?? "");
    setStatus(risk?.status ?? "open");
    setError(null);
  }, [open, risk, setError]);

  const doSubmit = () => {
    if (!description.trim()) {
      setError("La description est obligatoire.");
      return;
    }
    const payload = {
      description: description.trim(),
      probability: Math.max(1, Math.min(5, Number(probability) || 3)),
      impact: Math.max(1, Math.min(5, Number(impact) || 3)),
      mitigation: nullable(mitigation),
      owner_user_id: ownerId || null,
      status,
    };
    void submit(
      () =>
        risk
          ? apiFetch(`/projects/risks/${risk.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch(`/projects/${projectId}/risks`, {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      risk ? "Risque mis à jour." : "Risque créé.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{risk ? "Modifier le risque" : "Nouveau risque"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="risk-description">Description</Label>
            <Textarea
              id="risk-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="risk-probability">Probabilité (1-5)</Label>
              <Input
                id="risk-probability"
                inputMode="numeric"
                value={probability}
                onChange={(event) => setProbability(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="risk-impact">Impact (1-5)</Label>
              <Input
                id="risk-impact"
                inputMode="numeric"
                value={impact}
                onChange={(event) => setImpact(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="risk-mitigation">Mitigation</Label>
            <Textarea
              id="risk-mitigation"
              value={mitigation}
              onChange={(event) => setMitigation(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="risk-owner">Responsable</Label>
              <Select
                id="risk-owner"
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
              <Label htmlFor="risk-status">Statut</Label>
              <Select
                id="risk-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="open">Ouvert</option>
                <option value="mitigated">Atténué</option>
                <option value="closed">Clos</option>
              </Select>
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

// --- Décision ----------------------------------------------------------------

interface DecisionDialogProps extends BaseDialogProps {
  projectId: string;
  decision: ProjectDecisionItem | null;
}

export function DecisionDialog({
  open,
  onOpenChange,
  projectId,
  decision,
  onSaved,
}: DecisionDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [decisionDate, setDecisionDate] = useState("");
  const [decidedBy, setDecidedBy] = useState("");
  const { loading, error, setError, submit } = useSubmit(onSaved);

  useEffect(() => {
    if (!open) return;
    setTitle(decision?.title ?? "");
    setDescription(decision?.description ?? "");
    setDecisionDate(decision?.decision_date ?? "");
    setDecidedBy(decision?.decided_by ?? "");
    setError(null);
  }, [open, decision, setError]);

  const doSubmit = () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    const payload = {
      title: title.trim(),
      description: nullable(description),
      decision_date: decisionDate || null,
      decided_by: nullable(decidedBy),
    };
    void submit(
      () =>
        decision
          ? apiFetch(`/projects/decisions/${decision.id}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : apiFetch(`/projects/${projectId}/decisions`, {
              method: "POST",
              body: JSON.stringify(payload),
            }),
      decision ? "Décision mise à jour." : "Décision enregistrée.",
      () => onOpenChange(false),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{decision ? "Modifier la décision" : "Nouvelle décision"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="decision-title">Titre</Label>
            <Input
              id="decision-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="decision-description">Description</Label>
            <Textarea
              id="decision-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="decision-date">Date</Label>
              <Input
                id="decision-date"
                type="date"
                value={decisionDate}
                onChange={(event) => setDecisionDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="decision-by">Décision prise par</Label>
              <Input
                id="decision-by"
                value={decidedBy}
                onChange={(event) => setDecidedBy(event.target.value)}
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
