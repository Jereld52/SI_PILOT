import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Pencil,
  Plus,
  Search,
  XCircle,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { ContractDialog } from "@/features/contracts/ContractDialog";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type {
  ContractCategoryItem,
  ContractItem,
  SupplierItem,
  TicketUserRef,
} from "@/types/api";

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  active: "Actif",
  expiring: "Échéance proche",
  expired: "Expiré",
  terminated: "Résilié",
};

const statusTones: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  active: "success",
  expiring: "warning",
  expired: "danger",
  terminated: "neutral",
};

const alertLabels: Record<string, string> = {
  critical: "≤ 30 jours",
  warning: "≤ 90 jours",
  notice: "≤ 180 jours",
  expired: "Dépassé",
};

export function ContractsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("contracts.create");
  const canEdit = hasPermission("contracts.update");
  const canTerminate = hasPermission("contracts.delete");
  const [searchParams] = useSearchParams();
  const params = useParams();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expiringOnly, setExpiringOnly] = useState(searchParams.get("expiring") === "90");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContractItem | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<ContractItem | null>(null);
  const [terminating, setTerminating] = useState(false);

  const contractsQuery = useQuery({
    queryKey: ["contracts", deferredSearch, statusFilter, categoryFilter, expiringOnly],
    queryFn: () =>
      apiFetch<ContractItem[]>(
        `/contracts${buildQuery({
          q: deferredSearch,
          status: statusFilter,
          category_id: categoryFilter,
          expiring: expiringOnly ? 90 : undefined,
        })}`,
      ),
  });
  const categoriesQuery = useQuery({
    queryKey: ["contracts", "meta"],
    queryFn: () => apiFetch<ContractCategoryItem[]>("/contracts/meta"),
    staleTime: 60_000,
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "contracts"],
    queryFn: () => apiFetch<SupplierItem[]>("/suppliers"),
    staleTime: 60_000,
  });
  const usersQuery = useQuery({
    queryKey: ["tickets", "assignees"],
    queryFn: () => apiFetch<TicketUserRef[]>("/tickets/assignees"),
    staleTime: 60_000,
  });
  const focusQuery = useQuery({
    queryKey: ["contracts", "focus", params.contractId],
    queryFn: () => apiFetch<ContractItem>(`/contracts/${params.contractId}`),
    enabled: Boolean(params.contractId),
  });

  useEffect(() => {
    if (focusQuery.data) {
      setEditing(focusQuery.data);
      setFormOpen(true);
    }
  }, [focusQuery.data]);

  const contracts = contractsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];
  const users = usersQuery.data ?? [];

  const activeContracts = contracts.filter((item) =>
    ["active", "expiring"].includes(item.status),
  );
  const expiringSoon = contracts.filter(
    (item) =>
      item.days_to_end != null &&
      item.days_to_end >= 0 &&
      item.days_to_end <= 90 &&
      ["active", "expiring"].includes(item.status),
  );
  const annualTotal = activeContracts.reduce(
    (sum, item) => sum + (item.annual_cost ?? 0),
    0,
  );

  const refresh = () => void contractsQuery.refetch();

  const terminate = async () => {
    if (!terminateTarget) return;
    setTerminating(true);
    try {
      await apiFetch(`/contracts/${terminateTarget.id}`, { method: "DELETE" });
      toast.success("Contrat résilié. L'historique est conservé.");
      setTerminateTarget(null);
      refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Résiliation impossible.");
    } finally {
      setTerminating(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Prestataires et engagements"
        title="Contrats"
        description="Contrats, abonnements et prestations : montants, préavis, échéances et reconduction."
        actions={
          canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nouveau contrat
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Contrats actifs</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(activeContracts.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Échéance ≤ 90 jours</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {formatNumber(expiringSoon.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Coût annuel actif</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatCurrency(annualTotal, 0)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une référence, un objet…"
              className="pl-8"
              aria-label="Rechercher un contrat"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="sm:w-44"
              aria-label="Filtrer par statut"
            >
              <option value="">Tous les statuts</option>
              {Object.entries(statusLabels).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="sm:w-52"
              aria-label="Filtrer par catégorie"
            >
              <option value="">Toutes les catégories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 text-xs text-muted">
              <Checkbox
                checked={expiringOnly}
                onChange={(event) => setExpiringOnly(event.target.checked)}
              />
              Échéance 90 j
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {contractsQuery.isError ? (
            <ErrorState
              message={
                contractsQuery.error instanceof Error
                  ? contractsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void contractsQuery.refetch()}
            />
          ) : contractsQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucun contrat"
              description="Ajoutez les contrats et abonnements pour anticiper les échéances et les reconductions."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contrat</TableHead>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="hidden lg:table-cell">Catégorie</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead className="hidden xl:table-cell">Coût annuel</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{contract.object}</p>
                      <p className="font-mono text-[10px] text-muted-2">{contract.reference}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted">{contract.supplier.name}</TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {contract.category?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <CalendarClock className="h-3 w-3" />
                          {formatDate(contract.end_date)}
                        </span>
                        {contract.alert_level ? (
                          <Badge
                            tone={
                              contract.alert_level === "critical" ||
                              contract.alert_level === "expired"
                                ? "danger"
                                : contract.alert_level === "warning"
                                  ? "warning"
                                  : "info"
                            }
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {alertLabels[contract.alert_level] ?? contract.alert_level}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {contract.annual_cost != null ? formatCurrency(contract.annual_cost) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[contract.status] ?? "neutral"}>
                        {statusLabels[contract.status] ?? contract.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifier ${contract.reference}`}
                            onClick={() => {
                              setEditing(contract);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canTerminate && contract.status !== "terminated" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Résilier ${contract.reference}`}
                            onClick={() => setTerminateTarget(contract)}
                          >
                            <XCircle className="h-3.5 w-3.5 text-danger" />
                          </Button>
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

      <ContractDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contract={editing}
        categories={categories}
        suppliers={suppliers}
        users={users}
        onSaved={refresh}
      />

      <ConfirmDialog
        open={Boolean(terminateTarget)}
        onOpenChange={(open) => !open && setTerminateTarget(null)}
        title="Résilier ce contrat ?"
        description={`« ${terminateTarget?.object ?? ""} » passera au statut « résilié ». Les données et l'historique sont conservés.`}
        confirmLabel="Résilier"
        tone="danger"
        loading={terminating}
        onConfirm={() => void terminate()}
      />
    </div>
  );
}
