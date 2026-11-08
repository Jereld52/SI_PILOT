import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Search, ShieldAlert, UsersRound } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LdapGroupsDialog } from "@/features/admin/LdapGroupsDialog";
import { LdapUserDialog } from "@/features/admin/LdapUserDialog";
import { ApiError, apiFetch } from "@/lib/api";
import type { LdapDirectoryUser, LdapDirectoryUserList } from "@/types/api";

interface LdapDirectoryPanelProps {
  canManage: boolean;
  writeEnabled: boolean;
  configured: boolean;
}

export function LdapDirectoryPanel({
  canManage,
  writeEnabled,
  configured,
}: LdapDirectoryPanelProps) {
  const [query, setQuery] = useState("");
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LdapDirectoryUser | null>(null);
  const [groupsUser, setGroupsUser] = useState<LdapDirectoryUser | null>(null);

  const usersQuery = useQuery({
    queryKey: ["ldap", "directory", "users", query],
    queryFn: () =>
      apiFetch<LdapDirectoryUserList>(
        `/ldap/directory/users?q=${encodeURIComponent(query.trim())}&limit=300`,
      ),
    enabled: configured,
  });

  const canWrite = canManage && writeEnabled;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Gestion de l'annuaire</p>
          <p className="mt-1">
            <Badge tone={writeEnabled ? "success" : "neutral"}>
              {writeEnabled ? "Écriture activée" : "Lecture seule"}
            </Badge>
          </p>
          <p className="mt-1 text-[10px] text-muted-2">
            {writeEnabled
              ? "Création, modification et groupes disponibles."
              : "Activez l'écriture dans la configuration Active Directory."}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Utilisateurs affichés</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {usersQuery.data?.total ?? "—"}
          </p>
          <p className="mt-1 text-[10px] text-muted-2">
            {usersQuery.data?.truncated ? "Liste tronquée, affinez la recherche" : "Recherche dans l'annuaire"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Sécurité</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
            <ShieldAlert className="h-3.5 w-3.5 text-warning" />
            Les écritures nécessitent un compte de service autorisé.
          </p>
        </Card>
      </div>

      {!configured ? (
        <Card>
          <EmptyState
            icon={UsersRound}
            title="Active Directory non configuré"
            description="Renseignez l'URL, la base de recherche et le compte de service dans l'onglet Active Directory."
          />
        </Card>
      ) : null}

      {usersQuery.isError ? (
        <Card>
          <ErrorState
            message={
              usersQuery.error instanceof ApiError
                ? usersQuery.error.message
                : "Impossible de lire l'annuaire."
            }
            onRetry={() => void usersQuery.refetch()}
          />
        </Card>
      ) : null}

      {configured ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-4 w-4 text-accent" />
                Utilisateurs Active Directory
              </CardTitle>
              {canWrite ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setUserDialogOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Créer un utilisateur
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher par nom, identifiant ou e-mail..."
                className="pl-8"
              />
            </div>

            {usersQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : (usersQuery.data?.rows.length ?? 0) === 0 ? (
              <EmptyState
                icon={UsersRound}
                title="Aucun utilisateur"
                description={
                  query
                    ? "Aucun résultat pour cette recherche."
                    : "Aucun utilisateur trouvé dans la base de recherche configurée."
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border-soft">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Utilisateur</TableHead>
                      <TableHead>Identifiant</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>État</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersQuery.data?.rows.map((user) => (
                      <TableRow key={user.distinguished_name}>
                        <TableCell>
                          <p className="text-xs font-medium text-foreground">
                            {user.display_name || `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || user.login}
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-2">{user.email ?? "—"}</p>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted">
                          {user.login}
                        </TableCell>
                        <TableCell className="text-xs text-muted">
                          {user.department ?? "—"}
                          {user.title ? (
                            <span className="block text-[10px] text-muted-2">{user.title}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge tone={user.enabled ? "success" : "neutral"}>
                            {user.enabled ? "Activé" : "Désactivé"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {canWrite ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditing(user);
                                    setUserDialogOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Modifier
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setGroupsUser(user)}
                                >
                                  <UsersRound className="h-3.5 w-3.5" />
                                  Groupes
                                </Button>
                              </>
                            ) : (
                              <span className="text-[10px] text-muted-2">Lecture seule</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <LdapUserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={editing}
        onSaved={() => void usersQuery.refetch()}
      />
      <LdapGroupsDialog
        open={Boolean(groupsUser)}
        onOpenChange={(open) => !open && setGroupsUser(null)}
        user={groupsUser}
        onSaved={() => void usersQuery.refetch()}
      />
    </div>
  );
}
