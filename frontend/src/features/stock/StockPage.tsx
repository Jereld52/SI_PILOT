import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  History,
  Package,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { StockHistoryDialog } from "@/features/stock/StockHistoryDialog";
import { StockItemDialog } from "@/features/stock/StockItemDialog";
import { StockMovementDialog } from "@/features/stock/StockMovementDialog";
import { stockCategoryLabels, stockCategoryOptions } from "@/features/stock/labels";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type {
  AgentItem,
  LocationItem,
  Page,
  StockItemItem,
  StockOverview,
  SupplierItem,
} from "@/types/api";

export function StockPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("stock.manage");

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItemItem | null>(null);
  const [movementItem, setMovementItem] = useState<StockItemItem | null>(null);
  const [historyItemId, setHistoryItemId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<StockItemItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    setLowOnly(false);
  }, [categoryFilter]);

  const itemsQuery = useQuery({
    queryKey: ["stock", "items", deferredSearch, categoryFilter, lowOnly, includeArchived],
    queryFn: () =>
      apiFetch<StockItemItem[]>(
        `/stock/items${buildQuery({
          q: deferredSearch,
          category: categoryFilter,
          low_only: lowOnly,
          include_archived: includeArchived,
        })}`,
      ),
  });
  const overviewQuery = useQuery({
    queryKey: ["stock", "overview"],
    queryFn: () => apiFetch<StockOverview>("/stock/overview"),
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "stock"],
    queryFn: () => apiFetch<SupplierItem[]>("/suppliers"),
    staleTime: 60_000,
  });
  const locationsQuery = useQuery({
    queryKey: ["referentials", "locations"],
    queryFn: () => apiFetch<LocationItem[]>("/locations"),
    staleTime: 60_000,
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", "stock"],
    queryFn: () => apiFetch<Page<AgentItem>>("/agents?page=1&page_size=100&status=active"),
    staleTime: 60_000,
  });

  const items = itemsQuery.data ?? [];
  const overview = overviewQuery.data;
  const suppliers = suppliersQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const agents = agentsQuery.data?.items ?? [];

  const refresh = () => {
    void itemsQuery.refetch();
    void overviewQuery.refetch();
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiFetch(`/stock/items/${archiveTarget.id}`, { method: "DELETE" });
      toast.success("Article archivé. L'historique est conservé.");
      setArchiveTarget(null);
      refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Archivage impossible.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ressources matérielles"
        title="Stock IT"
        description="Claviers, souris, écrans, casques et consommables : quantités, seuils, mouvements et alertes."
        actions={
          canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditingItem(null);
                setItemDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nouvel article
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-l-2 border-l-primary/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Articles suivis</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(overview?.total_items ?? 0)}
          </p>
        </Card>
        <Card className="border-l-2 border-l-info/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Unités en stock</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(overview?.total_units ?? 0)}
          </p>
        </Card>
        <Card className="border-l-2 border-l-success/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Valeur estimée</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatCurrency(overview?.total_value ?? 0, 0)}
          </p>
        </Card>
        <Card className="border-l-2 border-l-warning/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Alertes de seuil</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {formatNumber(overview?.low_stock_count ?? 0)}
          </p>
          <p className="text-[10px] text-muted-2">
            {formatNumber(overview?.out_of_stock_count ?? 0)} article(s) épuisé(s)
          </p>
        </Card>
      </div>

      {overview && overview.low_stock_items.length > 0 ? (
        <Card className="border-warning/25 bg-warning/[0.045]">
          <CardHeader>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
              <div>
                <h2 className="text-sm font-semibold text-foreground">Réapprovisionnement à prévoir</h2>
                <p className="mt-1 text-xs text-muted">
                  Articles au niveau ou sous leur seuil d'alerte.
                </p>
              </div>
            </div>
            <Badge tone="warning">{overview.low_stock_items.length}</Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-3">
            {overview.low_stock_items.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => canManage && setMovementItem(item)}
                className={cn(
                  "rounded-md border border-warning/25 bg-background/40 px-2.5 py-1.5 text-left text-[11px] transition-colors",
                  canManage && "hover:border-warning/50",
                )}
              >
                <span className="block font-medium text-foreground">{item.name}</span>
                <span className="text-warning">
                  {formatNumber(item.quantity)} / seuil {formatNumber(item.min_quantity)}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un article, une référence…"
              className="pl-8"
              aria-label="Rechercher un article de stock"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="sm:w-48"
              aria-label="Filtrer par catégorie"
            >
              <option value="">Toutes les catégories</option>
              {stockCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] text-muted">
              <Checkbox
                checked={lowOnly}
                onChange={(event) => setLowOnly(event.target.checked)}
              />
              Sous le seuil
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[11px] text-muted">
              <Checkbox
                checked={includeArchived}
                onChange={(event) => setIncludeArchived(event.target.checked)}
              />
              Archives
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {itemsQuery.isError ? (
            <ErrorState
              message={itemsQuery.error instanceof Error ? itemsQuery.error.message : "Erreur inconnue."}
              onRetry={() => void itemsQuery.refetch()}
            />
          ) : itemsQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Aucun article en stock"
              description="Ajoutez les claviers, souris, écrans, casques et consommables à suivre."
              action={
                canManage ? (
                  <Button size="sm" onClick={() => setItemDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Créer un article
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Quantité</TableHead>
                  <TableHead className="hidden lg:table-cell">Seuil</TableHead>
                  <TableHead className="hidden xl:table-cell">Valeur</TableHead>
                  <TableHead className="hidden lg:table-cell">Fournisseur / emplacement</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} className={item.status === "archived" ? "opacity-60" : undefined}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{item.name}</p>
                      <p className="font-mono text-[10px] text-muted-2">
                        {item.reference}
                        {item.brand || item.model
                          ? ` · ${[item.brand, item.model].filter(Boolean).join(" ")}`
                          : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {stockCategoryLabels[item.category] ?? item.category}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            item.is_out ? "text-danger" : item.is_low ? "text-warning" : "text-foreground",
                          )}
                        >
                          {formatNumber(item.quantity)}
                        </span>
                        <span className="text-[10px] text-muted-2">{item.unit}</span>
                        {item.is_out ? (
                          <Badge tone="danger">Épuisé</Badge>
                        ) : item.is_low ? (
                          <Badge tone="warning">Seuil</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {formatNumber(item.min_quantity)}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {item.unit_price != null ? formatCurrency(item.stock_value, 0) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {item.supplier?.name ?? "—"}
                      {item.location?.name ? ` · ${item.location.name}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Actions pour ${item.name}`}
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {canManage ? (
                            <DropdownMenuItem onSelect={() => setMovementItem(item)}>
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                              Entrée / sortie
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onSelect={() => setHistoryItemId(item.id)}>
                            <History className="h-3.5 w-3.5" />
                            Historique
                          </DropdownMenuItem>
                          {canManage ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditingItem(item);
                                  setItemDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Modifier
                              </DropdownMenuItem>
                              {item.status !== "archived" ? (
                                <DropdownMenuItem
                                  className="text-danger focus:bg-danger/10 focus:text-danger"
                                  onSelect={() => setArchiveTarget(item)}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                  Archiver
                                </DropdownMenuItem>
                              ) : null}
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
      </Card>

      <StockItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        item={editingItem}
        suppliers={suppliers}
        locations={locations}
        onSaved={refresh}
      />
      <StockMovementDialog
        open={Boolean(movementItem)}
        onOpenChange={(open) => !open && setMovementItem(null)}
        item={movementItem}
        agents={agents}
        onSaved={refresh}
      />
      <StockHistoryDialog
        open={Boolean(historyItemId)}
        onOpenChange={(open) => !open && setHistoryItemId(null)}
        itemId={historyItemId}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archiver cet article ?"
        description={`« ${archiveTarget?.name ?? ""} » sera retiré du stock actif. Son historique de mouvements est conservé.`}
        confirmLabel="Archiver"
        tone="danger"
        loading={archiving}
        onConfirm={() => void archive()}
      />
    </div>
  );
}
