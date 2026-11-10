import { useQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { TrainingDialog } from "@/features/communication/CommunicationDialogs";
import { trainingStatusLabels, trainingStatusTones } from "@/features/communication/labels";
import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AgentItem, Page, TrainingItem } from "@/types/api";

export function TrainingsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("trainings.read");
  const canManage = hasPermission("trainings.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrainingItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const trainingsQuery = useQuery({
    queryKey: ["communication", "trainings"],
    queryFn: () => apiFetch<TrainingItem[]>("/communication/trainings"),
    enabled: canRead,
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", "active", 100],
    queryFn: () => apiFetch<Page<AgentItem>>("/agents?page=1&page_size=100&status=active"),
    enabled: canRead && canManage,
  });

  const trainings = trainingsQuery.data ?? [];
  const agents = agentsQuery.data?.items ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return trainings.filter((training) => {
      if (statusFilter && training.status !== statusFilter) return false;
      if (mandatoryOnly && !training.mandatory) return false;
      if (!needle) return true;
      return `${training.title} ${training.provider ?? ""} ${training.description ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [trainings, search, statusFilter, mandatoryOnly]);

  const planned = trainings.filter((training) => training.status === "planned").length;
  const completed = trainings.filter((training) => training.status === "completed").length;
  const mandatory = trainings.filter((training) => training.mandatory).length;
  const totalCost = trainings.reduce((total, training) => total + (training.cost ?? 0), 0);

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/communication/trainings/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Formation supprimée.");
      setDeleteTarget(null);
      void trainingsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Suppression impossible.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les formations."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Formations</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{trainings.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Planifiées</p>
          <p className="mt-1 text-2xl font-semibold text-info">{planned}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Obligatoires</p>
          <p className="mt-1 text-2xl font-semibold text-warning">{mandatory}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Terminées</p>
          <p className="mt-1 text-2xl font-semibold text-success">
            {completed}
            {totalCost > 0 ? (
              <span className="ml-2 text-[11px] font-normal text-muted-2">
                {formatCurrency(totalCost, 0)}
              </span>
            ) : null}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une formation…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-40"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(trainingStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 rounded-lg border border-border-soft bg-background/40 px-3 py-2 text-[11px] text-muted">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={mandatoryOnly}
                onChange={(event) => setMandatoryOnly(event.target.checked)}
              />
              Obligatoires
            </label>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle formation
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {trainingsQuery.isError ? (
            <ErrorState
              message={
                trainingsQuery.error instanceof Error
                  ? trainingsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void trainingsQuery.refetch()}
            />
          ) : trainingsQuery.isLoading ? (
            <div className="space-y-1 px-3 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Aucune formation"
              description="Planifiez une formation et suivez les participants."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Formation</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="hidden lg:table-cell">Durée</TableHead>
                  <TableHead className="hidden xl:table-cell">Participants</TableHead>
                  <TableHead className="hidden lg:table-cell">Coût</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((training) => (
                  <TableRow key={training.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-medium text-foreground">{training.title}</p>
                        {training.mandatory ? <Badge tone="warning">Obligatoire</Badge> : null}
                      </div>
                      <p className="text-[10px] text-muted-2">
                        {training.provider || "Organisme non précisé"}
                        {training.category ? ` · ${training.category}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {training.start_date ? formatDate(training.start_date) : "—"}
                      {training.end_date && training.end_date !== training.start_date
                        ? ` → ${formatDate(training.end_date)}`
                        : ""}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {training.duration_hours != null ? `${training.duration_hours} h` : "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {training.participants.length}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {training.cost != null ? formatCurrency(training.cost, 0) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={trainingStatusTones[training.status] ?? "neutral"}>
                        {trainingStatusLabels[training.status] ?? training.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(training);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger/10 hover:text-danger"
                            onClick={() => setDeleteTarget(training)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TrainingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        training={editing}
        agents={agents}
        onSaved={() => void trainingsQuery.refetch()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Supprimer « ${deleteTarget?.title ?? ""} » ?`}
        description="La formation sera définitivement supprimée."
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteLoading}
        onConfirm={() => void remove()}
      />
      <div className="flex items-center gap-2 text-[10px] text-muted-2">
        <ShieldCheck className="h-3.5 w-3.5" />
        Les formations obligatoires peuvent être suivies dans les points de suivi et le calendrier.
      </div>
    </div>
  );
}
