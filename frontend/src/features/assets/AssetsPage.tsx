import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowRightLeft,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  QrCode,
  Search,
  Upload,
  Wrench,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AssetDetailDialog } from "@/features/assets/AssetDetailDialog";
import { AssetFormDialog } from "@/features/assets/AssetFormDialog";
import { AssetQrDialog } from "@/features/assets/AssetQrDialog";
import {
  assetConditionLabels,
  assetConditionTones,
  assetStatusLabels,
  assetStatusTones,
} from "@/features/assets/labels";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { formatDateTime, fullName } from "@/lib/utils";
import type {
  AgentItem,
  AssetAssignmentItem,
  AssetCategoryItem,
  AssetDetailItem,
  AssetItem,
  LocationItem,
  Page,
  ServiceItem,
} from "@/types/api";

const statusOptions = Object.entries(assetStatusLabels);

export function AssetsPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [page, setPage] = useState(1);

  const [searchParams, setSearchParams] = useSearchParams();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AssetItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AssetItem | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssetItem | null>(null);
  const [returnTarget, setReturnTarget] = useState<AssetItem | null>(null);
  const [statusTarget, setStatusTarget] = useState<AssetItem | null>(null);
  const [historyTarget, setHistoryTarget] = useState<AssetItem | null>(null);
  const [detailTarget, setDetailTarget] = useState<AssetItem | null>(null);
  const [qrTarget, setQrTarget] = useState<AssetItem | null>(null);

  const [assignAgentId, setAssignAgentId] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [newStatus, setNewStatus] = useState("in_service");
  const [statusReason, setStatusReason] = useState("");

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, categoryFilter, statusFilter, serviceFilter]);

  const categoriesQuery = useQuery({
    queryKey: ["referentials", "asset-categories"],
    queryFn: () => apiFetch<AssetCategoryItem[]>("/asset-categories"),
    staleTime: 60_000,
  });
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
    queryKey: ["agents", "all-for-assets"],
    queryFn: () => apiFetch<Page<AgentItem>>("/agents?page=1&page_size=100&status=active"),
    staleTime: 60_000,
  });
  const assetsQuery = useQuery({
    queryKey: ["assets", { page, q: deferredSearch, categoryFilter, statusFilter, serviceFilter }],
    queryFn: () =>
      apiFetch<Page<AssetItem>>(
        `/assets${buildQuery({
          page,
          page_size: 20,
          q: deferredSearch,
          category_id: categoryFilter,
          status: statusFilter,
          service_id: serviceFilter,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });
  const historyQuery = useQuery({
    queryKey: ["assets", "history", historyTarget?.id],
    queryFn: () => apiFetch<AssetAssignmentItem[]>(`/assets/${historyTarget?.id}/history`),
    enabled: Boolean(historyTarget),
  });
  const detailQuery = useQuery({
    queryKey: ["assets", "detail", detailTarget?.id],
    queryFn: () => apiFetch<AssetDetailItem>(`/assets/${detailTarget?.id}`),
    enabled: Boolean(detailTarget),
  });

  useEffect(() => {
    const token = searchParams.get("qr");
    if (!token) return;
    let cancelled = false;
    apiFetch<AssetDetailItem>(`/assets/by-qr/${token}`)
      .then((asset) => {
        if (!cancelled) setDetailTarget(asset);
      })
      .catch(() => {
        if (!cancelled) toast.error("QR code inconnu ou expiré.");
      })
      .finally(() => {
        if (!cancelled) setSearchParams({}, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const invalidate = () => void assetsQuery.refetch();

  const archiveMutation = useMutation({
    mutationFn: (asset: AssetItem) => apiFetch(`/assets/${asset.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Équipement archivé. L'historique est conservé.");
      setArchiveTarget(null);
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Archivage impossible."),
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/assets/${assignTarget?.id}/assign`, {
        method: "POST",
        body: JSON.stringify({ agent_id: assignAgentId, reason: assignReason || null }),
      }),
    onSuccess: () => {
      toast.success("Équipement affecté. L'historique a été mis à jour.");
      setAssignTarget(null);
      setAssignAgentId("");
      setAssignReason("");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Affectation impossible."),
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/assets/${returnTarget?.id}/return`, {
        method: "POST",
        body: JSON.stringify({ reason: returnReason || null }),
      }),
    onSuccess: () => {
      toast.success("Équipement retourné au stock.");
      setReturnTarget(null);
      setReturnReason("");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Retour impossible."),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/assets/${statusTarget?.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus, reason: statusReason || null }),
      }),
    onSuccess: () => {
      toast.success("État de l'équipement mis à jour.");
      setStatusTarget(null);
      setStatusReason("");
      invalidate();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Modification impossible."),
  });

  const categories = categoriesQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const assets = assetsQuery.data?.items ?? [];
  const canCreate = hasPermission("assets.create");
  const canEdit = hasPermission("assets.update");
  const canArchive = hasPermission("assets.delete");
  const canAssign = hasPermission("assets.assign");
  const canImport = hasPermission("imports.preview");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventaire"
        title="Parc informatique"
        description="Équipements, affectations, garanties, états et historique des mouvements."
        actions={
          <>
            {hasPermission("exports.run") ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Exporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => window.open("/api/v1/exports/assets?format=xlsx", "_blank")}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel (XLSX)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => window.open("/api/v1/exports/assets?format=pdf", "_blank")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
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
                Nouvel équipement
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
              placeholder="Nom, inventaire, série, machine…"
              className="pl-8"
              aria-label="Rechercher un équipement"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="Filtrer par catégorie"
              className="sm:w-44"
            >
              <option value="">Toutes catégories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtrer par état"
              className="sm:w-40"
            >
              <option value="">Tous les états</option>
              {statusOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={serviceFilter}
              onChange={(event) => setServiceFilter(event.target.value)}
              aria-label="Filtrer par service"
              className="sm:w-48"
            >
              <option value="">Tous les services</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.code} — {service.name}
                </option>
              ))}
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0 pt-3">
          {assetsQuery.isError ? (
            <ErrorState
              message={assetsQuery.error instanceof Error ? assetsQuery.error.message : "Erreur inconnue."}
              onRetry={() => void assetsQuery.refetch()}
            />
          ) : assetsQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="Aucun équipement"
              description="Créez un équipement ou importez votre inventaire CSV."
              action={
                canCreate ? (
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Créer un équipement
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Équipement</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="hidden lg:table-cell">Système</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead className="hidden lg:table-cell">Affectation</TableHead>
                  <TableHead className="hidden 2xl:table-cell">WAPT</TableHead>
                  <TableHead className="hidden xl:table-cell">Service / site</TableHead>
                  <TableHead className="w-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{asset.name}</p>
                      <p className="font-mono text-[10px] text-muted-2">{asset.asset_tag}</p>
                      {asset.brand || asset.model ? (
                        <p className="mt-0.5 text-[10px] text-muted">
                          {[asset.brand, asset.model].filter(Boolean).join(" ")}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted">{asset.category.name}</TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      <p>{asset.os_name ?? "—"}</p>
                      <p className="text-[10px] text-muted-2">{asset.ip_address ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge tone={assetStatusTones[asset.status] ?? "neutral"}>
                          {assetStatusLabels[asset.status] ?? asset.status}
                        </Badge>
                        <Badge tone={assetConditionTones[asset.condition] ?? "neutral"}>
                          {assetConditionLabels[asset.condition] ?? asset.condition}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {asset.assigned_agent
                        ? fullName(asset.assigned_agent.first_name, asset.assigned_agent.last_name)
                        : "Non affecté"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted 2xl:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={
                            asset.wapt_reachable === "OK"
                              ? "h-1.5 w-1.5 rounded-full bg-success"
                              : "h-1.5 w-1.5 rounded-full bg-warning"
                          }
                        />
                        <span>{asset.wapt_status ?? "—"}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-2">
                        {asset.wapt_last_user ?? "—"}
                      </p>
                      <p className="text-[10px] text-muted-2">
                        {asset.wapt_last_seen ? formatDateTime(asset.wapt_last_seen) : "—"}
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {asset.service?.name ?? "—"}
                      {asset.location?.name ? ` · ${asset.location.name}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions pour ${asset.asset_tag}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onSelect={() => setDetailTarget(asset)}>
                            <Eye className="h-3.5 w-3.5" />
                            Voir la fiche complète
                          </DropdownMenuItem>
                          {hasPermission("assets.qr") ? (
                            <DropdownMenuItem onSelect={() => setQrTarget(asset)}>
                              <QrCode className="h-3.5 w-3.5" />
                              QR code
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuSeparator />
                          {canEdit ? (
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(asset);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Modifier
                            </DropdownMenuItem>
                          ) : null}
                          {canAssign ? (
                            <DropdownMenuItem
                              onSelect={() => {
                                setAssignTarget(asset);
                                setAssignAgentId(asset.assigned_agent_id ?? "");
                              }}
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                              Affecter
                            </DropdownMenuItem>
                          ) : null}
                          {canAssign && asset.assigned_agent_id ? (
                            <DropdownMenuItem onSelect={() => setReturnTarget(asset)}>
                              <Archive className="h-3.5 w-3.5" />
                              Retour au stock
                            </DropdownMenuItem>
                          ) : null}
                          {canEdit ? (
                            <DropdownMenuItem
                              onSelect={() => {
                                setStatusTarget(asset);
                                setNewStatus(asset.status);
                              }}
                            >
                              <Wrench className="h-3.5 w-3.5" />
                              Changer l'état
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onSelect={() => setHistoryTarget(asset)}>
                            <Clock className="h-3.5 w-3.5" />
                            Historique
                          </DropdownMenuItem>
                          {canArchive ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-danger focus:bg-danger/10 focus:text-danger"
                                onSelect={() => setArchiveTarget(asset)}
                              >
                                <Archive className="h-3.5 w-3.5" />
                                Archiver
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

        {assetsQuery.data && assetsQuery.data.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
            <span>
              Page {assetsQuery.data.page} sur {assetsQuery.data.pages} · {assetsQuery.data.total} équipement(s)
            </span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Précédent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= assetsQuery.data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <AssetFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        asset={editing}
        categories={categories}
        agents={agents}
        services={services}
        locations={locations}
        onSaved={invalidate}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType="assets"
        entityLabel="équipements"
        onImported={invalidate}
      />

      <AssetDetailDialog
        open={Boolean(detailTarget)}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        asset={detailQuery.data ?? null}
      />

      <AssetQrDialog
        open={Boolean(qrTarget)}
        onOpenChange={(open) => !open && setQrTarget(null)}
        asset={qrTarget}
        onRegenerated={invalidate}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archiver cet équipement ?"
        description="L'équipement sera réformé et masqué de l'inventaire actif. Son historique et ses tickets sont conservés."
        confirmLabel="Archiver"
        tone="danger"
        loading={archiveMutation.isPending}
        onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)}
      />

      <Dialog open={Boolean(assignTarget)} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Affecter l'équipement</DialogTitle>
            <DialogDescription>
              {assignTarget ? `${assignTarget.name} — ${assignTarget.asset_tag}` : ""}
              <br />
              Une nouvelle ligne d'historique sera créée. L'affectation précédente sera clôturée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="assign-agent">
                Agent
              </label>
              <Select id="assign-agent" value={assignAgentId} onChange={(event) => setAssignAgentId(event.target.value)}>
                <option value="">Sélectionner un agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.first_name} {agent.last_name} — {agent.email_pro}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="assign-reason">
                Motif (optionnel)
              </label>
              <Input id="assign-reason" value={assignReason} onChange={(event) => setAssignReason(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTarget(null)}>Annuler</Button>
            <Button
              disabled={!assignAgentId}
              loading={assignMutation.isPending}
              onClick={() => assignMutation.mutate()}
            >
              Affecter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(returnTarget)} onOpenChange={(open) => !open && setReturnTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retour au stock</DialogTitle>
            <DialogDescription>
              {returnTarget ? `${returnTarget.name} — ${returnTarget.asset_tag}` : ""}
              <br />
              L'agent affecté sera retiré. L'équipement passera au statut « en stock ».
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="return-reason">
              Motif (optionnel)
            </label>
            <Textarea id="return-reason" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturnTarget(null)}>Annuler</Button>
            <Button variant="danger" loading={returnMutation.isPending} onClick={() => returnMutation.mutate()}>
              Confirmer le retour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(statusTarget)} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer l'état</DialogTitle>
            <DialogDescription>
              {statusTarget ? `${statusTarget.name} — ${statusTarget.asset_tag}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="status-select">
                Nouvel état
              </label>
              <Select id="status-select" value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                {statusOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="status-reason">
                Motif (optionnel)
              </label>
              <Input id="status-reason" value={statusReason} onChange={(event) => setStatusReason(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusTarget(null)}>Annuler</Button>
            <Button loading={statusMutation.isPending} onClick={() => statusMutation.mutate()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyTarget)} onOpenChange={(open) => !open && setHistoryTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Historique des affectations</DialogTitle>
            <DialogDescription>
              {historyTarget ? `${historyTarget.name} — ${historyTarget.asset_tag}` : ""}
            </DialogDescription>
          </DialogHeader>
          {historyQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : historyQuery.isError ? (
            <ErrorState
              message={historyQuery.error instanceof Error ? historyQuery.error.message : "Erreur inconnue."}
              onRetry={() => void historyQuery.refetch()}
            />
          ) : historyQuery.data && historyQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Motif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQuery.data.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{item.agent_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{item.service_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{item.location_name ?? "—"}</TableCell>
                    <TableCell className="text-[11px] text-muted">{formatDateTime(item.started_at)}</TableCell>
                    <TableCell className="text-[11px] text-muted">
                      {item.ended_at ? formatDateTime(item.ended_at) : "En cours"}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted">{item.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={Clock} title="Aucune affectation" description="Aucun mouvement enregistré." />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryTarget(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
