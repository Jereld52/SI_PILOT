import { useQuery } from "@tanstack/react-query";
import {
  addWeeks,
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Package,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  EquipmentReservationDialog,
  ReservableEquipmentDialog,
  reservationCategoryLabels,
} from "@/features/reservations/ReservationDialogs";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  AgentItem,
  EquipmentReservationItem,
  LocationItem,
  Page,
  ReservableEquipmentItem,
} from "@/types/api";

type TabKey = "planning" | "equipments";

export function ReservationsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("reservations.create");
  const canUpdate = hasPermission("reservations.update");
  const canManage = hasPermission("reservations.manage");

  const [tab, setTab] = useState<TabKey>("planning");
  const [weekOffset, setWeekOffset] = useState(0);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [editingReservation, setEditingReservation] =
    useState<EquipmentReservationItem | null>(null);
  const [defaultEquipmentId, setDefaultEquipmentId] = useState<string | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] =
    useState<ReservableEquipmentItem | null>(null);

  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    return day;
  });

  const equipmentsQuery = useQuery({
    queryKey: ["reservations", "equipments"],
    queryFn: () => apiFetch<ReservableEquipmentItem[]>("/reservations/equipments"),
  });
  const reservationsQuery = useQuery({
    queryKey: ["reservations", "week", format(weekStart, "yyyy-MM-dd")],
    queryFn: () =>
      apiFetch<EquipmentReservationItem[]>(
        `/reservations${buildQuery({
          start: weekStart.toISOString(),
          end: weekEnd.toISOString(),
        })}`,
      ),
  });
  const agentsQuery = useQuery({
    queryKey: ["agents", "reservations"],
    queryFn: () => apiFetch<Page<AgentItem>>("/agents?page=1&page_size=100&status=active"),
    staleTime: 60_000,
  });
  const locationsQuery = useQuery({
    queryKey: ["referentials", "locations"],
    queryFn: () => apiFetch<LocationItem[]>("/locations"),
    staleTime: 60_000,
  });

  const equipments = equipmentsQuery.data ?? [];
  const reservations = reservationsQuery.data ?? [];
  const agents = agentsQuery.data?.items ?? [];
  const locations = locationsQuery.data ?? [];

  const refresh = () => {
    void reservationsQuery.refetch();
    void equipmentsQuery.refetch();
  };

  const openNewReservation = (equipmentId?: string, date?: Date) => {
    setEditingReservation(null);
    setDefaultEquipmentId(equipmentId ?? null);
    setDefaultDate(date ?? null);
    setReservationOpen(true);
  };

  const openEditReservation = (reservation: EquipmentReservationItem) => {
    setEditingReservation(reservation);
    setDefaultEquipmentId(null);
    setDefaultDate(null);
    setReservationOpen(true);
  };

  const archiveEquipment = async (equipment: ReservableEquipmentItem) => {
    try {
      await apiFetch(`/reservations/equipments/${equipment.id}`, { method: "DELETE" });
      toast.success("Matériel retiré de la réservation.");
      refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Archivage impossible.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Logistique"
        title="Réservations de matériel"
        description="Vidéoprojecteurs, sonorisation, écrans, micros et enregistreurs : planning hebdomadaire et réservation par créneau."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={refresh}>
              <RefreshCw className={cn("h-3.5 w-3.5", reservationsQuery.isFetching && "animate-spin")} />
              Actualiser
            </Button>
            {canCreate ? (
              <Button size="sm" onClick={() => openNewReservation()}>
                <CalendarCheck className="h-3.5 w-3.5" />
                Réserver
              </Button>
            ) : null}
          </>
        }
      />

      <Tabs
        items={[
          { key: "planning", label: "Planning", icon: CalendarDays, count: reservations.length },
          { key: "equipments", label: "Matériel", icon: Package, count: equipments.length },
        ]}
        value={tab}
        onChange={(value) => setTab(value as TabKey)}
      />

      {tab === "planning" ? (
        <Card>
          <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Semaine du {format(weekStart, "d MMMM yyyy", { locale: fr })}
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">
                Cliquez sur un créneau pour réserver, ou sur une réservation pour la modifier.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setWeekOffset((value) => value - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Précédente
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                Cette semaine
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setWeekOffset((value) => value + 1)}>
                Suivante
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {equipmentsQuery.isError || reservationsQuery.isError ? (
              <ErrorState
                message={
                  (equipmentsQuery.error instanceof Error
                    ? equipmentsQuery.error.message
                    : null) ??
                  (reservationsQuery.error instanceof Error
                    ? reservationsQuery.error.message
                    : "Erreur inconnue.")
                }
                onRetry={refresh}
              />
            ) : equipmentsQuery.isLoading || reservationsQuery.isLoading ? (
              <div className="space-y-1 px-3 pb-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : equipments.length === 0 ? (
              <EmptyState
                icon={CalendarCheck}
                title="Aucun matériel réservable"
                description="Ajoutez les vidéoprojecteurs, la sonorisation, les écrans et les micros."
                action={
                  canManage ? (
                    <Button size="sm" onClick={() => setEquipmentOpen(true)}>
                      <Plus className="h-3.5 w-3.5" />
                      Ajouter du matériel
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border-soft bg-background-soft/50">
                      <th className="w-44 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-2">
                        Matériel
                      </th>
                      {weekDays.map((day) => (
                        <th
                          key={day.toISOString()}
                          className={cn(
                            "border-l border-border-soft/60 px-2 py-2 text-[10px] font-medium uppercase tracking-wide",
                            isSameDay(day, new Date()) ? "text-accent" : "text-muted-2",
                          )}
                        >
                          {format(day, "EEE d", { locale: fr })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {equipments.map((equipment) => (
                      <tr key={equipment.id} className="border-b border-border-soft/60 last:border-0">
                        <td className="px-3 py-2 align-top">
                          <p className="text-[11px] font-medium text-foreground">{equipment.name}</p>
                          <p className="text-[9px] text-muted-2">
                            {reservationCategoryLabels[equipment.category] ?? equipment.category}
                            {equipment.location ? ` · ${equipment.location.name}` : ""}
                          </p>
                        </td>
                        {weekDays.map((day) => {
                          const dayStart = startOfDay(day);
                          const dayEnd = endOfDay(day);
                          const dayReservations = reservations.filter(
                            (reservation) =>
                              reservation.equipment_id === equipment.id &&
                              new Date(reservation.start_at) < dayEnd &&
                              new Date(reservation.end_at) > dayStart,
                          );
                          return (
                            <td
                              key={`${equipment.id}-${day.toISOString()}`}
                              className={cn(
                                "border-l border-border-soft/60 px-1.5 py-1.5 align-top",
                                isSameDay(day, new Date()) && "bg-accent/[0.04]",
                              )}
                            >
                              <div className="space-y-1">
                                {dayReservations.map((reservation) => (
                                  <button
                                    key={reservation.id}
                                    type="button"
                                    disabled={!canUpdate}
                                    onClick={() => openEditReservation(reservation)}
                                    className={cn(
                                      "block w-full rounded border border-primary/30 bg-primary/10 px-1.5 py-1 text-left transition-colors",
                                      canUpdate && "hover:border-primary/60",
                                    )}
                                  >
                                    <span className="block text-[9px] font-semibold text-foreground">
                                      {format(new Date(reservation.start_at), "HH:mm")}–
                                      {format(new Date(reservation.end_at), "HH:mm")}
                                    </span>
                                    <span className="block truncate text-[9px] text-muted">
                                      {reservation.purpose}
                                    </span>
                                    <span className="block truncate text-[8px] text-muted-2">
                                      {reservation.requester_name ?? reservation.requester_email ?? "—"}
                                    </span>
                                  </button>
                                ))}
                                {canCreate ? (
                                  <button
                                    type="button"
                                    onClick={() => openNewReservation(equipment.id, day)}
                                    className="w-full rounded border border-dashed border-border-soft px-1 py-1 text-[9px] text-muted-2 transition-colors hover:border-accent/40 hover:text-accent"
                                  >
                                    + Réserver
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "equipments" ? (
        <Card>
          <CardHeader>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Matériel réservable</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                Gérez les équipements proposés au calendrier de réservation.
              </p>
            </div>
            {canManage ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditingEquipment(null);
                  setEquipmentOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Nouveau matériel
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {equipmentsQuery.isError ? (
              <ErrorState
                message={
                  equipmentsQuery.error instanceof Error
                    ? equipmentsQuery.error.message
                    : "Erreur inconnue."
                }
                onRetry={() => void equipmentsQuery.refetch()}
              />
            ) : equipmentsQuery.isLoading ? (
              <div className="space-y-1 px-3 pb-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : equipments.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Aucun matériel"
                description="Ajoutez les équipements à proposer à la réservation."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matériel</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead className="hidden lg:table-cell">Site</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipments.map((equipment) => (
                    <TableRow key={equipment.id}>
                      <TableCell>
                        <p className="text-xs font-medium text-foreground">{equipment.name}</p>
                        <p className="text-[10px] text-muted-2">
                          {equipment.description ?? "—"}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted">
                        {reservationCategoryLabels[equipment.category] ?? equipment.category}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {equipment.location?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge tone={equipment.is_active ? "success" : "neutral"}>
                          {equipment.is_active ? "Actif" : "Archivé"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${equipment.name}`}
                              onClick={() => {
                                setEditingEquipment(equipment);
                                setEquipmentOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {equipment.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void archiveEquipment(equipment)}
                              >
                                Retirer
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border-soft bg-background-soft/40 p-4 text-[11px] text-muted">
        <p className="inline-flex items-center gap-2">
          <CalendarCheck className="h-3.5 w-3.5 text-accent" />
          Une réservation confirmée bloque le créneau pour tout le monde. Une annulation libère
          immédiatement le matériel. Dernière mise à jour :{" "}
          {reservations.length > 0
            ? formatDateTime(
                reservations.reduce(
                  (latest, item) => (item.updated_at > latest ? item.updated_at : latest),
                  reservations[0].updated_at,
                ),
              )
            : "aucune réservation cette semaine"}.
        </p>
      </Card>

      <EquipmentReservationDialog
        open={reservationOpen}
        onOpenChange={setReservationOpen}
        reservation={editingReservation}
        defaultEquipmentId={defaultEquipmentId}
        defaultDate={defaultDate}
        equipments={equipments}
        agents={agents}
        onSaved={refresh}
      />
      <ReservableEquipmentDialog
        open={equipmentOpen}
        onOpenChange={setEquipmentOpen}
        equipment={editingEquipment}
        locations={locations}
        onSaved={refresh}
      />
    </div>
  );
}
