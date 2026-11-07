import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Upload,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

import { AgentFormDialog } from "@/features/agents/AgentFormDialog";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { formatDate, fullName } from "@/lib/utils";
import type { AgentItem, LocationItem, Page, ServiceItem } from "@/types/api";

const statusTones: Record<string, "success" | "info" | "neutral" | "warning"> = {
  active: "success",
  arriving: "info",
  departed: "neutral",
  suspended: "warning",
};

const statusLabels: Record<string, string> = {
  active: "Actif",
  arriving: "Arrivée prévue",
  departed: "Parti",
  suspended: "Suspendu",
};

export function AgentsPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AgentItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AgentItem | null>(null);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, serviceFilter, statusFilter]);

  const servicesQuery = useQuery({
    queryKey: ["referentials", "services"],
    queryFn: () => apiFetch<ServiceItem[]>("/services"),
    staleTime: 60_000,
  });
  const locationsQuery = useQuery({
    queryKey: ["referentials", "locations"],
    queryFn: () => apiFetch<LocationItem[]>("/locations"),
    staleTime: 60_000,
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", { page, q: deferredSearch, serviceFilter, statusFilter }],
    queryFn: () =>
      apiFetch<Page<AgentItem>>(
        `/agents${buildQuery({
          page,
          page_size: 20,
          q: deferredSearch,
          service_id: serviceFilter,
          status: statusFilter,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const archiveMutation = useMutation({
    mutationFn: (agent: AgentItem) =>
      apiFetch(`/agents/${agent.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Agent archivé. Son historique est conservé.");
      setArchiveTarget(null);
      void agentsQuery.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Archivage impossible."),
  });

  const services = servicesQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const canCreate = hasPermission("agents.create");
  const canEdit = hasPermission("agents.update");
  const canArchive = hasPermission("agents.delete");
  const canImport = hasPermission("imports.preview");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Annuaire"
        title="Agents"
        description="Fiches agents, rattachement aux services et sites, arrivées et départs."
        actions={
          <>
            {canImport ? (
              <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Importer
              </Button>
            ) : null}
            {canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvel agent
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un nom, un e-mail, un identifiant…"
              className="pl-8"
              aria-label="Rechercher un agent"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <Select
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              aria-label="Filtrer par service"
              className="sm:w-56"
            >
              <option value="">Tous les services</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.code} — {service.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtrer par statut"
              className="sm:w-40"
            >
              <option value="">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="arriving">Arrivées prévues</option>
              <option value="departed">Partis</option>
              <option value="suspended">Suspendus</option>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0 pt-3">
          {agentsQuery.isError ? (
            <ErrorState
              message={agentsQuery.error instanceof Error ? agentsQuery.error.message : "Erreur inconnue."}
              onRetry={() => void agentsQuery.refetch()}
            />
          ) : agentsQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : agents.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aucun agent"
              description="Créez une fiche agent ou importez votre annuaire CSV."
              action={
                canCreate ? (
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <UserRoundPlus className="h-3.5 w-3.5" />
                    Créer un agent
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="hidden lg:table-cell">Site</TableHead>
                  <TableHead className="hidden xl:table-cell">Fonction</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden xl:table-cell">Arrivée</TableHead>
                  <TableHead className="w-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar firstName={agent.first_name} lastName={agent.last_name} className="h-8 w-8" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-foreground">
                            {fullName(agent.first_name, agent.last_name)}
                          </p>
                          <p className="truncate text-[10px] text-muted-2">{agent.email_pro}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {agent.service ? `${agent.service.code} — ${agent.service.name}` : "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {agent.location?.name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {agent.function_label ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[agent.status] ?? "neutral"}>
                        {statusLabels[agent.status] ?? agent.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {formatDate(agent.arrival_date)}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions pour ${agent.email_pro}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {canEdit ? (
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(agent);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Modifier
                            </DropdownMenuItem>
                          ) : null}
                          {canArchive ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-danger focus:bg-danger/10 focus:text-danger"
                                onSelect={() => setArchiveTarget(agent)}
                              >
                                <Archive className="h-3.5 w-3.5" />
                                Archiver l'agent
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {agentsQuery.data && agentsQuery.data.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
            <span>
              Page {agentsQuery.data.page} sur {agentsQuery.data.pages} · {agentsQuery.data.total} agent(s)
            </span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Précédent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= agentsQuery.data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <AgentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        agent={editing}
        services={services}
        locations={locations}
        onSaved={() => void agentsQuery.refetch()}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType="agents"
        entityLabel="agents"
        onImported={() => void agentsQuery.refetch()}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archiver cet agent ?"
        description="L'agent passera au statut « parti » avec la date du jour. Ses équipements, tickets et son historique sont conservés."
        confirmLabel="Archiver"
        tone="danger"
        loading={archiveMutation.isPending}
        onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)}
      />
    </div>
  );
}
