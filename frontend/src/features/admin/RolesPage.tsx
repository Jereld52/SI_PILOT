import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, LockKeyhole, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import { cn, humanize } from "@/lib/utils";
import type { Permission, RoleWithPermissions } from "@/types/api";

const moduleLabels: Record<string, string> = {
  dashboard: "Vue générale",
  search: "Recherche",
  notifications: "Notifications",
  tickets: "Demandes IT",
  interventions: "Interventions",
  assets: "Parc informatique",
  agents: "Agents",
  infrastructure: "Infrastructure",
  security: "Cybersécurité",
  contracts: "Contrats",
  budget: "Budget",
  projects: "Projets",
  rgpd: "RGPD",
  documents: "Documentation",
  calendar: "Calendrier",
  actions: "Actions",
  automations: "Automatisations",
  imports: "Imports",
  exports: "Exports",
  admin: "Administration",
  audit: "Journal d'audit",
  sylvia: "SylvIA",
};

export function RolesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => apiFetch<RoleWithPermissions[]>("/admin/roles"),
  });
  const permissionsQuery = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: () => apiFetch<Permission[]>("/admin/permissions"),
  });

  const roles = rolesQuery.data ?? [];
  const selectedRole = roles.find((role) => role.id === selectedId) ?? roles[0];

  useEffect(() => {
    if (selectedRole) {
      setCodes(selectedRole.permissions.map((permission) => permission.code));
    }
    // Réinitialise uniquement lors d'un changement de rôle, pas lors d'un refetch de fond.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole?.id]);

  const permissions = permissionsQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return permissions;
    return permissions.filter(
      (permission) =>
        permission.code.toLowerCase().includes(needle) ||
        (permission.description ?? "").toLowerCase().includes(needle),
    );
  }, [permissions, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    filtered.forEach((permission) => {
      const list = map.get(permission.module) ?? [];
      list.push(permission);
      map.set(permission.module, list);
    });
    return Array.from(map.entries()).sort(([left], [right]) =>
      (moduleLabels[left] ?? left).localeCompare(moduleLabels[right] ?? right, "fr"),
    );
  }, [filtered]);

  const locked = selectedRole?.code === "admin";
  const originalCodes = useMemo(
    () => (selectedRole?.permissions ?? []).map((permission) => permission.code),
    [selectedRole],
  );
  const dirty = useMemo(
    () => JSON.stringify([...codes].sort()) !== JSON.stringify([...originalCodes].sort()),
    [codes, originalCodes],
  );

  const saveMutation = useMutation({
    mutationFn: (permissionCodes: string[]) =>
      apiFetch(`/admin/roles/${selectedRole?.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permission_codes: permissionCodes }),
      }),
    onSuccess: () => {
      toast.success("Permissions du rôle enregistrées.");
      void rolesQuery.refetch();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Enregistrement impossible."),
  });

  const toggle = (code: string) => {
    setCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  };

  const toggleModule = (modulePermissions: Permission[], checked: boolean) => {
    const moduleCodes = modulePermissions.map((permission) => permission.code);
    setCodes((current) =>
      checked
        ? Array.from(new Set([...current, ...moduleCodes]))
        : current.filter((code) => !moduleCodes.includes(code)),
    );
  };

  if (rolesQuery.isError || permissionsQuery.isError) {
    return (
      <Card>
        <ErrorState
          message="Impossible de charger les rôles ou les permissions."
          onRetry={() => {
            void rolesQuery.refetch();
            void permissionsQuery.refetch();
          }}
        />
      </Card>
    );
  }

  if (rolesQuery.isLoading || permissionsQuery.isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-[600px] rounded-xl" />
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <Card>
        <EmptyState icon={ShieldCheck} title="Aucun rôle" description="Aucun rôle n'est configuré." />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">Rôles</p>
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            onClick={() => setSelectedId(role.id)}
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
              selectedRole?.id === role.id
                ? "border-primary-strong/30 bg-primary/10"
                : "border-border-soft bg-surface/60 hover:border-border hover:bg-surface-2",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">{role.name}</span>
              {role.is_system ? <LockKeyhole className="h-3 w-3 text-muted-2" aria-label="Rôle système" /> : null}
            </div>
            <p className="mt-0.5 text-[10px] text-muted-2">
              {role.code} · {role.permissions.length} permission(s)
            </p>
          </button>
        ))}
        <p className="px-1 pt-2 text-[10px] leading-4 text-muted-2">
          Les rôles système ne peuvent pas être supprimés. Le rôle Administrateur est verrouillé
          pour éviter la perte d'accès.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{selectedRole?.name}</CardTitle>
              {locked ? <Badge tone="warning">Verrouillé</Badge> : <Badge tone="accent">Modifiable</Badge>}
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              {selectedRole?.description ?? "Aucune description."}
            </p>
            <p className="mt-1 text-[10px] text-muted-2">
              Portée par défaut : {selectedRole?.data_scope_default} · {codes.length} permission(s)
              sélectionnée(s)
            </p>
          </div>
          <div className="relative w-full sm:ml-auto sm:max-w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrer les permissions…"
              className="pl-8"
              aria-label="Filtrer les permissions"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {grouped.length === 0 ? (
            <EmptyState
              icon={SlidersHorizontal}
              title="Aucune permission"
              description="Aucune permission ne correspond à ce filtre."
              className="py-8"
            />
          ) : (
            grouped.map(([module, modulePermissions]) => {
              const checkedCount = modulePermissions.filter((permission) =>
                codes.includes(permission.code),
              ).length;
              const allChecked = checkedCount === modulePermissions.length;
              return (
                <div key={module} className="rounded-lg border border-border-soft">
                  <div className="flex items-center justify-between gap-3 border-b border-border-soft px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {moduleLabels[module] ?? humanize(module)}
                      </p>
                      <p className="text-[10px] text-muted-2">
                        {checkedCount}/{modulePermissions.length} permission(s)
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-muted">
                      <Checkbox
                        checked={allChecked}
                        disabled={locked}
                        onChange={(event) => toggleModule(modulePermissions, event.target.checked)}
                      />
                      Tout
                    </label>
                  </div>
                  <div className="grid gap-1 p-2 sm:grid-cols-2">
                    {modulePermissions.map((permission) => (
                      <label
                        key={permission.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2/60",
                          locked && "cursor-not-allowed opacity-70",
                        )}
                      >
                        <Checkbox
                          checked={codes.includes(permission.code)}
                          disabled={locked}
                          onChange={() => toggle(permission.code)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium text-foreground">
                            {permission.description ?? permission.code}
                          </span>
                          <span className="block truncate font-mono text-[9px] text-muted-2">
                            {permission.code}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>

        {!locked ? (
          <div className="sticky bottom-3 mx-3 mb-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/95 px-3 py-2.5 shadow-xl backdrop-blur">
            <p className="text-[11px] text-muted">
              {dirty ? "Modifications non enregistrées." : "Permissions à jour."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={!dirty}
                onClick={() => setCodes(originalCodes)}
              >
                Annuler
              </Button>
              <Button
                size="sm"
                disabled={!dirty}
                loading={saveMutation.isPending}
                onClick={() => saveMutation.mutate(codes)}
              >
                <Check className="h-3.5 w-3.5" />
                Enregistrer
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-3 mb-3 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-[11px] text-warning">
            Le rôle Administrateur est verrouillé. Créez un rôle dédié si vous devez ajuster des
            permissions sensibles.
          </div>
        )}
      </Card>
    </div>
  );
}
