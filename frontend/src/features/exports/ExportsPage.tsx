import { useQuery } from "@tanstack/react-query";
import {
  Columns3,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import type {
  CustomExportDataset,
  LocationItem,
  TicketMeta,
} from "@/types/api";

const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  assets: [
    { value: "in_service", label: "En service" },
    { value: "in_stock", label: "En stock" },
    { value: "maintenance", label: "Maintenance" },
    { value: "broken", label: "En panne" },
    { value: "to_renew", label: "À renouveler" },
    { value: "retired", label: "Retiré" },
  ],
  infrastructure: [
    { value: "active", label: "Actif" },
    { value: "maintenance", label: "Maintenance" },
    { value: "offline", label: "Hors ligne" },
    { value: "retired", label: "Retiré" },
  ],
  stock: [
    { value: "active", label: "Actif" },
    { value: "archived", label: "Archivé" },
  ],
  suppliers: [
    { value: "active", label: "Actif" },
    { value: "inactive", label: "Inactif" },
  ],
  licenses: [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ],
  contracts: [
    { value: "draft", label: "Brouillon" },
    { value: "active", label: "Actif" },
    { value: "expiring", label: "À échéance" },
    { value: "expired", label: "Expiré" },
    { value: "terminated", label: "Résilié" },
  ],
  projects: [
    { value: "idea", label: "Idée" },
    { value: "planned", label: "Planifié" },
    { value: "in_progress", label: "En cours" },
    { value: "on_hold", label: "En pause" },
    { value: "done", label: "Terminé" },
    { value: "cancelled", label: "Annulé" },
  ],
  security_incidents: [
    { value: "open", label: "Ouvert" },
    { value: "investigating", label: "En investigation" },
    { value: "contained", label: "Contenu" },
    { value: "closed", label: "Clôturé" },
  ],
  rgpd_processing: [
    { value: "draft", label: "Brouillon" },
    { value: "active", label: "Actif" },
    { value: "archived", label: "Archivé" },
  ],
};

const TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  infrastructure: [
    { value: "server", label: "Serveur" },
    { value: "vm", label: "Machine virtuelle" },
    { value: "switch", label: "Switch" },
    { value: "router", label: "Routeur" },
    { value: "firewall", label: "Pare-feu" },
    { value: "nas", label: "NAS" },
    { value: "access_point", label: "Point d'accès" },
    { value: "ups", label: "Onduleur" },
    { value: "other", label: "Autre" },
  ],
  stock: [
    { value: "keyboard", label: "Claviers" },
    { value: "mouse", label: "Souris" },
    { value: "monitor", label: "Écrans" },
    { value: "headset", label: "Casques" },
    { value: "dock", label: "Stations d'accueil" },
    { value: "webcam", label: "Webcams" },
    { value: "cable", label: "Câbles" },
    { value: "adapter", label: "Adaptateurs" },
    { value: "toner", label: "Toners" },
    { value: "paper", label: "Papier" },
    { value: "battery", label: "Batteries" },
    { value: "consumable", label: "Consommables" },
    { value: "other", label: "Autres" },
  ],
};

const LOCATION_DATASETS = new Set(["assets", "infrastructure", "stock"]);

const quickExports = [
  {
    key: "assets",
    label: "Parc informatique",
    description: "Inventaire complet, WAPT et affectations.",
    base: "/api/v1/exports/assets",
  },
  {
    key: "mobile",
    label: "Lignes mobiles",
    description: "Titulaires, forfaits et terminaux, sans PIN/PUK.",
    base: "/api/v1/exports/mobile-lines",
  },
  {
    key: "infrastructure",
    label: "Infrastructure",
    description: "Équipements, dépendances et supervision.",
    base: "/api/v1/exports/infrastructure",
  },
  {
    key: "rgpd",
    label: "Registre RGPD",
    description: "Traitements, collectes, droits et violations.",
    base: "/api/v1/exports/rgpd",
  },
  {
    key: "tickets",
    label: "Tickets et statistiques",
    description: "Synthèse et détail par période.",
    base: "/api/v1/exports/tickets",
  },
];

export function ExportsPage() {
  const { hasPermission } = useAuth();

  const catalogQuery = useQuery({
    queryKey: ["exports", "custom", "catalog"],
    queryFn: () => apiFetch<CustomExportDataset[]>("/exports/custom/catalog"),
  });
  const locationsQuery = useQuery({
    queryKey: ["referentials", "locations", "exports"],
    queryFn: () => apiFetch<LocationItem[]>("/locations"),
    staleTime: 60_000,
  });

  const initialDataset = new URLSearchParams(window.location.search).get("dataset") ?? "";
  const [datasetKey, setDatasetKey] = useState(initialDataset);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [columnSearch, setColumnSearch] = useState("");
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationId, setLocationId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const datasets = catalogQuery.data ?? [];
  const dataset = datasets.find((item) => item.key === datasetKey) ?? null;

  const ticketMetaQuery = useQuery({
    queryKey: ["tickets", "meta", "exports"],
    queryFn: () => apiFetch<TicketMeta>("/tickets/meta"),
    enabled: datasetKey === "tickets",
    staleTime: 60_000,
  });

  useEffect(() => {
    if (datasets.length === 0) return;
    if (!datasets.some((item) => item.key === datasetKey)) {
      setDatasetKey(datasets[0].key);
    }
  }, [datasets, datasetKey]);

  useEffect(() => {
    if (!dataset) return;
    setSelectedKeys(dataset.columns.filter((column) => column.default).map((column) => column.key));
    setColumnSearch("");
    setQ("");
    setStatus("");
    setTypeFilter("");
    setLocationId("");
    setStart("");
    setEnd("");
  }, [dataset]);

  const statusOptions =
    datasetKey === "tickets"
      ? (ticketMetaQuery.data?.statuses ?? []).map((item) => ({
          value: item.code,
          label: item.name,
        }))
      : (STATUS_OPTIONS[datasetKey] ?? []);
  const typeOptions = TYPE_OPTIONS[datasetKey] ?? [];
  const supportsLocations = LOCATION_DATASETS.has(datasetKey);
  const supportsDates = datasetKey === "tickets";

  const filteredColumns = useMemo(() => {
    if (!dataset) return [];
    const needle = columnSearch.trim().toLowerCase();
    if (!needle) return dataset.columns;
    return dataset.columns.filter((column) => column.label.toLowerCase().includes(needle));
  }, [dataset, columnSearch]);

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const toggleColumn = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const selectAll = () => {
    if (!dataset) return;
    setSelectedKeys(dataset.columns.map((column) => column.key));
  };

  const selectDefaults = () => {
    if (!dataset) return;
    setSelectedKeys(dataset.columns.filter((column) => column.default).map((column) => column.key));
  };

  const download = () => {
    if (!dataset) return;
    if (selectedKeys.length === 0) {
      toast.error("Sélectionnez au moins une colonne.");
      return;
    }
    const params = new URLSearchParams({
      dataset: dataset.key,
      format,
      columns: selectedKeys.join(","),
    });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (typeFilter) params.set("type", typeFilter);
    if (locationId) params.set("location_id", locationId);
    if (start) params.set("start", start);
    if (end) params.set("end", end);
    window.open(`/api/v1/exports/custom?${params.toString()}`, "_blank");
  };

  const locations = locationsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Données"
        title="Exports sur mesure"
        description="Choisissez le jeu de données, les colonnes et les filtres, puis générez un fichier Excel ou PDF adapté à votre besoin."
      />

      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary-strong">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Composer un export</h2>
              <p className="mt-1 text-xs text-muted">
                Le fichier contient exactement les colonnes et les lignes sélectionnées.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {catalogQuery.isError ? (
            <ErrorState
              message={
                catalogQuery.error instanceof Error
                  ? catalogQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void catalogQuery.refetch()}
            />
          ) : catalogQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-48 rounded-lg" />
            </div>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div>
                  <Label htmlFor="export-dataset">Jeu de données</Label>
                  <Select
                    id="export-dataset"
                    value={datasetKey}
                    onChange={(event) => setDatasetKey(event.target.value)}
                  >
                    {datasets.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                  {dataset ? (
                    <p className="mt-1.5 text-[11px] text-muted">{dataset.description}</p>
                  ) : null}
                </div>
                <div>
                  <Label>Format</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={format === "xlsx" ? "primary" : "secondary"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setFormat("xlsx")}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Excel
                    </Button>
                    <Button
                      variant={format === "pdf" ? "primary" : "secondary"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setFormat("pdf")}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-border-soft">
                  <div className="flex flex-col gap-2 border-b border-border-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Columns3 className="h-3.5 w-3.5 text-muted-2" />
                      <span className="text-xs font-medium text-foreground">Colonnes</span>
                      <Badge tone="neutral">
                        {selectedKeys.length} / {dataset?.columns.length ?? 0}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-2" />
                        <Input
                          value={columnSearch}
                          onChange={(event) => setColumnSearch(event.target.value)}
                          placeholder="Filtrer les colonnes"
                          className="h-7 w-44 pl-7 text-[11px]"
                          aria-label="Filtrer les colonnes"
                        />
                      </div>
                      <Button variant="ghost" size="sm" onClick={selectAll}>
                        Tout
                      </Button>
                      <Button variant="ghost" size="sm" onClick={selectDefaults}>
                        Par défaut
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2">
                    {filteredColumns.length === 0 ? (
                      <p className="px-2 py-6 text-center text-[11px] text-muted">
                        Aucune colonne ne correspond à la recherche.
                      </p>
                    ) : (
                      <div className="grid gap-1 sm:grid-cols-2">
                        {filteredColumns.map((column) => {
                          const checked = selectedSet.has(column.key);
                          return (
                            <label
                              key={column.key}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors",
                                checked
                                  ? "border-primary/30 bg-primary/[0.07] text-foreground"
                                  : "border-transparent text-muted hover:bg-surface-2",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onChange={() => toggleColumn(column.key)}
                              />
                              <span className="truncate">{column.label}</span>
                              {column.default ? (
                                <span className="ml-auto text-[9px] text-muted-2">conseillée</span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border-soft p-3">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-muted-2" />
                    <span className="text-xs font-medium text-foreground">Filtres</span>
                  </div>
                  <div>
                    <Label htmlFor="export-search">Recherche</Label>
                    <Input
                      id="export-search"
                      value={q}
                      onChange={(event) => setQ(event.target.value)}
                      placeholder="Nom, référence, IP…"
                    />
                  </div>
                  {statusOptions.length > 0 ? (
                    <div>
                      <Label htmlFor="export-status">Statut</Label>
                      <Select
                        id="export-status"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                      >
                        <option value="">Tous les statuts</option>
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                  {typeOptions.length > 0 ? (
                    <div>
                      <Label htmlFor="export-type">
                        {datasetKey === "stock" ? "Catégorie" : "Type"}
                      </Label>
                      <Select
                        id="export-type"
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value)}
                      >
                        <option value="">Tous</option>
                        {typeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                  {supportsLocations && locations.length > 0 ? (
                    <div>
                      <Label htmlFor="export-location">Site</Label>
                      <Select
                        id="export-location"
                        value={locationId}
                        onChange={(event) => setLocationId(event.target.value)}
                      >
                        <option value="">Tous les sites</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                  {supportsDates ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="export-start">Du</Label>
                        <Input
                          id="export-start"
                          type="date"
                          value={start}
                          onChange={(event) => setStart(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="export-end">Au</Label>
                        <Input
                          id="export-end"
                          type="date"
                          value={end}
                          onChange={(event) => setEnd(event.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-border-soft bg-background/40 px-2.5 py-2 text-[11px] text-muted">
                    {formatNumber(selectedKeys.length)} colonne(s) ·{" "}
                    {format === "xlsx" ? "Excel XLSX" : "PDF détaillé"}
                  </div>
                  <Button className="w-full" size="sm" onClick={download}>
                    <Download className="h-3.5 w-3.5" />
                    Télécharger l’export
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {hasPermission("exports.run") ? (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Exports rapides</h2>
              <p className="mt-1 text-xs text-muted">
                Exports prêts à l’emploi, avec toutes les colonnes et les synthèses.
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {quickExports.map((item) => (
              <div
                key={item.key}
                className="rounded-lg border border-border-soft bg-background/40 p-3"
              >
                <p className="text-xs font-semibold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-[11px] text-muted">{item.description}</p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.open(`${item.base}?format=xlsx`, "_blank")}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`${item.base}?format=pdf`, "_blank")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
