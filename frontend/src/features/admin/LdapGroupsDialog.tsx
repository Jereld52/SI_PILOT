import { useQuery } from "@tanstack/react-query";
import { Save, Search, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type {
  LdapDirectoryActionResponse,
  LdapDirectoryGroup,
  LdapDirectoryGroupList,
  LdapDirectoryUser,
} from "@/types/api";

interface LdapGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: LdapDirectoryUser | null;
  onSaved: () => void;
}

export function LdapGroupsDialog({ open, onOpenChange, user, onSaved }: LdapGroupsDialogProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const currentQuery = useQuery({
    queryKey: ["ldap", "user-groups", user?.distinguished_name],
    queryFn: () =>
      apiFetch<LdapDirectoryGroupList>(
        `/ldap/directory/user-groups?user_dn=${encodeURIComponent(user?.distinguished_name ?? "")}`,
      ),
    enabled: open && Boolean(user?.distinguished_name),
  });
  const groupsQuery = useQuery({
    queryKey: ["ldap", "groups", query],
    queryFn: () =>
      apiFetch<LdapDirectoryGroupList>(
        `/ldap/directory/groups?q=${encodeURIComponent(query.trim())}&limit=1000`,
      ),
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(new Set());
      setInitial(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!currentQuery.data) return;
    const dns = new Set(currentQuery.data.rows.map((group) => group.distinguished_name));
    setInitial(dns);
    setSelected(new Set(dns));
  }, [currentQuery.data]);

  const groups = useMemo(() => {
    const map = new Map<string, LdapDirectoryGroup>();
    for (const group of currentQuery.data?.rows ?? []) {
      map.set(group.distinguished_name, group);
    }
    for (const group of groupsQuery.data?.rows ?? []) {
      map.set(group.distinguished_name, group);
    }
    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [currentQuery.data, groupsQuery.data]);

  const toggle = (dn: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(dn);
      else next.delete(dn);
      return next;
    });
  };

  const save = async () => {
    if (!user) return;
    const add = [...selected].filter((dn) => !initial.has(dn));
    const remove = [...initial].filter((dn) => !selected.has(dn));
    if (add.length === 0 && remove.length === 0) {
      toast.info("Aucun changement d'appartenance.");
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const response = await apiFetch<LdapDirectoryActionResponse>("/ldap/directory/groups", {
        method: "PUT",
        body: JSON.stringify({
          user_dn: user.distinguished_name,
          add_group_dns: add,
          remove_group_dns: remove,
        }),
      });
      toast.success(response.message);
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Mise à jour des groupes impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Groupes de {user?.display_name || user?.login}</DialogTitle>
          <DialogDescription>
            Cochez les groupes auxquels l'utilisateur doit appartenir. Les changements sont
            appliqués dans Active Directory et audités.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un groupe..."
              className="pl-8"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">{selected.size} groupe(s) sélectionné(s)</Badge>
            <Badge tone="neutral">{groups.length} groupe(s) affiché(s)</Badge>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border-soft">
            {currentQuery.isLoading || groupsQuery.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-8 rounded-lg" />
                <Skeleton className="h-8 rounded-lg" />
              </div>
            ) : groups.length === 0 ? (
              <p className="p-4 text-center text-[11px] text-muted-2">
                Aucun groupe trouvé. Vérifiez la base de recherche des groupes.
              </p>
            ) : (
              <ul className="divide-y divide-border-soft/60">
                {groups.map((group) => {
                  const checked = selected.has(group.distinguished_name);
                  return (
                    <li key={group.distinguished_name}>
                      <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-surface-2/40">
                        <Checkbox
                          checked={checked}
                          onChange={(event) => toggle(group.distinguished_name, event.target.checked)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <UsersRound className="h-3.5 w-3.5 shrink-0 text-muted-2" />
                            <span className="truncate text-[11px] font-medium text-foreground">
                              {group.name}
                            </span>
                            {group.member_count != null ? (
                              <span className="text-[10px] text-muted-2">
                                {group.member_count} membre(s)
                              </span>
                            ) : null}
                          </span>
                          {group.description ? (
                            <span className="mt-0.5 block truncate text-[10px] text-muted-2">
                              {group.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border-soft pt-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button loading={saving} disabled={currentQuery.isLoading} onClick={() => void save()}>
              <Save className="h-3.5 w-3.5" />
              Enregistrer les groupes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
