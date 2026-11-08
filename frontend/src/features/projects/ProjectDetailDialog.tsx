import { CheckSquare, Flag, Gavel, Plus, ShieldAlert, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  DecisionDialog,
  MilestoneDialog,
  RiskDialog,
  TaskDialog,
} from "@/features/projects/ProjectDialogs";
import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatNumber, fullName } from "@/lib/utils";
import type {
  MilestoneItem,
  ProjectDecisionItem,
  ProjectDetailItem,
  ProjectRiskItem,
  ProjectTaskItem,
  TicketUserRef,
} from "@/types/api";

const statusLabels: Record<string, string> = {
  idea: "Idée",
  planned: "Planifié",
  in_progress: "En cours",
  on_hold: "En pause",
  done: "Terminé",
  cancelled: "Annulé",
  todo: "À faire",
  blocked: "Bloquée",
  open: "Ouvert",
  mitigated: "Atténué",
  closed: "Clos",
};

const priorityTones: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

interface ProjectDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetailItem | null;
  users: TicketUserRef[];
  onChanged: () => void;
}

export function ProjectDetailDialog({
  open,
  onOpenChange,
  project,
  users,
  onChanged,
}: ProjectDetailDialogProps) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("projects.manage");

  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<MilestoneItem | null>(null);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTaskItem | null>(null);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectRiskItem | null>(null);
  const [decisionDialogOpen, setDecisionDialogOpen] = useState(false);
  const [editingDecision, setEditingDecision] = useState<ProjectDecisionItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "milestone" | "task" | "risk" | "decision";
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const userName = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((item) => item.id === userId);
    return user ? fullName(user.first_name, user.last_name) : "—";
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const path =
        deleteTarget.kind === "milestone"
          ? `/projects/milestones/${deleteTarget.id}`
          : deleteTarget.kind === "task"
            ? `/projects/tasks/${deleteTarget.id}`
            : deleteTarget.kind === "risk"
              ? `/projects/risks/${deleteTarget.id}`
              : `/projects/decisions/${deleteTarget.id}`;
      await apiFetch(path, { method: "DELETE" });
      toast.success("Élément supprimé.");
      setDeleteTarget(null);
      onChanged();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {project?.name ?? "Projet"}
            {project ? (
              <Badge tone={project.status === "done" ? "success" : "info"}>
                {statusLabels[project.status] ?? project.status}
              </Badge>
            ) : null}
            {project ? (
              <Badge tone={priorityTones[project.priority] ?? "neutral"}>
                {project.priority}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {project?.code} · Responsable :{" "}
            {project?.owner ? fullName(project.owner.first_name, project.owner.last_name) : "—"}
          </DialogDescription>
        </DialogHeader>

        {project ? (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-3 rounded-lg border border-border-soft bg-background-soft/60 p-3 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Début</p>
                <p className="mt-0.5 text-xs text-foreground">{formatDate(project.start_date)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Échéance</p>
                <p className="mt-0.5 text-xs text-foreground">{formatDate(project.due_date)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Budget prévu</p>
                <p className="mt-0.5 text-xs text-foreground">
                  {project.planned_budget != null
                    ? formatCurrency(project.planned_budget, 0)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Avancement</p>
                <p className="mt-0.5 text-xs text-foreground">{project.progress_percent} %</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-success"
                    style={{ width: `${project.progress_percent}%` }}
                  />
                </div>
              </div>
            </div>

            {project.description ? (
              <p className="whitespace-pre-wrap text-xs text-muted">{project.description}</p>
            ) : null}
            {project.objectives ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Objectifs</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted">{project.objectives}</p>
              </div>
            ) : null}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Flag className="h-3.5 w-3.5 text-accent" />
                  Jalons ({formatNumber(project.milestones.length)})
                </p>
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingMilestone(null);
                      setMilestoneDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Jalon
                  </Button>
                ) : null}
              </div>
              {project.milestones.length === 0 ? (
                <p className="text-xs text-muted-2">Aucun jalon.</p>
              ) : (
                <div className="space-y-1.5">
                  {project.milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft px-3 py-1.5 text-[11px]"
                    >
                      <div>
                        <span className="font-medium text-foreground">{milestone.name}</span>
                        <span className="ml-2 text-muted-2">{formatDate(milestone.due_date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={milestone.status === "done" ? "success" : "neutral"}>
                          {statusLabels[milestone.status] ?? milestone.status}
                        </Badge>
                        {canManage ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${milestone.name}`}
                              onClick={() => {
                                setEditingMilestone(milestone);
                                setMilestoneDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${milestone.name}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "milestone",
                                  id: milestone.id,
                                  label: milestone.name,
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3 text-danger" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <CheckSquare className="h-3.5 w-3.5 text-accent" />
                  Tâches ({formatNumber(project.tasks.length)})
                </p>
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingTask(null);
                      setTaskDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Tâche
                  </Button>
                ) : null}
              </div>
              {project.tasks.length === 0 ? (
                <p className="text-xs text-muted-2">Aucune tâche.</p>
              ) : (
                <div className="space-y-1.5">
                  {project.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft px-3 py-1.5 text-[11px]"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{task.title}</span>
                        <span className="ml-2 text-muted-2">
                          {userName(task.assignee_user_id)} · {formatDate(task.due_date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={priorityTones[task.priority] ?? "neutral"}>
                          {task.priority}
                        </Badge>
                        <Badge tone={task.status === "done" ? "success" : "neutral"}>
                          {statusLabels[task.status] ?? task.status}
                        </Badge>
                        {canManage ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${task.title}`}
                              onClick={() => {
                                setEditingTask(task);
                                setTaskDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${task.title}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "task",
                                  id: task.id,
                                  label: task.title,
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3 text-danger" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldAlert className="h-3.5 w-3.5 text-accent" />
                  Risques ({formatNumber(project.risks.length)})
                </p>
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingRisk(null);
                      setRiskDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Risque
                  </Button>
                ) : null}
              </div>
              {project.risks.length === 0 ? (
                <p className="text-xs text-muted-2">Aucun risque.</p>
              ) : (
                <div className="space-y-1.5">
                  {project.risks.map((risk) => (
                    <div
                      key={risk.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft px-3 py-1.5 text-[11px]"
                    >
                      <div>
                        <span className="font-medium text-foreground">{risk.description}</span>
                        <span className="ml-2 text-muted-2">
                          P{risk.probability} × I{risk.impact} = {risk.score}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={risk.score >= 15 ? "danger" : risk.score >= 8 ? "warning" : "info"}>
                          {risk.score >= 15 ? "Élevé" : risk.score >= 8 ? "Moyen" : "Faible"}
                        </Badge>
                        {canManage ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${risk.description}`}
                              onClick={() => {
                                setEditingRisk(risk);
                                setRiskDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Supprimer ${risk.description}`}
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "risk",
                                  id: risk.id,
                                  label: risk.description,
                                })
                              }
                            >
                              <Trash2 className="h-3 w-3 text-danger" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Gavel className="h-3.5 w-3.5 text-accent" />
                  Décisions ({formatNumber(project.decisions.length)})
                </p>
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditingDecision(null);
                      setDecisionDialogOpen(true);
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Décision
                  </Button>
                ) : null}
              </div>
              {project.decisions.length === 0 ? (
                <p className="text-xs text-muted-2">Aucune décision.</p>
              ) : (
                <div className="space-y-1.5">
                  {project.decisions.map((decision) => (
                    <div
                      key={decision.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft px-3 py-1.5 text-[11px]"
                    >
                      <div>
                        <span className="font-medium text-foreground">{decision.title}</span>
                        <span className="ml-2 text-muted-2">
                          {formatDate(decision.decision_date)}
                          {decision.decided_by ? ` · ${decision.decided_by}` : ""}
                        </span>
                      </div>
                      {canManage ? (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifier ${decision.title}`}
                            onClick={() => {
                              setEditingDecision(decision);
                              setDecisionDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Supprimer ${decision.title}`}
                            onClick={() =>
                              setDeleteTarget({
                                kind: "decision",
                                id: decision.id,
                                label: decision.title,
                              })
                            }
                          >
                            <Trash2 className="h-3 w-3 text-danger" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>

        {project ? (
          <>
            <MilestoneDialog
              open={milestoneDialogOpen}
              onOpenChange={setMilestoneDialogOpen}
              projectId={project.id}
              milestone={editingMilestone}
              onSaved={onChanged}
            />
            <TaskDialog
              open={taskDialogOpen}
              onOpenChange={setTaskDialogOpen}
              projectId={project.id}
              task={editingTask}
              milestones={project.milestones}
              users={users}
              onSaved={onChanged}
            />
            <RiskDialog
              open={riskDialogOpen}
              onOpenChange={setRiskDialogOpen}
              projectId={project.id}
              risk={editingRisk}
              users={users}
              onSaved={onChanged}
            />
            <DecisionDialog
              open={decisionDialogOpen}
              onOpenChange={setDecisionDialogOpen}
              projectId={project.id}
              decision={editingDecision}
              onSaved={onChanged}
            />
          </>
        ) : null}

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Supprimer cet élément ?"
          description={`« ${deleteTarget?.label ?? ""} » sera définitivement supprimé.`}
          confirmLabel="Supprimer"
          tone="danger"
          loading={deleting}
          onConfirm={() => void remove()}
        />
      </DialogContent>
    </Dialog>
  );
}
