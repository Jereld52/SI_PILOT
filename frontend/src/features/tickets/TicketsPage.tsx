import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  LifeBuoy,
  Pencil,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { InterventionDialog } from "@/features/tickets/InterventionDialog";
import { TicketDetailDialog } from "@/features/tickets/TicketDetailDialog";
import { TicketFormDialog } from "@/features/tickets/TicketFormDialog";
import { apiFetch, buildQuery } from "@/lib/api";
import { cn, formatCurrency, formatDateTime, formatNumber, fullName } from "@/lib/utils";
import type {
  AgentItem,
  AssetItem,
  InterventionItem,
  Page,
  ServiceItem,
  SupplierItem,
  TicketDetailItem,
  TicketItem,
  TicketMeta,
  TicketUserRef,
} from "@/types/api";

type TabKey = "tickets" | "interventions";

const priorityTones: Record<string, "danger" | "warning" | "info" | "neutral"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const interventionStatusLabels: Record<string, string> = {
  planned: "Planifiée",
  in_progress: "En cours",
  done: "Terminée",
  cancelled: "Annulée",
};

const interventionStatusTones: Record<string, "info" | "warning" | "success" | "neutral"> = {
  planned: "info",
  in_progress: "warning",
  done: "success",
  cancelled: "neutral",
};

const interventionTypeLabels: Record<string, string> = {
  corrective: "Corrective",
  preventive: "Préventive",
  installation: "Installation",
  audit: "Audit",
  other: "Autre",
};

export function TicketsPage() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const canTickets = hasPermission("tickets.read");
  const canInterventions = hasPermission("interventions.read");
  const canCreateTicket = hasPermission("tickets.create");
  const canCreateIntervention = hasPermission("interventions.create");
  const canEditIntervention = hasPermission("interventions.update");

  const [tab, setTab] = useState<TabKey>(canTickets ? "tickets" : "interventions");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [page, setPage] = useState(1);
  const [interventionStatus, setInterventionStatus] = useState("");
  const [interventionPage, setInterventionPage] = useState(1);
  const [exportGranularity, setExportGranularity] = useState("month");

  const [ticketFormOpen, setTicketFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [interventionFormOpen, setInterventionFormOpen] = useState(false);
  const [editingIntervention, setEditingIntervention] = useState<InterventionItem | null>(null);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, statusFilter, priorityFilter, includeClosed]);
  useEffect(() => {
    setInterventionPage(1);
  }, [deferredSearch, interventionStatus]);

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const query = searchParams.get("q");
    if (query) setSearch(query);
  }, [searchParams]);

  const metaQuery = useQuery({
    queryKey: ["tickets", "meta"],
    queryFn: () => apiFetch<TicketMeta>("/tickets/meta"),
    enabled: canTickets,
  });
  const ticketsQuery = useQuery({
    queryKey: ["tickets", page, deferredSearch, statusFilter, priorityFilter, includeClosed],
    queryFn: () =>
      apiFetch<Page<TicketItem>>(
        `/tickets${buildQuery({
          page,
          page_size: 20,
          q: deferredSearch,
          status: statusFilter,
          priority: priorityFilter,
          include_closed: includeClosed,
        })}`,
      ),
    enabled: canTickets && tab === "tickets",
    placeholderData: keepPreviousData,
  });
  const detailQuery = useQuery({
    queryKey: ["tickets", "detail", detailId],
    queryFn: () => apiFetch<TicketDetailItem>(`/tickets/${detailId}`),
    enabled: Boolean(detailId),
  });
  const pickerTicketsQuery = useQuery({
    queryKey: ["tickets", "intervention-picker"],
    queryFn: () => apiFetch<Page<TicketItem>>("/tickets?page=1&page_size=100&include_closed=true"),
    enabled: canInterventions,
    staleTime: 30_000,
  });
  const interventionsQuery = useQuery({
    queryKey: ["interventions", interventionPage, deferredSearch, interventionStatus],
    queryFn: () =>
      apiFetch<Page<InterventionItem>>(
        `/interventions${buildQuery({
          page: interventionPage,
          page_size: 25,
          q: deferredSearch,
          status: interventionStatus,
        })}`,
      ),
    enabled: canInterventions && tab === "interventions",
    placeholderData: keepPreviousData,
  });
  const assigneesQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    enabled: canTickets || canInterventions,
    staleTime: 60_000,
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", "ticket-picker"],
    queryFn: () => apiFetch<Page<AgentItem>>("/agents?page=1&page_size=100&status=active"),
    staleTime: 60_000,
  });
  const servicesQuery = useQuery({
    queryKey: ["referentials", "services"],
    queryFn: () => apiFetch<ServiceItem[]>("/services"),
    staleTime: 60_000,
  });
  const assetsQuery = useQuery({
    queryKey: ["assets", "ticket-picker"],
    queryFn: () => apiFetch<Page<AssetItem>>("/assets?page=1&page_size=100"),
    staleTime: 30_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "interventions"],
    queryFn: () => apiFetch<SupplierItem[]>("/suppliers"),
    enabled: canInterventions,
    staleTime: 60_000,
  });

  const meta = metaQuery.data ?? null;
  const tickets = ticketsQuery.data?.items ?? [];
  const pickerTickets = pickerTicketsQuery.data?.items ?? [];
  const interventions = interventionsQuery.data?.items ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const services = servicesQuery.data ?? [];
  const assets = assetsQuery.data?.items ?? [];
  const assignees = assigneesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  const refreshTickets = () => {
    void ticketsQuery.refetch();
    void metaQuery.refetch();
    void pickerTicketsQuery.refetch();
  };
  const refreshDetail = () => {
    void detailQuery.refetch();
    refreshTickets();
  };
  const refreshInterventions = () => void interventionsQuery.refetch();

  const tabs: { key: TabKey; label: string; icon: typeof LifeBuoy; visible: boolean }[] = [
    { key: "tickets", label: "Demandes", icon: LifeBuoy, visible: canTickets },
    { key: "interventions", label: "Interventions", icon: Wrench, visible: canInterventions },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Support et exploitation"
        title="Demandes IT et interventions"
        description="Tickets, priorités, SLA, commentaires, temps passé et interventions liées au parc."
        actions={
          <>
            {tab === "tickets" ? (
              <>
                <Select
                  value={exportGranularity}
                  onChange={(event) => setExportGranularity(event.target.value)}
                  className="w-28"
                  aria-label="Granularité d'export"
                >
                  <option value="day">Jour</option>
                  <option value="week">Semaine</option>
                  <option value="month">Mois</option>
                  <option value="year">Année</option>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm">
                      <Download className="h-3.5 w-3.5" />
                      Exporter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() =>
                        window.open(
                          `/api/v1/exports/tickets?format=xlsx&granularity=${exportGranularity}`,
                          "_blank",
                        )
                      }
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Excel avec synthèse
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        window.open(
                          `/api/v1/exports/tickets?format=pdf&granularity=${exportGranularity}`,
                          "_blank",
                        )
                      }
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Rapport PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="secondary" size="sm" onClick={() => navigate("/statistiques")}>
                  <BarChart3 className="h-3.5 w-3.5" />
                  Statistiques
                </Button>
              </>
            ) : null}
            {tab === "tickets" && canCreateTicket ? (
              <Button size="sm" onClick={() => setTicketFormOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Nouvelle demande
              </Button>
            ) : null}
            {tab === "interventions" && canCreateIntervention ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingIntervention(null);
                  setInterventionFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle intervention
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border-soft bg-background-soft/50 p-1">
        {tabs
          .filter((item) => item.visible)
          .map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                setSearch("");
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === item.key
                  ? "bg-primary text-brand-cream"
                  : "text-muted hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          ))}
      </div>

      {tab === "tickets" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Demandes ouvertes</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(meta?.open_count ?? 0)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Non assignées</p>
              <p className="mt-1 text-2xl font-semibold text-warning">
                {formatNumber(meta?.unassigned_count ?? 0)}
              </p>
            </Card>
            {(meta?.status_counts ?? [])
              .filter((status) => ["new", "in_progress", "waiting_user"].includes(status.code))
              .slice(0, 2)
              .map((status) => (
                <Card key={status.code} className="p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-2">{status.name}</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">
                    {formatNumber(status.count)}
                  </p>
                </Card>
              ))}
          </div>

          <Card>
            <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher une demande…"
                  className="pl-8"
                  aria-label="Rechercher une demande"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
                <Select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="sm:w-48"
                  aria-label="Filtrer par statut"
                >
                  <option value="">Tous les statuts</option>
                  {(meta?.statuses ?? []).map((status) => (
                    <option key={status.id} value={status.code}>
                      {status.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                  className="sm:w-40"
                  aria-label="Filtrer par priorité"
                >
                  <option value="">Toutes priorités</option>
                  {(meta?.priorities ?? []).map((priority) => (
                    <option key={priority.id} value={priority.code}>
                      {priority.name}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted">
                  <Checkbox
                    checked={includeClosed}
                    onChange={(event) => setIncludeClosed(event.target.checked)}
                  />
                  Inclure les closes
                </label>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {ticketsQuery.isError ? (
                <ErrorState
                  message={ticketsQuery.error instanceof Error ? ticketsQuery.error.message : "Erreur inconnue."}
                  onRetry={() => void ticketsQuery.refetch()}
                />
              ) : ticketsQuery.isLoading ? (
                <div className="space-y-1 px-2 pb-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : tickets.length === 0 ? (
                <EmptyState
                  icon={LifeBuoy}
                  title="Aucune demande"
                  description="Créez une demande IT pour suivre son traitement, ses commentaires et son temps passé."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Demande</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Priorité</TableHead>
                      <TableHead className="hidden lg:table-cell">Catégorie</TableHead>
                      <TableHead className="hidden xl:table-cell">Assigné</TableHead>
                      <TableHead className="hidden lg:table-cell">Échéance</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{ticket.subject}</p>
                          <p className="font-mono text-[10px] text-muted-2">{ticket.reference}</p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            tone={
                              ticket.status.is_closed
                                ? "success"
                                : ticket.status.code === "in_progress"
                                  ? "info"
                                  : ticket.status.code.startsWith("waiting")
                                    ? "warning"
                                    : "neutral"
                            }
                          >
                            {ticket.status.name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge tone={priorityTones[ticket.priority.code] ?? "neutral"}>
                            {ticket.priority.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {ticket.category.name}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {ticket.assignee
                            ? fullName(ticket.assignee.first_name, ticket.assignee.last_name)
                            : "Non assigné"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {formatDateTime(ticket.due_at)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ouvrir ${ticket.reference}`}
                            onClick={() => setDetailId(ticket.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {ticketsQuery.data && ticketsQuery.data.pages > 1 ? (
              <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
                <span>
                  Page {ticketsQuery.data.page} sur {ticketsQuery.data.pages} ·{" "}
                  {ticketsQuery.data.total} demande(s)
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page >= ticketsQuery.data.pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      {tab === "interventions" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Interventions</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(interventionsQuery.data?.total ?? 0)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Planifiées</p>
              <p className="mt-1 text-2xl font-semibold text-info">
                {formatNumber(interventions.filter((item) => item.status === "planned").length)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Sur cette page</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(interventions.length)}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher une intervention…"
                  className="pl-8"
                  aria-label="Rechercher une intervention"
                />
              </div>
              <div className="flex flex-1 justify-end">
                <Select
                  value={interventionStatus}
                  onChange={(event) => setInterventionStatus(event.target.value)}
                  className="sm:w-44"
                  aria-label="Filtrer par statut"
                >
                  <option value="">Tous les statuts</option>
                  <option value="planned">Planifiées</option>
                  <option value="in_progress">En cours</option>
                  <option value="done">Terminées</option>
                  <option value="cancelled">Annulées</option>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {interventionsQuery.isError ? (
                <ErrorState
                  message={
                    interventionsQuery.error instanceof Error
                      ? interventionsQuery.error.message
                      : "Erreur inconnue."
                  }
                  onRetry={() => void interventionsQuery.refetch()}
                />
              ) : interventionsQuery.isLoading ? (
                <div className="space-y-1 px-2 pb-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : interventions.length === 0 ? (
                <EmptyState
                  icon={Wrench}
                  title="Aucune intervention"
                  description="Planifiez les interventions préventives et correctives, internes ou prestataires."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Intervention</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden lg:table-cell">Planifiée</TableHead>
                      <TableHead className="hidden xl:table-cell">Technicien</TableHead>
                      <TableHead className="hidden xl:table-cell">Coût</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interventions.map((intervention) => (
                      <TableRow key={intervention.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{intervention.title}</p>
                          <p className="font-mono text-[10px] text-muted-2">{intervention.reference}</p>
                          {intervention.ticket_reference ? (
                            <p className="text-[10px] text-muted">Demande {intervention.ticket_reference}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge tone={interventionStatusTones[intervention.status] ?? "neutral"}>
                            {interventionStatusLabels[intervention.status] ?? intervention.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {interventionTypeLabels[intervention.type] ?? intervention.type}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {formatDateTime(intervention.scheduled_at)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {intervention.technician
                            ? fullName(intervention.technician.first_name, intervention.technician.last_name)
                            : intervention.supplier_name ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {intervention.cost != null ? formatCurrency(intervention.cost) : "—"}
                        </TableCell>
                        <TableCell>
                          {canEditIntervention ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${intervention.reference}`}
                              onClick={() => {
                                setEditingIntervention(intervention);
                                setInterventionFormOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {interventionsQuery.data && interventionsQuery.data.pages > 1 ? (
              <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
                <span>
                  Page {interventionsQuery.data.page} sur {interventionsQuery.data.pages} ·{" "}
                  {interventionsQuery.data.total} intervention(s)
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={interventionPage <= 1}
                    onClick={() => setInterventionPage((value) => Math.max(1, value - 1))}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={interventionPage >= interventionsQuery.data.pages}
                    onClick={() => setInterventionPage((value) => value + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      <TicketFormDialog
        open={ticketFormOpen}
        onOpenChange={setTicketFormOpen}
        meta={meta}
        agents={agents}
        services={services}
        assets={assets}
        assignees={assignees}
        onSaved={refreshTickets}
      />

      <TicketDetailDialog
        open={Boolean(detailId)}
        onOpenChange={(open) => !open && setDetailId(null)}
        ticket={detailQuery.data ?? null}
        meta={meta}
        assignees={assignees}
        loading={detailQuery.isLoading}
        onChanged={refreshDetail}
      />

      <InterventionDialog
        open={interventionFormOpen}
        onOpenChange={setInterventionFormOpen}
        intervention={editingIntervention}
        tickets={pickerTickets}
        assets={assets}
        suppliers={suppliers}
        users={assignees}
        onSaved={refreshInterventions}
      />
    </div>
  );
}
