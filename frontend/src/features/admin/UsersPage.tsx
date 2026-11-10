import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  KeyRound,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  UserCheck,
  UserX,
  UsersRound,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { ResetPasswordDialog } from "@/features/admin/ResetPasswordDialog";
import { UserFormDialog } from "@/features/admin/UserFormDialog";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { formatDateTime, fullName } from "@/lib/utils";
import type { Page, Role, User } from "@/types/api";

const roleTones: Record<string, "accent" | "info" | "success" | "neutral" | "warning"> = {
  admin: "accent",
  si_manager: "info",
  technician: "success",
  reader: "neutral",
  user: "warning",
};

const scopeLabels: Record<string, string> = {
  all: "Tous les services",
  service: "Son service",
  own: "Données personnelles",
};

export function UsersPage() {
  const { user: currentUser, hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: "toggle" | "revoke" | "mfa"; user: User } | null
  >(null);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, roleFilter, statusFilter]);

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const query = searchParams.get("q");
    if (query) setSearch(query);
  }, [searchParams]);

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => apiFetch<Role[]>("/admin/roles"),
    staleTime: 60_000,
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users", { page, q: deferredSearch, roleFilter, statusFilter }],
    queryFn: () =>
      apiFetch<Page<User>>(
        `/admin/users${buildQuery({
          page,
          page_size: 20,
          q: deferredSearch,
          role_code: roleFilter,
          is_active: statusFilter === "" ? undefined : statusFilter === "active",
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    void usersQuery.refetch();
    void rolesQuery.refetch();
  };

  const toggleMutation = useMutation({
    mutationFn: (target: User) =>
      apiFetch(`/admin/users/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !target.is_active }),
      }),
    onSuccess: () => {
      toast.success("Statut du compte mis à jour.");
      invalidate();
      setConfirm(null);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Modification impossible."),
  });

  const revokeMutation = useMutation({
    mutationFn: (target: User) =>
      apiFetch(`/admin/users/${target.id}/revoke-sessions`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Sessions révoquées.");
      setConfirm(null);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Révocation impossible."),
  });

  const mfaResetMutation = useMutation({
    mutationFn: (target: User) =>
      apiFetch(`/admin/users/${target.id}/mfa/reset`, { method: "POST" }),
    onSuccess: () => {
      toast.success("MFA réinitialisée. L'utilisateur devra la reconfigurer.");
      invalidate();
      setConfirm(null);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Réinitialisation impossible."),
  });

  const roles = rolesQuery.data ?? [];
  const users = usersQuery.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Comptes applicatifs</h2>
          <p className="mt-0.5 text-xs text-muted">
            {usersQuery.data ? `${usersQuery.data.total} compte(s)` : "Chargement…"} · les comptes
            agents seront reliés à l'annuaire en Phase 3.
          </p>
        </div>
        {hasPermission("admin.users.manage") ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            disabled={roles.length === 0}
          >
            <Plus className="h-3.5 w-3.5" />
            Nouvel utilisateur
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un nom ou un e-mail…"
              className="pl-8"
              aria-label="Rechercher un utilisateur"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <Select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              aria-label="Filtrer par rôle"
              className="sm:w-48"
            >
              <option value="">Tous les rôles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.code}>
                  {role.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filtrer par statut"
              className="sm:w-36"
            >
              <option value="">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0 pt-3">
          {usersQuery.isError ? (
            <ErrorState
              message={usersQuery.error instanceof Error ? usersQuery.error.message : "Erreur inconnue."}
              onRetry={() => void usersQuery.refetch()}
            />
          ) : usersQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Aucun utilisateur"
              description="Aucun compte ne correspond à ces filtres."
              action={
                hasPermission("admin.users.manage") ? (
                  <Button size="sm" onClick={() => setFormOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Créer un utilisateur
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead className="hidden lg:table-cell">Portée</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden xl:table-cell">Dernière connexion</TableHead>
                  <TableHead className="w-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((item) => {
                  const isSelf = item.id === currentUser?.id;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar firstName={item.first_name} lastName={item.last_name} className="h-8 w-8" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                              {fullName(item.first_name, item.last_name)}
                              {isSelf ? <span className="ml-1 text-[10px] text-muted-2">(vous)</span> : null}
                            </p>
                            <p className="truncate text-[10px] text-muted-2">{item.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={roleTones[item.role.code] ?? "neutral"}>{item.role.name}</Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted lg:table-cell">
                        {scopeLabels[item.data_scope] ?? item.data_scope}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {item.is_active ? (
                            <Badge tone="success">Actif</Badge>
                          ) : (
                            <Badge tone="neutral">Inactif</Badge>
                          )}
                          {item.mfa_enabled ? <Badge tone="info">MFA</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted xl:table-cell">
                        {item.last_login_at ? formatDateTime(item.last_login_at) : "Jamais"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions pour ${item.email}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {hasPermission("admin.users.manage") ? (
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEditing(item);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Modifier
                              </DropdownMenuItem>
                            ) : null}
                            {hasPermission("admin.users.manage") ? (
                              <DropdownMenuItem onSelect={() => setResetUser(item)}>
                                <KeyRound className="h-3.5 w-3.5" />
                                Réinitialiser le mot de passe
                              </DropdownMenuItem>
                            ) : null}
                            {hasPermission("admin.users.manage") && item.mfa_enabled ? (
                              <DropdownMenuItem onSelect={() => setConfirm({ kind: "mfa", user: item })}>
                                <ShieldOff className="h-3.5 w-3.5" />
                                Réinitialiser la MFA
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              onSelect={() => setConfirm({ kind: "revoke", user: item })}
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              Révoquer les sessions
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={item.is_active ? "text-danger focus:bg-danger/10" : "text-success focus:bg-success/10"}
                              disabled={isSelf}
                              onSelect={() => setConfirm({ kind: "toggle", user: item })}
                            >
                              {item.is_active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" />
                                  Désactiver le compte
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" />
                                  Réactiver le compte
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {usersQuery.data && usersQuery.data.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
            <span>
              Page {usersQuery.data.page} sur {usersQuery.data.pages} · {usersQuery.data.total} compte(s)
            </span>
            <div className="flex gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Précédent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= usersQuery.data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
        roles={roles}
        onSaved={invalidate}
      />
      <ResetPasswordDialog
        open={Boolean(resetUser)}
        onOpenChange={(open) => {
          if (!open) setResetUser(null);
        }}
        user={resetUser}
        onDone={invalidate}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={
          confirm?.kind === "revoke"
            ? "Révoquer les sessions ?"
            : confirm?.kind === "mfa"
              ? "Réinitialiser la MFA ?"
              : confirm?.user.is_active
                ? "Désactiver ce compte ?"
                : "Réactiver ce compte ?"
        }
        description={
          confirm?.kind === "revoke"
            ? "L'utilisateur devra se reconnecter sur tous ses appareils. Aucune donnée n'est supprimée."
            : confirm?.kind === "mfa"
              ? "La double authentification et les codes de secours seront supprimés. L'utilisateur devra la reconfigurer et se reconnecter."
              : confirm?.user.is_active
                ? "L'utilisateur ne pourra plus se connecter. Son historique et ses données sont conservés."
                : "L'utilisateur pourra à nouveau se connecter avec son mot de passe actuel."
        }
        confirmLabel={
          confirm?.kind === "revoke"
            ? "Révoquer"
            : confirm?.kind === "mfa"
              ? "Réinitialiser"
              : confirm?.user.is_active
                ? "Désactiver"
                : "Réactiver"
        }
        tone={
          confirm?.kind === "revoke" || confirm?.kind === "mfa" || confirm?.user.is_active
            ? "danger"
            : "primary"
        }
        loading={
          toggleMutation.isPending ||
          revokeMutation.isPending ||
          mfaResetMutation.isPending
        }
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === "revoke") revokeMutation.mutate(confirm.user);
          else if (confirm.kind === "mfa") mfaResetMutation.mutate(confirm.user);
          else toggleMutation.mutate(confirm.user);
        }}
      />
    </div>
  );
}
