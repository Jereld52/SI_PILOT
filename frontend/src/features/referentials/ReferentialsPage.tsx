import { useQuery } from "@tanstack/react-query";
import { Building2, Hash, Pencil, Plus, Server, Settings2 } from "lucide-react";
import { useState } from "react";

import { CategoryDialog } from "@/features/referentials/CategoryDialog";
import { LocationDialog } from "@/features/referentials/LocationDialog";
import { ServiceDialog } from "@/features/referentials/ServiceDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AssetCategoryItem, LocationItem, ServiceItem } from "@/types/api";

type Tab = "services" | "locations" | "categories";

const tabs: Array<{ id: Tab; label: string; icon: typeof Server }> = [
  { id: "services", label: "Services", icon: Server },
  { id: "locations", label: "Sites", icon: Building2 },
  { id: "categories", label: "Catégories d'équipements", icon: Hash },
];

export function ReferentialsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("referentials.manage");
  const [tab, setTab] = useState<Tab>("services");
  const [serviceDialog, setServiceDialog] = useState(false);
  const [locationDialog, setLocationDialog] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<AssetCategoryItem | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["referentials", "services", "all"],
    queryFn: () => apiFetch<ServiceItem[]>("/services?include_inactive=true"),
  });
  const locationsQuery = useQuery({
    queryKey: ["referentials", "locations", "all"],
    queryFn: () => apiFetch<LocationItem[]>("/locations?include_inactive=true"),
  });
  const categoriesQuery = useQuery({
    queryKey: ["referentials", "asset-categories", "all"],
    queryFn: () => apiFetch<AssetCategoryItem[]>("/asset-categories?include_inactive=true"),
  });

  const isLoading =
    tab === "services"
      ? servicesQuery.isLoading
      : tab === "locations"
        ? locationsQuery.isLoading
        : categoriesQuery.isLoading;

  const isError =
    tab === "services"
      ? servicesQuery.isError
      : tab === "locations"
        ? locationsQuery.isError
        : categoriesQuery.isError;

  const refetch = () => {
    if (tab === "services") void servicesQuery.refetch();
    else if (tab === "locations") void locationsQuery.refetch();
    else void categoriesQuery.refetch();
  };

  const openCreate = () => {
    if (tab === "services") {
      setEditingService(null);
      setServiceDialog(true);
    } else if (tab === "locations") {
      setEditingLocation(null);
      setLocationDialog(true);
    } else {
      setEditingCategory(null);
      setCategoryDialog(true);
    }
  };

  const counts = {
    services: servicesQuery.data?.length ?? 0,
    locations: locationsQuery.data?.length ?? 0,
    categories: categoriesQuery.data?.length ?? 0,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Référentiels"
        description="Services, sites et catégories d'équipements, y compris les modèles de numérotation."
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              {tab === "services" ? "Nouveau service" : tab === "locations" ? "Nouveau site" : "Nouvelle catégorie"}
            </Button>
          ) : null
        }
      />

      <div className="flex gap-1 overflow-x-auto border-b border-border-soft" role="tablist" aria-label="Référentiels">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
              tab === item.id
                ? "border-primary-strong text-primary-strong"
                : "border-transparent text-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {item.label}
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] text-muted">
              {counts[item.id]}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              {tab === "services" ? "Services" : tab === "locations" ? "Sites et localisations" : "Catégories d'équipements"}
            </CardTitle>
            <CardDescription>
              {tab === "services"
                ? "Rattachement des agents, équipements et demandes."
                : tab === "locations"
                  ? "Bâtiments, étages et bureaux."
                  : "Le préfixe et le modèle définissent le numéro d'inventaire généré pour chaque nouveau matériel."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {isError ? (
            <ErrorState message="Impossible de charger le référentiel." onRetry={refetch} />
          ) : isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-11 rounded-lg" />
              ))}
            </div>
          ) : tab === "services" ? (
            servicesQuery.data && servicesQuery.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-10 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servicesQuery.data.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell className="font-mono text-xs text-muted">{service.code}</TableCell>
                      <TableCell className="text-xs">{service.name}</TableCell>
                      <TableCell>
                        <Badge tone={service.is_active ? "success" : "neutral"}>
                          {service.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifier ${service.name}`}
                            onClick={() => {
                              setEditingService(service);
                              setServiceDialog(true);
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
            ) : (
              <EmptyState icon={Server} title="Aucun service" description="Créez votre premier service." />
            )
          ) : tab === "locations" ? (
            locationsQuery.data && locationsQuery.data.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Bâtiment</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-10 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locationsQuery.data.map((location) => (
                    <TableRow key={location.id}>
                      <TableCell className="font-mono text-xs text-muted">{location.code ?? "—"}</TableCell>
                      <TableCell className="text-xs">{location.name}</TableCell>
                      <TableCell className="text-xs text-muted">{location.city ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted">{location.building ?? "—"}</TableCell>
                      <TableCell>
                        <Badge tone={location.is_active ? "success" : "neutral"}>
                          {location.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifier ${location.name}`}
                            onClick={() => {
                              setEditingLocation(location);
                              setLocationDialog(true);
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
            ) : (
              <EmptyState icon={Building2} title="Aucun site" description="Créez votre premier site." />
            )
          ) : categoriesQuery.data && categoriesQuery.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Préfixe</TableHead>
                  <TableHead>Modèle de numérotation</TableHead>
                  <TableHead>Séquence</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoriesQuery.data.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{category.name}</p>
                      <p className="font-mono text-[10px] text-muted-2">{category.code}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">{category.tag_prefix ?? "—"}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted">{category.tag_template}</TableCell>
                    <TableCell className="text-xs text-muted">
                      {category.tag_sequence_mode === "global" ? "Continue" : "Annuelle"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={category.is_active ? "success" : "neutral"}>
                        {category.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Modifier ${category.name}`}
                          onClick={() => {
                            setEditingCategory(category);
                            setCategoryDialog(true);
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
          ) : (
            <EmptyState icon={Settings2} title="Aucune catégorie" description="Créez votre première catégorie." />
          )}
        </CardContent>
      </Card>

      <ServiceDialog
        open={serviceDialog}
        onOpenChange={setServiceDialog}
        service={editingService}
        onSaved={() => void servicesQuery.refetch()}
      />
      <LocationDialog
        open={locationDialog}
        onOpenChange={setLocationDialog}
        location={editingLocation}
        onSaved={() => void locationsQuery.refetch()}
      />
      <CategoryDialog
        open={categoryDialog}
        onOpenChange={setCategoryDialog}
        category={editingCategory}
        onSaved={() => void categoriesQuery.refetch()}
      />
    </div>
  );
}
