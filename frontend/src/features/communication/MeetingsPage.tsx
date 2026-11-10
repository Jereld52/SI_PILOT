import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ExternalLink,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { MeetingDialog } from "@/features/communication/CommunicationDialogs";
import {
  meetingStatusLabels,
  meetingStatusTones,
  meetingTypeLabels,
} from "@/features/communication/labels";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { MeetingItem, TicketUserRef } from "@/types/api";

export function MeetingsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("meetings.read");
  const canManage = hasPermission("meetings.manage");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MeetingItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const meetingsQuery = useQuery({
    queryKey: ["communication", "meetings"],
    queryFn: () => apiFetch<MeetingItem[]>("/communication/meetings"),
    enabled: canRead,
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    enabled: canRead && canManage,
  });

  const meetings = meetingsQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return meetings.filter((meeting) => {
      if (typeFilter && meeting.meeting_type !== typeFilter) return false;
      if (statusFilter && meeting.status !== statusFilter) return false;
      if (!needle) return true;
      return `${meeting.title} ${meeting.agenda ?? ""} ${meeting.notes ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [meetings, search, typeFilter, statusFilter]);

  const now = Date.now();
  const upcoming = meetings.filter(
    (meeting) => meeting.status === "planned" && new Date(meeting.scheduled_at).getTime() >= now,
  ).length;
  const oneOnOne = meetings.filter((meeting) => meeting.meeting_type === "manager_1on1").length;
  const openPoints = meetings.reduce((total, meeting) => total + meeting.open_point_count, 0);

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/communication/meetings/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Réunion supprimée.");
      setDeleteTarget(null);
      void meetingsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Suppression impossible.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les réunions."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Réunions</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{meetings.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">À venir</p>
          <p className="mt-1 text-2xl font-semibold text-info">{upcoming}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Points avec la responsable</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{oneOnOne}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Points ouverts</p>
          <p className="mt-1 text-2xl font-semibold text-warning">{openPoints}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une réunion…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <Select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="w-full sm:w-48"
            >
              <option value="">Tous les types</option>
              {Object.entries(meetingTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-40"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(meetingStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Link
              to="/communication/points"
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-transparent px-3 text-xs font-medium text-foreground hover:bg-surface-2"
            >
              <ListChecks className="h-3.5 w-3.5" />
              Points 1:1
            </Link>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle réunion
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {meetingsQuery.isError ? (
            <ErrorState
              message={
                meetingsQuery.error instanceof Error
                  ? meetingsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void meetingsQuery.refetch()}
            />
          ) : meetingsQuery.isLoading ? (
            <div className="space-y-1 px-3 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Aucune réunion"
              description="Planifiez une réunion d'équipe ou un point avec la responsable."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Réunion</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden lg:table-cell">Participants</TableHead>
                  <TableHead className="hidden xl:table-cell">Points ouverts</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((meeting) => (
                  <TableRow key={meeting.id}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{meeting.title}</p>
                      <p className="text-[10px] text-muted-2">
                        {meeting.location || (meeting.visio_url ? "Visio" : "Lieu non précisé")}
                        {meeting.organizer
                          ? ` · ${meeting.organizer.first_name} ${meeting.organizer.last_name}`
                          : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {meetingTypeLabels[meeting.meeting_type] ?? meeting.meeting_type}
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {formatDateTime(meeting.scheduled_at)}
                      <span className="block text-[10px] text-muted-2">
                        {meeting.duration_minutes} min
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {meeting.participants.length}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {meeting.open_point_count}
                    </TableCell>
                    <TableCell>
                      <Badge tone={meetingStatusTones[meeting.status] ?? "neutral"}>
                        {meetingStatusLabels[meeting.status] ?? meeting.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {meeting.visio_url ? (
                          <a
                            href={meeting.visio_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
                            aria-label="Ouvrir la visio"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        {canManage ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(meeting);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:bg-danger/10 hover:text-danger"
                              onClick={() => setDeleteTarget(meeting)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MeetingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        meeting={editing}
        users={users}
        onSaved={() => void meetingsQuery.refetch()}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Supprimer « ${deleteTarget?.title ?? ""} » ?`}
        description="La réunion et son ordre du jour seront supprimés. Les points de suivi associés seront détachés."
        confirmLabel="Supprimer"
        tone="danger"
        loading={deleteLoading}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
