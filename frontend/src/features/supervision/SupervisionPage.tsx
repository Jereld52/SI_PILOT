import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BatteryCharging,
  Box,
  Boxes,
  CircleAlert,
  ExternalLink,
  HardDrive,
  Layers,
  Map as MapIcon,
  Move,
  Network,
  RefreshCw,
  Router,
  Server,
  Settings2,
  Shield,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/AuthProvider";
import { SupervisionMapDialog } from "@/features/supervision/SupervisionMapDialog";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type { InfraEquipmentItem, InfraMapData } from "@/types/api";

const typeLabels: Record<string, string> = {
  server: "Serveur",
  vm: "Machine virtuelle",
  switch: "Switch",
  router: "Routeur",
  firewall: "Pare-feu",
  nas: "NAS",
  access_point: "Point d'accès",
  ups: "Onduleur",
  other: "Autre",
};

const typeIcons: Record<string, LucideIcon> = {
  server: Server,
  vm: Box,
  switch: Network,
  router: Router,
  firewall: Shield,
  nas: HardDrive,
  access_point: Wifi,
  ups: BatteryCharging,
  other: Boxes,
};

const statusLabels: Record<string, string> = {
  active: "Actif",
  maintenance: "Maintenance",
  offline: "Hors ligne",
  retired: "Retiré",
};

const statusTones: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  maintenance: "warning",
  offline: "danger",
  retired: "neutral",
};

const criticalityLabels: Record<string, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
  critical: "Critique",
};

const criticalityTones: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const nodeTones: Record<string, string> = {
  active: "border-success/50 bg-success/10 text-success",
  maintenance: "border-warning/50 bg-warning/10 text-warning",
  offline: "border-danger/55 bg-danger/10 text-danger",
  retired: "border-border bg-surface-2 text-muted",
};

const criticalityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface Position {
  x: number;
  y: number;
}

interface DragState {
  id: string;
  offsetX: number;
  offsetY: number;
  startClientX: number;
  startClientY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function SupervisionPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("infrastructure.update");

  const mapQuery = useQuery({
    queryKey: ["infrastructure", "map"],
    queryFn: () => apiFetch<InfraMapData>("/infrastructure/map"),
  });

  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [placementMode, setPlacementMode] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const data = mapQuery.data;
  const equipments = data?.equipments ?? [];
  const dependencies = data?.dependencies ?? [];
  const checks = data?.checks ?? [];
  const maps = data?.maps ?? [];
  const activeMap = maps.find((item) => item.id === selectedMapId) ?? null;
  const summary = data?.summary;

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (!data) return;
    const ids = data.maps.map((item) => item.id);
    if (!selectedMapId || !ids.includes(selectedMapId)) {
      setSelectedMapId(ids[0] ?? null);
    }
  }, [data, selectedMapId]);

  useEffect(() => {
    if (!data || dragRef.current) return;
    const next: Record<string, Position> = {};
    for (const equipment of data.equipments) {
      if (
        equipment.infra_map_id === selectedMapId &&
        equipment.map_x != null &&
        equipment.map_y != null
      ) {
        next[equipment.id] = { x: equipment.map_x, y: equipment.map_y };
      }
    }
    setPositions(next);
  }, [data, selectedMapId]);

  const positionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      x: number | null;
      y: number | null;
      map_id: string | null;
    }) =>
      apiFetch(`/infrastructure/equipments/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          map_x: payload.x,
          map_y: payload.y,
          infra_map_id: payload.map_id,
        }),
      }),
    onSuccess: () => {
      void mapQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Position non enregistrée.");
      void mapQuery.refetch();
    },
  });

  const positionsRef = useRef<Record<string, Position>>({});
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    if (!drag) return;
    const table = mapRef.current;
    if (!table) return;

    let moved = false;
    const onMove = (event: PointerEvent) => {
      const rect = table.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (
        Math.abs(event.clientX - drag.startClientX) > 3 ||
        Math.abs(event.clientY - drag.startClientY) > 3
      ) {
        moved = true;
      }
      const rawX = ((event.clientX - rect.left) / rect.width) * 100 + drag.offsetX;
      const rawY = ((event.clientY - rect.top) / rect.height) * 100 + drag.offsetY;
      const x = clamp(rawX, 3, 97);
      const y = clamp(rawY, 5, 95);
      setPositions((current) => ({ ...current, [drag.id]: { x, y } }));
    };

    const onUp = () => {
      const current = positionsRef.current[drag.id];
      suppressClickRef.current = moved;
      if (!moved) {
        suppressClickRef.current = false;
      } else {
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 300);
      }
      if (moved && current) {
        positionMutation.mutate({
          id: drag.id,
          x: Number(current.x.toFixed(2)),
          y: Number(current.y.toFixed(2)),
          map_id: selectedMapId,
        });
        toast.success("Position enregistrée.");
      }
      setDrag(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, selectedMapId]);

  const startDrag = (event: ReactPointerEvent, equipment: InfraEquipmentItem) => {
    if (!placementMode || !canEdit) return;
    const position = positions[equipment.id];
    if (!position) return;
    const container = mapRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;
    event.preventDefault();
    setDrag({
      id: equipment.id,
      offsetX: position.x - pointerX,
      offsetY: position.y - pointerY,
      startClientX: event.clientX,
      startClientY: event.clientY,
    });
  };

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return equipments.filter((equipment) => {
      if (typeFilter && equipment.type !== typeFilter) return false;
      if (statusFilter && equipment.status !== statusFilter) return false;
      if (criticalityFilter && equipment.criticality !== criticalityFilter) return false;
      if (locationFilter && equipment.location_id !== locationFilter) return false;
      if (!needle) return true;
      return [equipment.name, equipment.ip_address, equipment.role, equipment.os_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [equipments, search, typeFilter, statusFilter, criticalityFilter, locationFilter]);

  const placed = filtered.filter(
    (equipment) =>
      equipment.infra_map_id === selectedMapId && Boolean(positions[equipment.id]),
  );
  const unplaced = filtered
    .filter(
      (equipment) =>
        !(equipment.infra_map_id === selectedMapId && positions[equipment.id]),
    )
    .sort(
      (left, right) =>
        (criticalityOrder[left.criticality] ?? 9) - (criticalityOrder[right.criticality] ?? 9) ||
        left.name.localeCompare(right.name),
    );

  const selected = equipments.find((equipment) => equipment.id === selectedId) ?? null;
  const mapAspect =
    activeMap?.background_width && activeMap.background_height
      ? `${activeMap.background_width} / ${activeMap.background_height}`
      : null;
  const selectedChecks = selected ? checks.filter((check) => check.infra_id === selected.id) : [];
  const selectedDependencies = selected
    ? dependencies.filter(
        (dependency) =>
          dependency.source_id === selected.id || dependency.target_id === selected.id,
      )
    : [];

  const allLocations = (data?.locations ?? []).slice().sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const locations = useMemo(
    () => allLocations.map((location) => [location.id, location.name] as [string, string]),
    [allLocations],
  );

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
    setCriticalityFilter("");
    setLocationFilter("");
  };

  const placeAtCenter = (equipment: InfraEquipmentItem) => {
    if (!selectedMapId) {
      toast.error("Créez ou sélectionnez une carte avant de placer un équipement.");
      return;
    }
    const offset = (Object.keys(positions).length % 6) * 4;
    const x = clamp(50 + offset - 10, 8, 92);
    const y = clamp(50 + offset - 10, 10, 90);
    setPositions((current) => ({ ...current, [equipment.id]: { x, y } }));
    setSelectedId(equipment.id);
    setPlacementMode(true);
    positionMutation.mutate({ id: equipment.id, x, y, map_id: selectedMapId });
  };

  const autoLayout = async () => {
    if (!selectedMapId) {
      toast.error("Sélectionnez une carte avant de placer les équipements.");
      return;
    }
    const targets = unplaced.length > 0 ? unplaced : placed;
    if (targets.length === 0) return;
    const columns = Math.ceil(Math.sqrt(targets.length));
    const rows = Math.ceil(targets.length / columns);
    const next = { ...positions };
    targets.forEach((equipment, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = columns === 1 ? 50 : 10 + (column * 80) / (columns - 1);
      const y = rows === 1 ? 50 : 12 + (row * 76) / (rows - 1);
      next[equipment.id] = { x, y };
    });
    setPositions(next);
    try {
      await Promise.all(
        targets.map((equipment) => {
          const position = next[equipment.id];
          return apiFetch(`/infrastructure/equipments/${equipment.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              map_x: Number(position.x.toFixed(2)),
              map_y: Number(position.y.toFixed(2)),
              infra_map_id: selectedMapId,
            }),
          });
        }),
      );
      toast.success(`${targets.length} équipement(s) positionné(s).`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Placement incomplet.");
    } finally {
      void mapQuery.refetch();
    }
  };

  const removeFromMap = (equipment: InfraEquipmentItem) => {
    setPositions((current) => {
      const next = { ...current };
      delete next[equipment.id];
      return next;
    });
    positionMutation.mutate({ id: equipment.id, x: null, y: null, map_id: null });
  };

  const renderNode = (equipment: InfraEquipmentItem) => {
    const position = positions[equipment.id];
    if (!position) return null;
    const Icon = typeIcons[equipment.type] ?? Boxes;
    const isSelected = selectedId === equipment.id;
    return (
      <button
        key={equipment.id}
        type="button"
        onPointerDown={(event) => startDrag(event, equipment)}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          setSelectedId(equipment.id);
        }}
        style={{ left: `${position.x}%`, top: `${position.y}%` }}
        className={cn(
          "absolute z-20 -translate-x-1/2 -translate-y-1/2 touch-none rounded-lg border px-2.5 py-2 text-left shadow-lg shadow-black/25 backdrop-blur transition-transform",
          nodeTones[equipment.status] ?? nodeTones.retired,
          placementMode && canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-background",
          equipment.criticality === "critical" && "border-danger",
        )}
        aria-label={`${equipment.name} — ${statusLabels[equipment.status] ?? equipment.status}`}
        title={`${equipment.name} · ${typeLabels[equipment.type] ?? equipment.type} · ${equipment.ip_address ?? "IP non renseignée"}`}
      >
        <span className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" />
          <span className="max-w-[130px] truncate text-[11px] font-semibold text-foreground">
            {equipment.name}
          </span>
        </span>
        <span className="mt-0.5 block max-w-[150px] truncate text-[9px] text-muted">
          {equipment.ip_address ?? typeLabels[equipment.type] ?? equipment.type}
        </span>
      </button>
    );
  };

  if (mapQuery.isError) {
    return (
      <ErrorState
        message={mapQuery.error instanceof Error ? mapQuery.error.message : "Erreur inconnue."}
        onRetry={() => void mapQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Exploitation"
        title="Supervision globale"
        description="Carte visuelle des équipements importants, de leur état et de leurs dépendances. Cliquez sur un équipement pour ouvrir sa fiche."
        actions={
          <>
            {maps.length > 0 ? (
              <Select
                value={selectedMapId ?? ""}
                onChange={(event) => setSelectedMapId(event.target.value)}
                className="w-52"
                aria-label="Choisir une carte de supervision"
              >
                {maps.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setMapDialogOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" />
              Gérer les plans
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void mapQuery.refetch()}>
              <RefreshCw className={cn("h-3.5 w-3.5", mapQuery.isFetching && "animate-spin")} />
              Actualiser
            </Button>
            {canEdit ? (
              <Button
                variant={placementMode ? "primary" : "secondary"}
                size="sm"
                disabled={!selectedMapId}
                onClick={() => setPlacementMode((value) => !value)}
              >
                <Move className="h-3.5 w-3.5" />
                {placementMode ? "Terminer le placement" : "Placer les équipements"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Card className="border-l-2 border-l-primary/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Équipements</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(summary?.equipments_total ?? 0)}
          </p>
          <p className="text-[10px] text-muted-2">
            {formatNumber(summary?.placed ?? 0)} placé(s) · {formatNumber(summary?.unplaced ?? 0)} à placer
          </p>
        </Card>
        <Card className="border-l-2 border-l-success/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">En service</p>
          <p className="mt-1 text-2xl font-semibold text-success">
            {formatNumber(summary?.running ?? 0)}
          </p>
        </Card>
        <Card className="border-l-2 border-l-warning/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Maintenance</p>
          <p className="mt-1 text-2xl font-semibold text-warning">
            {formatNumber(summary?.maintenance ?? 0)}
          </p>
        </Card>
        <Card className="border-l-2 border-l-danger/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Hors ligne</p>
          <p className="mt-1 text-2xl font-semibold text-danger">
            {formatNumber(summary?.offline ?? 0)}
          </p>
        </Card>
        <Card className="border-l-2 border-l-danger/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Critiques</p>
          <p className="mt-1 text-2xl font-semibold text-danger">
            {formatNumber(summary?.critical ?? 0)}
          </p>
        </Card>
        <Card className="border-l-2 border-l-info/70 p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Contrôles actifs</p>
          <p className="mt-1 text-2xl font-semibold text-info">
            {formatNumber(summary?.checks_enabled ?? 0)}
            <span className="text-sm text-muted"> / {formatNumber(summary?.checks_total ?? 0)}</span>
          </p>
          <p className="text-[10px] text-muted-2">
            {summary?.last_check_at ? `Dernier contrôle ${formatDateTime(summary.last_check_at)}` : "Aucun contrôle"}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-2 xl:flex-row xl:items-center">
          <div className="flex w-full flex-1 flex-wrap gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un équipement, une IP, un rôle…"
              className="w-full sm:w-64"
              aria-label="Rechercher un équipement"
            />
            <Select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="w-full sm:w-40"
              aria-label="Filtrer par type"
            >
              <option value="">Tous les types</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-40"
              aria-label="Filtrer par état"
            >
              <option value="">Tous les états</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={criticalityFilter}
              onChange={(event) => setCriticalityFilter(event.target.value)}
              className="w-full sm:w-40"
              aria-label="Filtrer par criticité"
            >
              <option value="">Toutes criticités</option>
              {Object.entries(criticalityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              className="w-full sm:w-44"
              aria-label="Filtrer par site"
            >
              <option value="">Tous les sites</option>
              {locations.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
            {search || typeFilter || statusFilter || criticalityFilter || locationFilter ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="h-3.5 w-3.5" />
                Réinitialiser
              </Button>
            ) : null}
          </div>
          {canEdit && unplaced.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => void autoLayout()}>
              <Layers className="h-3.5 w-3.5" />
              Placer automatiquement ({unplaced.length})
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-3 pt-0 xl:p-4 xl:pt-0">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div
              ref={mapRef}
              className={cn(
                "relative overflow-hidden rounded-xl border border-border-soft bg-background-soft/60",
                mapAspect ? "w-full" : "h-[520px] xl:h-[660px]",
                placementMode && "cursor-crosshair",
              )}
              style={
                mapAspect
                  ? { aspectRatio: mapAspect }
                  : {
                      backgroundImage:
                        "radial-gradient(circle, var(--color-grid-dot) 1px, transparent 1px)",
                      backgroundSize: "28px 28px",
                    }
              }
            >
              {activeMap?.has_background ? (
                <img
                  src={`/api/v1/infrastructure/maps/${activeMap.id}/background?v=${encodeURIComponent(activeMap.updated_at)}`}
                  alt={`Plan ${activeMap.name}`}
                  className="pointer-events-none absolute inset-0 z-0 h-full w-full object-fill"
                />
              ) : null}
              <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-background/80 px-3 py-2 text-[10px] text-muted backdrop-blur">
                <span className="font-medium text-foreground">Légende</span>
                {Object.entries(statusLabels).map(([status, label]) => (
                  <span key={status} className="inline-flex items-center gap-1">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        status === "active" && "bg-success",
                        status === "maintenance" && "bg-warning",
                        status === "offline" && "bg-danger",
                        status === "retired" && "bg-muted-2",
                      )}
                    />
                    {label}
                  </span>
                ))}
              </div>
              {placementMode && canEdit ? (
                <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[10px] text-accent backdrop-blur">
                  Faites glisser un équipement pour le positionner.
                </div>
              ) : null}

              {mapQuery.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Skeleton className="h-[80%] w-[90%] rounded-xl" />
                </div>
              ) : maps.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={MapIcon}
                    title="Aucune carte de supervision"
                    description="Créez un plan de site, de bâtiment, d'étage ou de baie pour positionner vos équipements."
                    action={
                      <Button size="sm" onClick={() => setMapDialogOpen(true)}>
                        Créer une carte
                      </Button>
                    }
                  />
                </div>
              ) : equipments.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={MapIcon}
                    title="Aucun équipement"
                    description="Ajoutez vos serveurs, VM et équipements réseau dans le module Infrastructure."
                    action={
                      <Button size="sm" onClick={() => navigate("/infrastructure")}>
                        Ouvrir Infrastructure
                      </Button>
                    }
                  />
                </div>
              ) : (
                <>
                  <svg
                    className="pointer-events-none absolute inset-0 z-10 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {dependencies.map((dependency) => {
                      const source = positions[dependency.source_id];
                      const target = positions[dependency.target_id];
                      if (!source || !target) return null;
                      const highlighted =
                        selectedId != null &&
                        (dependency.source_id === selectedId ||
                          dependency.target_id === selectedId);
                      return (
                        <line
                          key={dependency.id}
                          x1={source.x}
                          y1={source.y}
                          x2={target.x}
                          y2={target.y}
                          stroke={highlighted ? "var(--color-accent)" : "var(--color-supervision-line)"}
                          strokeWidth={highlighted ? 0.45 : 0.25}
                          strokeDasharray={dependency.dependency_type === "power" ? "1 1" : undefined}
                        />
                      );
                    })}
                  </svg>
                  {placed.map(renderNode)}
                  {placed.length === 0 ? (
                    <div className="flex h-full items-center justify-center px-6 text-center">
                      <div>
                        <MapIcon className="mx-auto h-8 w-8 text-muted-2" />
                        <p className="mt-2 text-sm font-medium text-foreground">
                          Aucun équipement placé
                        </p>
                        <p className="mt-1 max-w-sm text-xs text-muted">
                          Utilisez « Placer automatiquement » ou choisissez un équipement dans la
                          liste « À placer » pour l’ajouter à la carte.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className="space-y-3">
              {selected ? (
                <Card className="border-primary/25">
                  <CardHeader>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-2">
                        {typeLabels[selected.type] ?? selected.type}
                      </p>
                      <h2 className="truncate text-sm font-semibold text-foreground">
                        {selected.name}
                      </h2>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {selected.role ?? "Rôle non renseigné"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Fermer le détail"
                      onClick={() => setSelectedId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3 text-[11px]">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={statusTones[selected.status] ?? "neutral"}>
                        {statusLabels[selected.status] ?? selected.status}
                      </Badge>
                      <Badge tone={criticalityTones[selected.criticality] ?? "neutral"}>
                        {criticalityLabels[selected.criticality] ?? selected.criticality}
                      </Badge>
                      {!positions[selected.id] ? <Badge tone="warning">Non placé</Badge> : null}
                    </div>
                    <div className="space-y-1.5 rounded-lg border border-border-soft bg-background/40 p-2.5">
                      <DetailRow label="Adresse IP" value={selected.ip_address ?? "—"} mono />
                      <DetailRow label="Adresse MAC" value={selected.mac_address ?? "—"} mono />
                      <DetailRow label="Site" value={selected.location?.name ?? "—"} />
                      <DetailRow
                        label="Système"
                        value={
                          [selected.os_name, selected.os_version].filter(Boolean).join(" ") || "—"
                        }
                      />
                      <DetailRow
                        label="Responsable"
                        value={
                          selected.responsible
                            ? `${selected.responsible.first_name} ${selected.responsible.last_name}`
                            : "—"
                        }
                      />
                      <DetailRow
                        label="Dernier contrôle"
                        value={formatDateTime(selected.last_check_at)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-border-soft bg-background/40 px-1 py-2">
                        <p className="text-base font-semibold text-foreground">
                          {selectedChecks.length}
                        </p>
                        <p className="text-[9px] text-muted-2">contrôles</p>
                      </div>
                      <div className="rounded-lg border border-border-soft bg-background/40 px-1 py-2">
                        <p className="text-base font-semibold text-success">
                          {selectedChecks.filter((check) => check.is_enabled).length}
                        </p>
                        <p className="text-[9px] text-muted-2">actifs</p>
                      </div>
                      <div className="rounded-lg border border-border-soft bg-background/40 px-1 py-2">
                        <p className="text-base font-semibold text-foreground">
                          {selectedDependencies.length}
                        </p>
                        <p className="text-[9px] text-muted-2">liens</p>
                      </div>
                    </div>
                    {selectedDependencies.length > 0 ? (
                      <div>
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-2">
                          Dépendances
                        </p>
                        <div className="space-y-1">
                          {selectedDependencies.slice(0, 5).map((dependency) => {
                            const outgoing = dependency.source_id === selected.id;
                            const other = outgoing ? dependency.target_name : dependency.source_name;
                            return (
                              <div
                                key={dependency.id}
                                className="flex items-center justify-between gap-2 rounded border border-border-soft px-2 py-1"
                              >
                                <span className="truncate text-muted">
                                  {outgoing ? "→" : "←"} {other}
                                </span>
                                <span className="shrink-0 text-[9px] text-muted-2">
                                  {dependency.dependency_type}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate("/infrastructure")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Gérer
                      </Button>
                      {canEdit && positions[selected.id] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromMap(selected)}
                        >
                          <X className="h-3.5 w-3.5" />
                          Retirer de la carte
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">À placer sur la carte</h2>
                      <p className="mt-0.5 text-[11px] text-muted">
                        Les équipements importants sans position sont listés en priorité.
                      </p>
                    </div>
                    <Badge tone="warning">{unplaced.length}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {unplaced.length === 0 ? (
                      <p className="rounded-lg border border-border-soft bg-background/40 px-3 py-3 text-center text-[11px] text-muted">
                        Tous les équipements filtrés sont placés sur la carte.
                      </p>
                    ) : (
                      unplaced.slice(0, 10).map((equipment) => (
                        <button
                          key={equipment.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(equipment.id);
                            if (canEdit) placeAtCenter(equipment);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-soft bg-background/40 px-2.5 py-2 text-left transition-colors hover:border-primary/40"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-medium text-foreground">
                              {equipment.name}
                            </span>
                            <span className="block truncate text-[9px] text-muted-2">
                              {typeLabels[equipment.type] ?? equipment.type} ·{" "}
                              {equipment.ip_address ?? "IP non renseignée"}
                            </span>
                          </span>
                          <Badge tone={criticalityTones[equipment.criticality] ?? "neutral"}>
                            {criticalityLabels[equipment.criticality] ?? equipment.criticality}
                          </Badge>
                        </button>
                      ))
                    )}
                    {unplaced.length > 10 ? (
                      <p className="pt-1 text-center text-[10px] text-muted-2">
                        + {unplaced.length - 10} autre(s) équipement(s)
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="space-y-1.5 pt-4 text-[11px] text-muted">
                  <div className="flex items-start gap-2">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <p>
                      La supervision affiche l’état déclaré dans l’inventaire. Aucune sonde réseau
                      n’est exécutée automatiquement.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Move className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <p>
                      Activez « Placer les équipements » puis faites glisser les nœuds pour
                      organiser la carte. Les positions sont enregistrées et auditées.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <SupervisionMapDialog
        open={mapDialogOpen}
        onOpenChange={setMapDialogOpen}
        maps={maps}
        locations={allLocations}
        selectedMapId={selectedMapId}
        onSelectMap={setSelectedMapId}
        onSaved={() => void mapQuery.refetch()}
      />
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-muted-2">{label}</span>
      <span className={cn("truncate text-right text-foreground", mono && "font-mono text-[10px]")}>
        {value}
      </span>
    </div>
  );
}
