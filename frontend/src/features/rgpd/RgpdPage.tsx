import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ClipboardList,
  Database,
  Pencil,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { type ReactNode, useDeferredValue, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  DataBreachDialog,
  DataCollectionDialog,
  DpoRequestDialog,
  ProcessingActivityDialog,
  RightsRequestDialog,
} from "@/features/rgpd/RgpdDialogs";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import type {
  DataBreachItem,
  DataCollectionItem,
  DpoRequestItem,
  ProcessingActivityItem,
  RgpdOverview,
  RightsRequestItem,
} from "@/types/api";

type TabKey = "traitements" | "collectes" | "demandes" | "droits" | "violations";

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  active: "Actif",
  archived: "Archivé",
  deleted: "Supprimé",
  new: "Nouveau",
  in_progress: "En cours",
  answered: "Répondu",
  closed: "Clôturé",
  open: "Ouverte",
  contained: "Contenue",
};

const statusTones: Record<string, "success" | "info" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  active: "success",
  archived: "neutral",
  deleted: "neutral",
  new: "info",
  in_progress: "warning",
  answered: "success",
  closed: "neutral",
  open: "danger",
  contained: "warning",
};

const collectionTypeLabels: Record<string, string> = {
  form: "Formulaire",
  survey: "Enquête",
  contact_list: "Liste de contacts",
  registration: "Inscription",
  event: "Événement",
  ad_hoc: "Ad hoc",
};

const rightsTypeLabels: Record<string, string> = {
  access: "Accès",
  rectification: "Rectification",
  erasure: "Effacement",
  objection: "Opposition",
  portability: "Portabilité",
  limitation: "Limitation",
};

const severityTones: Record<string, "info" | "warning" | "danger"> = {
  low: "info",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

export function RgpdPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("rgpd.create");
  const canUpdate = hasPermission("rgpd.update");
  const canDelete = hasPermission("rgpd.delete");
  const canRequests = hasPermission("rgpd.requests");

  const [tab, setTab] = useState<TabKey>("traitements");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const [processingOpen, setProcessingOpen] = useState(false);
  const [editingProcessing, setEditingProcessing] = useState<ProcessingActivityItem | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<DataCollectionItem | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<DpoRequestItem | null>(null);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [editingRights, setEditingRights] = useState<RightsRequestItem | null>(null);
  const [breachOpen, setBreachOpen] = useState(false);
  const [editingBreach, setEditingBreach] = useState<DataBreachItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<{
    kind: "activity" | "collection";
    id: string;
    name: string;
  } | null>(null);
  const [archiving, setArchiving] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["rgpd", "overview"],
    queryFn: () => apiFetch<RgpdOverview>("/rgpd/overview"),
  });
  const processingQuery = useQuery({
    queryKey: ["rgpd", "processing", deferredSearch],
    queryFn: () =>
      apiFetch<ProcessingActivityItem[]>(
        `/rgpd/processing-activities${buildQuery({ q: deferredSearch })}`,
      ),
  });
  const collectionsQuery = useQuery({
    queryKey: ["rgpd", "collections", deferredSearch],
    queryFn: () =>
      apiFetch<DataCollectionItem[]>(`/rgpd/collections${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "collectes",
  });
  const requestsQuery = useQuery({
    queryKey: ["rgpd", "requests", deferredSearch],
    queryFn: () => apiFetch<DpoRequestItem[]>(`/rgpd/requests${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "demandes",
  });
  const rightsQuery = useQuery({
    queryKey: ["rgpd", "rights", deferredSearch],
    queryFn: () =>
      apiFetch<RightsRequestItem[]>(`/rgpd/rights-requests${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "droits",
  });
  const breachesQuery = useQuery({
    queryKey: ["rgpd", "breaches", deferredSearch],
    queryFn: () => apiFetch<DataBreachItem[]>(`/rgpd/breaches${buildQuery({ q: deferredSearch })}`),
    enabled: tab === "violations",
  });

  const overview = overviewQuery.data;
  const activities = processingQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];
  const requests = requestsQuery.data ?? [];
  const rights = rightsQuery.data ?? [];
  const breaches = breachesQuery.data ?? [];

  const refreshProcessing = () => {
    void processingQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshCollections = () => {
    void collectionsQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshRequests = () => {
    void requestsQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshRights = () => {
    void rightsQuery.refetch();
    void overviewQuery.refetch();
  };
  const refreshBreaches = () => {
    void breachesQuery.refetch();
    void overviewQuery.refetch();
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const path =
        archiveTarget.kind === "activity"
          ? `/rgpd/processing-activities/${archiveTarget.id}`
          : `/rgpd/collections/${archiveTarget.id}`;
      await apiFetch(path, { method: "DELETE" });
      toast.success("Élément archivé. L'historique est conservé.");
      setArchiveTarget(null);
      if (archiveTarget.kind === "activity") refreshProcessing();
      else refreshCollections();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Archivage impossible.");
    } finally {
      setArchiving(false);
    }
  };

  const tabs: { key: TabKey; label: string; icon: typeof Scale; count?: number }[] = [
    { key: "traitements", label: "Traitements", icon: ClipboardList, count: activities.length },
    { key: "collectes", label: "Collectes", icon: Database, count: overview?.collections_total },
    { key: "demandes", label: "Demandes DPO", icon: UserCheck, count: overview?.open_requests },
    { key: "droits", label: "Droits", icon: Scale, count: overview?.open_rights },
    { key: "violations", label: "Violations", icon: ShieldAlert, count: overview?.open_breaches },
  ];

  const renderTableState = (
    query: { isError: boolean; isLoading: boolean; error: Error | null; refetch: () => void },
    emptyIcon: typeof Scale,
    emptyTitle: string,
    emptyDescription: string,
    children: ReactNode,
    count: number,
  ) => {
    if (query.isError) {
      return (
        <ErrorState
          message={query.error instanceof Error ? query.error.message : "Erreur inconnue."}
          onRetry={() => void query.refetch()}
        />
      );
    }
    if (query.isLoading) {
      return (
        <div className="space-y-1 px-2 pb-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      );
    }
    if (count === 0) {
      return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
    }
    return children;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Conformité"
        title="RGPD et protection des données"
        description="Registre des traitements, collectes, demandes DPO, droits des personnes et violations."
        actions={
          <>
            {tab === "traitements" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingProcessing(null);
                  setProcessingOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau traitement
              </Button>
            ) : null}
            {tab === "collectes" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingCollection(null);
                  setCollectionOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle collecte
              </Button>
            ) : null}
            {tab === "demandes" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingRequest(null);
                  setRequestOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle demande
              </Button>
            ) : null}
            {tab === "droits" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingRights(null);
                  setRightsOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle demande
              </Button>
            ) : null}
            {tab === "violations" && canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingBreach(null);
                  setBreachOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Déclarer
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Traitements actifs</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(overview?.processing_active ?? 0)}{" "}
            <span className="text-sm text-muted">/ {formatNumber(overview?.processing_total ?? 0)}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Demandes DPO ouvertes</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {formatNumber(overview?.open_requests ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Revues à venir (30 j)</p>
          <p className="mt-1 text-2xl font-semibold text-info">{formatNumber(overview?.reviews_due ?? 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Violations ouvertes</p>
          <p className="mt-1 text-2xl font-semibold text-danger">
            {formatNumber(overview?.open_breaches ?? 0)}
          </p>
        </Card>
      </div>

      {overview && overview.deadlines.length > 0 ? (
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold text-foreground">Échéances proches</p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {overview.deadlines.slice(0, 5).map((deadline) => (
              <div
                key={`${deadline.kind}-${deadline.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-soft px-3 py-1.5 text-[11px]"
              >
                <span className="text-muted">{deadline.label}</span>
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <AlertTriangle className="h-3 w-3 text-warning" />
                  {formatDate(deadline.due_date)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1 rounded-lg border border-border-soft bg-background-soft/50 p-1">
        {tabs.map((item) => (
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
            {item.count != null ? (
              <span className="rounded-full bg-black/20 px-1.5 text-[10px]">{item.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher…"
              className="pl-8"
              aria-label="Rechercher dans le registre RGPD"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {tab === "traitements"
            ? renderTableState(
                processingQuery,
                ClipboardList,
                "Aucun traitement",
                "Documentez les activités de traitement et leurs durées de conservation.",
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Traitement</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">Base légale</TableHead>
                      <TableHead className="hidden xl:table-cell">Conservation</TableHead>
                      <TableHead className="hidden lg:table-cell">Prochaine revue</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{activity.name}</p>
                          <p className="font-mono text-[10px] text-muted-2">{activity.reference}</p>
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTones[activity.status] ?? "neutral"}>
                            {statusLabels[activity.status] ?? activity.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {activity.legal_basis ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {activity.retention_period ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {formatDate(activity.next_review_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canUpdate ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Modifier ${activity.name}`}
                                onClick={() => {
                                  setEditingProcessing(activity);
                                  setProcessingOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Archiver ${activity.name}`}
                                onClick={() =>
                                  setArchiveTarget({
                                    kind: "activity",
                                    id: activity.id,
                                    name: activity.name,
                                  })
                                }
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>,
                activities.length,
              )
            : null}

          {tab === "collectes"
            ? renderTableState(
                collectionsQuery,
                Database,
                "Aucune collecte",
                "Recensez les formulaires, enquêtes et listes de contacts avec leur durée de conservation.",
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Collecte</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">Traitement</TableHead>
                      <TableHead className="hidden xl:table-cell">Fin de conservation</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collections.map((collection) => (
                      <TableRow key={collection.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{collection.name}</p>
                          <p className="text-[10px] text-muted-2">
                            {collection.subjects_count != null
                              ? `${collection.subjects_count} personne(s)`
                              : "—"}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {collectionTypeLabels[collection.collection_type] ?? collection.collection_type}
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTones[collection.status] ?? "neutral"}>
                            {statusLabels[collection.status] ?? collection.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {collection.processing_activity?.name ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {formatDate(collection.retention_end)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canUpdate ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Modifier ${collection.name}`}
                                onClick={() => {
                                  setEditingCollection(collection);
                                  setCollectionOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Archiver ${collection.name}`}
                                onClick={() =>
                                  setArchiveTarget({
                                    kind: "collection",
                                    id: collection.id,
                                    name: collection.name,
                                  })
                                }
                              >
                                <Archive className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>,
                collections.length,
              )
            : null}

          {tab === "demandes"
            ? renderTableState(
                requestsQuery,
                UserCheck,
                "Aucune demande DPO",
                "Centralisez les sollicitations et suivez les réponses apportées.",
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Demande</TableHead>
                      <TableHead>Demandeur</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">Échéance</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{request.subject}</p>
                          <p className="font-mono text-[10px] text-muted-2">{request.reference}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {request.requester_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTones[request.status] ?? "neutral"}>
                            {statusLabels[request.status] ?? request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {formatDate(request.due_date)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canRequests ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Traiter ${request.reference}`}
                              onClick={() => {
                                setEditingRequest(request);
                                setRequestOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>,
                requests.length,
              )
            : null}

          {tab === "droits"
            ? renderTableState(
                rightsQuery,
                Scale,
                "Aucune demande de droits",
                "Suivez les demandes d'accès, de rectification ou d'effacement et leur échéance.",
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Demande</TableHead>
                      <TableHead>Droit</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">Traitement</TableHead>
                      <TableHead className="hidden lg:table-cell">Échéance</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rights.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">
                            {request.requester_name ?? "Demandeur non précisé"}
                          </p>
                          <p className="font-mono text-[10px] text-muted-2">{request.reference}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {rightsTypeLabels[request.request_type] ?? request.request_type}
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTones[request.status] ?? "neutral"}>
                            {statusLabels[request.status] ?? request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {request.processing_activity?.name ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {formatDate(request.due_date)}
                        </TableCell>
                        <TableCell className="text-right">
                          {canRequests ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Traiter ${request.reference}`}
                              onClick={() => {
                                setEditingRights(request);
                                setRightsOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>,
                rights.length,
              )
            : null}

          {tab === "violations"
            ? renderTableState(
                breachesQuery,
                ShieldAlert,
                "Aucune violation",
                "Déclarez et suivez les violations de données personnelles.",
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Violation</TableHead>
                      <TableHead>Gravité</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="hidden lg:table-cell">Découverte</TableHead>
                      <TableHead className="hidden xl:table-cell">Personnes</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breaches.map((breach) => (
                      <TableRow key={breach.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">
                            {breach.description?.slice(0, 80) ?? breach.reference}
                          </p>
                          <p className="font-mono text-[10px] text-muted-2">{breach.reference}</p>
                        </TableCell>
                        <TableCell>
                          <Badge tone={severityTones[breach.severity] ?? "neutral"}>
                            {breach.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge tone={statusTones[breach.status] ?? "neutral"}>
                            {statusLabels[breach.status] ?? breach.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {formatDateTime(breach.discovered_at)}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {breach.affected_count ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {canRequests ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Mettre à jour ${breach.reference}`}
                              onClick={() => {
                                setEditingBreach(breach);
                                setBreachOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>,
                breaches.length,
              )
            : null}
        </CardContent>
      </Card>

      <ProcessingActivityDialog
        open={processingOpen}
        onOpenChange={setProcessingOpen}
        activity={editingProcessing}
        onSaved={refreshProcessing}
      />
      <DataCollectionDialog
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        collection={editingCollection}
        activities={activities}
        onSaved={refreshCollections}
      />
      <DpoRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        requestItem={editingRequest}
        onSaved={refreshRequests}
      />
      <RightsRequestDialog
        open={rightsOpen}
        onOpenChange={setRightsOpen}
        rights={editingRights}
        activities={activities}
        onSaved={refreshRights}
      />
      <DataBreachDialog
        open={breachOpen}
        onOpenChange={setBreachOpen}
        breach={editingBreach}
        onSaved={refreshBreaches}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archiver cet élément ?"
        description={`« ${archiveTarget?.name ?? ""} » sera conservé en historique mais retiré des listes actives.`}
        confirmLabel="Archiver"
        tone="danger"
        loading={archiving}
        onConfirm={() => void archive()}
      />
    </div>
  );
}
