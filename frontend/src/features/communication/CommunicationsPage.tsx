import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  CheckCheck,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Search,
  Send,
  Trash2,
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
import { useAuth } from "@/features/auth/AuthProvider";
import { CommunicationDialog } from "@/features/communication/CommunicationDialogs";
import {
  communicationCategoryLabels,
  communicationChannelLabels,
  communicationStatusLabels,
  communicationStatusTones,
} from "@/features/communication/labels";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import type { CommunicationItem, Role, ServiceItem, TicketUserRef } from "@/types/api";

export function CommunicationsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("communications.read");
  const canManage = hasPermission("communications.manage");
  const canPublish = hasPermission("communications.publish");
  const canReadRoles = hasPermission("admin.roles.read");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CommunicationItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CommunicationItem | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const communicationsQuery = useQuery({
    queryKey: ["communication", "communications"],
    queryFn: () => apiFetch<CommunicationItem[]>("/communication/communications"),
    enabled: canRead,
  });
  const servicesQuery = useQuery({
    queryKey: ["referentials", "services"],
    queryFn: () => apiFetch<ServiceItem[]>("/services"),
    enabled: canRead && canManage,
  });
  const rolesQuery = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => apiFetch<Role[]>("/admin/roles"),
    enabled: canRead && canManage && canReadRoles,
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    enabled: canRead && canManage,
  });

  const items = communicationsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const roles = rolesQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (!needle) return true;
      return `${item.title} ${item.body} ${item.audience_label}`
        .toLowerCase()
        .includes(needle);
    });
  }, [items, search, statusFilter, categoryFilter]);

  const unread = items.filter((item) => !item.is_read && item.status === "published").length;
  const published = items.filter((item) => item.status === "published").length;
  const drafts = items.filter((item) => item.status === "draft").length;

  const publish = async (communication: CommunicationItem) => {
    try {
      await apiFetch(`/communication/communications/${communication.id}/publish`, {
        method: "POST",
      });
      toast.success("Communication publiée.");
      void communicationsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Publication impossible.");
    }
  };

  const markRead = async (communication: CommunicationItem) => {
    try {
      await apiFetch(`/communication/communications/${communication.id}/read`, {
        method: "POST",
      });
      void communicationsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Marquage impossible.");
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiveLoading(true);
    try {
      await apiFetch(`/communication/communications/${archiveTarget.id}`, {
        method: "DELETE",
      });
      toast.success("Communication archivée.");
      setArchiveTarget(null);
      void communicationsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Archivage impossible.");
    } finally {
      setArchiveLoading(false);
    }
  };

  if (!canRead) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Accès refusé"
        description="Votre rôle ne permet pas de consulter les communications."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Communications</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{items.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Publiées</p>
          <p className="mt-1 text-2xl font-semibold text-success">{published}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Brouillons</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{drafts}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Non lues</p>
          <p className="mt-1 text-2xl font-semibold text-warning">{unread}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une communication…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-44"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(communicationStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full sm:w-44"
            >
              <option value="">Toutes les catégories</option>
              {Object.entries(communicationCategoryLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle communication
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {communicationsQuery.isError ? (
            <ErrorState
              message={
                communicationsQuery.error instanceof Error
                  ? communicationsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void communicationsQuery.refetch()}
            />
          ) : communicationsQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="Aucune communication"
              description="Créez un message pour informer les utilisateurs."
            />
          ) : (
            filtered.map((item) => (
              <article
                key={item.id}
                className="rounded-lg border border-border-soft bg-background/40 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.is_pinned ? (
                        <Pin className="h-3.5 w-3.5 text-accent" aria-label="Épinglée" />
                      ) : null}
                      <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                      {!item.is_read && item.status === "published" ? (
                        <Badge tone="warning">Non lue</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-2">
                      {item.audience_label} · {communicationChannelLabels[item.channel] ?? item.channel}
                      {item.published_at
                        ? ` · publiée le ${formatDateTime(item.published_at)}`
                        : item.scheduled_at
                          ? ` · prévue le ${formatDateTime(item.scheduled_at)}`
                          : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={communicationStatusTones[item.status] ?? "neutral"}>
                      {communicationStatusLabels[item.status] ?? item.status}
                    </Badge>
                    <Badge tone="neutral">
                      {communicationCategoryLabels[item.category] ?? item.category}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap text-xs text-muted">
                  {item.body}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-2">
                    {item.author
                      ? `Par ${item.author.first_name} ${item.author.last_name}`
                      : "Auteur non précisé"}
                    {` · ${item.read_count}/${item.recipient_count} lu(s)`}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {!item.is_read && item.status === "published" ? (
                      <Button size="sm" variant="ghost" onClick={() => void markRead(item)}>
                        <CheckCheck className="h-3.5 w-3.5" />
                        Marquer comme lue
                      </Button>
                    ) : null}
                    {canPublish && item.status !== "published" && item.status !== "archived" ? (
                      <Button size="sm" variant="secondary" onClick={() => void publish(item)}>
                        <Send className="h-3.5 w-3.5" />
                        Publier
                      </Button>
                    ) : null}
                    {canManage ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(item);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger hover:bg-danger/10 hover:text-danger"
                          onClick={() => setArchiveTarget(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Archiver
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>

      <CommunicationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        communication={editing}
        services={services}
        roles={roles}
        users={users}
        onSaved={() => void communicationsQuery.refetch()}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title={`Archiver « ${archiveTarget?.title ?? ""} » ?`}
        description="La communication restera consultable avec le statut Archivée."
        confirmLabel="Archiver"
        tone="danger"
        loading={archiveLoading}
        onConfirm={() => void archive()}
      />
      <div className="flex items-center gap-2 text-[10px] text-muted-2">
        <BellRing className="h-3.5 w-3.5" />
        La publication crée une notification pour chaque destinataire. Le canal e-mail dépend de la
        configuration SMTP.
      </div>
    </div>
  );
}
