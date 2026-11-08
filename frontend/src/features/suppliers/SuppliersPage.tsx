import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Building2,
  KeyRound,
  Package,
  Pencil,
  Plus,
  Search,
  Truck,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { LicenseDialog } from "@/features/suppliers/LicenseDialog";
import { StockMovementDialog } from "@/features/suppliers/StockMovementDialog";
import { SupplierDialog } from "@/features/suppliers/SupplierDialog";
import { apiFetch, buildQuery } from "@/lib/api";
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import type {
  AssetCategoryItem,
  AssetItem,
  LicenseItem,
  Page,
  StockMovementItem,
  StockSummaryItem,
  SupplierItem,
} from "@/types/api";

type TabKey = "suppliers" | "licenses" | "stock";

const directionLabels: Record<string, string> = {
  in: "Entrée",
  out: "Sortie",
  adjustment: "Ajustement",
};

const directionTones: Record<string, "success" | "warning" | "info"> = {
  in: "success",
  out: "warning",
  adjustment: "info",
};

export function SuppliersPage() {
  const { hasPermission } = useAuth();
  const canSuppliers = hasPermission("suppliers.read");
  const canLicenses = hasPermission("licenses.read");
  const canStock = hasPermission("stock.read");
  const canManageSuppliers = hasPermission("suppliers.manage");
  const canManageLicenses = hasPermission("licenses.manage");
  const canManageStock = hasPermission("stock.manage");

  const defaultTab: TabKey = canSuppliers ? "suppliers" : "licenses";
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [stockPage, setStockPage] = useState(1);
  const [directionFilter, setDirectionFilter] = useState("");

  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [editingLicense, setEditingLicense] = useState<LicenseItem | null>(null);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);

  useEffect(() => {
    setStockPage(1);
  }, [deferredSearch, directionFilter]);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", deferredSearch],
    queryFn: () => apiFetch<SupplierItem[]>(`/suppliers${buildQuery({ q: deferredSearch })}`),
    enabled: canSuppliers && tab === "suppliers",
  });
  const licensesQuery = useQuery({
    queryKey: ["licenses", deferredSearch],
    queryFn: () => apiFetch<LicenseItem[]>(`/licenses${buildQuery({ q: deferredSearch })}`),
    enabled: canLicenses && tab === "licenses",
  });
  const movementsQuery = useQuery({
    queryKey: ["stock", "movements", stockPage, deferredSearch, directionFilter],
    queryFn: () =>
      apiFetch<Page<StockMovementItem>>(
        `/stock/movements${buildQuery({
          page: stockPage,
          page_size: 25,
          q: deferredSearch,
          direction: directionFilter,
        })}`,
      ),
    enabled: canStock && tab === "stock",
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ["stock", "summary"],
    queryFn: () => apiFetch<StockSummaryItem[]>("/stock/summary"),
    enabled: canStock && tab === "stock",
  });
  const categoriesQuery = useQuery({
    queryKey: ["referentials", "asset-categories"],
    queryFn: () => apiFetch<AssetCategoryItem[]>("/asset-categories"),
    staleTime: 60_000,
  });
  const assetsQuery = useQuery({
    queryKey: ["assets", "stock-picker"],
    queryFn: () => apiFetch<Page<AssetItem>>("/assets?page=1&page_size=100"),
    enabled: tab === "stock",
    staleTime: 30_000,
  });

  const suppliers = suppliersQuery.data ?? [];
  const licenses = licensesQuery.data ?? [];
  const movements = movementsQuery.data?.items ?? [];
  const summary = summaryQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const assets = assetsQuery.data?.items ?? [];

  const stockTotals = summary.reduce(
    (acc, item) => ({
      inStock: acc.inStock + item.in_stock,
      inService: acc.inService + item.in_service,
      maintenance: acc.maintenance + item.maintenance,
      broken: acc.broken + item.broken,
    }),
    { inStock: 0, inService: 0, maintenance: 0, broken: 0 },
  );

  const activeLicenses = licenses.filter((item) => item.is_active);
  const licenseCost = activeLicenses.reduce((sum, item) => sum + (item.annual_cost ?? 0), 0);
  const licenseSeats = activeLicenses.reduce((sum, item) => sum + (item.seats ?? 0), 0);
  const licenseSeatsUsed = activeLicenses.reduce((sum, item) => sum + (item.seats_used ?? 0), 0);

  const tabs: { key: TabKey; label: string; icon: typeof Building2; visible: boolean }[] = [
    { key: "suppliers", label: "Fournisseurs", icon: Truck, visible: canSuppliers },
    { key: "licenses", label: "Licences", icon: KeyRound, visible: canLicenses },
  ];

  const refreshSuppliers = () => void suppliersQuery.refetch();
  const refreshLicenses = () => void licensesQuery.refetch();
  const refreshStock = () => {
    void movementsQuery.refetch();
    void summaryQuery.refetch();
    void assetsQuery.refetch();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Achats et ressources"
        title="Fournisseurs, licences et stock"
        description="Référentiel des prestataires et suivi des licences logicielles, sièges et échéances."
        actions={
          <>
            {tab === "suppliers" && canManageSuppliers ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingSupplier(null);
                  setSupplierDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau fournisseur
              </Button>
            ) : null}
            {tab === "licenses" && canManageLicenses ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingLicense(null);
                  setLicenseDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle licence
              </Button>
            ) : null}
            {tab === "stock" && canManageStock ? (
              <Button size="sm" onClick={() => setStockDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Mouvement de stock
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

      {tab === "suppliers" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Fournisseurs actifs</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(suppliers.length)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Équipements rattachés</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(suppliers.reduce((sum, item) => sum + item.asset_count, 0))}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Licences rattachées</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(suppliers.reduce((sum, item) => sum + item.license_count, 0))}
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
                  placeholder="Rechercher un fournisseur…"
                  className="pl-8"
                  aria-label="Rechercher un fournisseur"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {suppliersQuery.isError ? (
                <ErrorState
                  message={suppliersQuery.error instanceof Error ? suppliersQuery.error.message : "Erreur inconnue."}
                  onRetry={() => void suppliersQuery.refetch()}
                />
              ) : suppliersQuery.isLoading ? (
                <div className="space-y-1 px-2 pb-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : suppliers.length === 0 ? (
                <EmptyState
                  icon={Truck}
                  title="Aucun fournisseur"
                  description="Créez un fournisseur pour rattacher équipements, licences et interventions."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden lg:table-cell">Contact</TableHead>
                      <TableHead className="hidden xl:table-cell">SIRET</TableHead>
                      <TableHead>Équipements</TableHead>
                      <TableHead>Licences</TableHead>
                      <TableHead className="w-10 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{supplier.name}</p>
                          <p className="text-[10px] text-muted-2">{supplier.email ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted">{supplier.type ?? "—"}</TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {supplier.contact_name ?? "—"}
                          {supplier.phone ? ` · ${supplier.phone}` : ""}
                        </TableCell>
                        <TableCell className="hidden font-mono text-[11px] text-muted xl:table-cell">
                          {supplier.siret ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted">{supplier.asset_count}</TableCell>
                        <TableCell className="text-xs text-muted">{supplier.license_count}</TableCell>
                        <TableCell className="text-right">
                          {canManageSuppliers ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${supplier.name}`}
                              onClick={() => {
                                setEditingSupplier(supplier);
                                setSupplierDialogOpen(true);
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
          </Card>
        </>
      ) : null}

      {tab === "licenses" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Licences actives</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(activeLicenses.length)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Sièges utilisés</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(licenseSeatsUsed)} <span className="text-sm text-muted">/ {formatNumber(licenseSeats)}</span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Coût annuel</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(licenseCost, 0)}</p>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher une licence…"
                  className="pl-8"
                  aria-label="Rechercher une licence"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {licensesQuery.isError ? (
                <ErrorState
                  message={licensesQuery.error instanceof Error ? licensesQuery.error.message : "Erreur inconnue."}
                  onRetry={() => void licensesQuery.refetch()}
                />
              ) : licensesQuery.isLoading ? (
                <div className="space-y-1 px-2 pb-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : licenses.length === 0 ? (
                <EmptyState
                  icon={KeyRound}
                  title="Aucune licence"
                  description="Ajoutez vos abonnements et licences pour suivre sièges, coûts et échéances."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Licence</TableHead>
                      <TableHead>Éditeur</TableHead>
                      <TableHead>Sièges</TableHead>
                      <TableHead className="hidden lg:table-cell">Échéance</TableHead>
                      <TableHead className="hidden xl:table-cell">Coût annuel</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="w-10 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {licenses.map((license) => (
                      <TableRow key={license.id}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">{license.name}</p>
                          <p className="text-[10px] text-muted-2">{license.license_type ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted">{license.vendor ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted">
                          {license.seats_used ?? 0} / {license.seats ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {formatDate(license.end_date)}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {license.annual_cost != null ? formatCurrency(license.annual_cost) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge tone={license.is_active ? "success" : "neutral"}>
                            {license.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canManageLicenses ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${license.name}`}
                              onClick={() => {
                                setEditingLicense(license);
                                setLicenseDialogOpen(true);
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
          </Card>
        </>
      ) : null}

      {tab === "stock" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">En stock</p>
              <p className="mt-1 text-2xl font-semibold text-success">{formatNumber(stockTotals.inStock)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">En service</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{formatNumber(stockTotals.inService)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Maintenance</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{formatNumber(stockTotals.maintenance)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">En panne</p>
              <p className="mt-1 text-2xl font-semibold text-danger">{formatNumber(stockTotals.broken)}</p>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un mouvement…"
                  className="pl-8"
                  aria-label="Rechercher un mouvement de stock"
                />
              </div>
              <div className="flex flex-1 justify-end">
                <Select
                  value={directionFilter}
                  onChange={(event) => setDirectionFilter(event.target.value)}
                  className="sm:w-44"
                  aria-label="Filtrer par sens"
                >
                  <option value="">Tous les sens</option>
                  <option value="in">Entrées</option>
                  <option value="out">Sorties</option>
                  <option value="adjustment">Ajustements</option>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {movementsQuery.isError ? (
                <ErrorState
                  message={movementsQuery.error instanceof Error ? movementsQuery.error.message : "Erreur inconnue."}
                  onRetry={() => void movementsQuery.refetch()}
                />
              ) : movementsQuery.isLoading ? (
                <div className="space-y-1 px-2 pb-4">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : movements.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title="Aucun mouvement"
                  description="Enregistrez les entrées et sorties de matériel pour tenir le stock à jour."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Sens</TableHead>
                      <TableHead>Matériel</TableHead>
                      <TableHead className="hidden lg:table-cell">Motif</TableHead>
                      <TableHead className="hidden xl:table-cell">Référence</TableHead>
                      <TableHead>Quantité</TableHead>
                      <TableHead className="hidden xl:table-cell">Par</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="text-xs text-muted">{formatDateTime(movement.moved_at)}</TableCell>
                        <TableCell>
                          <Badge tone={directionTones[movement.direction] ?? "neutral"}>
                            {directionLabels[movement.direction] ?? movement.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-foreground">
                          {movement.asset
                            ? `${movement.asset.asset_tag} — ${movement.asset.name}`
                            : movement.category?.name ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted lg:table-cell">
                          {movement.reason ?? "—"}
                        </TableCell>
                        <TableCell className="hidden font-mono text-[11px] text-muted xl:table-cell">
                          {movement.reference ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted">{movement.quantity}</TableCell>
                        <TableCell className="hidden text-xs text-muted xl:table-cell">
                          {movement.created_by_label ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {movementsQuery.data && movementsQuery.data.pages > 1 ? (
              <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
                <span>
                  Page {movementsQuery.data.page} sur {movementsQuery.data.pages} ·{" "}
                  {movementsQuery.data.total} mouvement(s)
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={stockPage <= 1}
                    onClick={() => setStockPage((value) => Math.max(1, value - 1))}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={stockPage >= movementsQuery.data.pages}
                    onClick={() => setStockPage((value) => value + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      <SupplierDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        supplier={editingSupplier}
        onSaved={refreshSuppliers}
      />
      <LicenseDialog
        open={licenseDialogOpen}
        onOpenChange={setLicenseDialogOpen}
        license={editingLicense}
        onSaved={refreshLicenses}
      />
      <StockMovementDialog
        open={stockDialogOpen}
        onOpenChange={setStockDialogOpen}
        categories={categories}
        assets={assets}
        onSaved={refreshStock}
      />
    </div>
  );
}
