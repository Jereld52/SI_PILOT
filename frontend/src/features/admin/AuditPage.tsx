import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FileClock, Search } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, buildQuery } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/utils";
import type { AuditLog, Page } from "@/types/api";

function pretty(value: string | null): string | null {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function JsonBlock({ label, value }: { label: string; value: string | null }) {
  const formatted = pretty(value);
  if (!formatted) return null;
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-2">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-lg border border-border-soft bg-background-soft p-3 text-[10px] leading-5 text-muted">
        {formatted}
      </pre>
    </div>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");
  const [status, setStatus] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const deferredActor = useDeferredValue(actor);
  const deferredQ = useDeferredValue(q);

  useEffect(() => {
    setPage(1);
  }, [module, status, deferredActor, deferredQ, dateFrom, dateTo]);

  const summaryQuery = useQuery({
    queryKey: ["audit-summary"],
    queryFn: () => apiFetch<{ total: number; modules: Record<string, number> }>("/audit-logs/summary"),
    staleTime: 60_000,
  });

  const auditQuery = useQuery({
    queryKey: ["audit-logs", { page, module, status, actor: deferredActor, q: deferredQ, dateFrom, dateTo }],
    queryFn: () =>
      apiFetch<Page<AuditLog>>(
        `/audit-logs${buildQuery({
          page,
          page_size: 25,
          module,
          status,
          actor: deferredActor,
          q: deferredQ,
          date_from: dateFrom ? `${dateFrom}T00:00:00` : undefined,
          date_to: dateTo ? `${dateTo}T23:59:59` : undefined,
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const modules = Object.keys(summaryQuery.data?.modules ?? {}).sort();
  const logs = auditQuery.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Journal d'audit</h2>
        <p className="mt-0.5 text-xs text-muted">
          {summaryQuery.data ? `${summaryQuery.data.total} événement(s) enregistré(s)` : "Chargement…"} ·
          journal append-only avec chaînage de hash.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3">
          <div className="flex w-full flex-col gap-2 lg:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
              <Input
                value={actor}
                onChange={(event) => setActor(event.target.value)}
                placeholder="Filtrer par utilisateur…"
                className="pl-8"
                aria-label="Filtrer par utilisateur"
              />
            </div>
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Identifiant, libellé ou requête…"
              aria-label="Rechercher dans le journal"
              className="flex-1"
            />
            <Select
              value={module}
              onChange={(event) => setModule(event.target.value)}
              aria-label="Filtrer par module"
              className="lg:w-48"
            >
              <option value="">Tous les modules</option>
              {modules.map((item) => (
                <option key={item} value={item}>
                  {humanize(item)}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filtrer par statut"
              className="lg:w-36"
            >
              <option value="">Tous les statuts</option>
              <option value="success">Succès</option>
              <option value="failure">Échec</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-muted-2">Du</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-40"
              aria-label="Date de début"
            />
            <span className="text-[10px] text-muted-2">au</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-40"
              aria-label="Date de fin"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0 pt-3">
          {auditQuery.isError ? (
            <ErrorState
              message={auditQuery.error instanceof Error ? auditQuery.error.message : "Erreur inconnue."}
              onRetry={() => void auditQuery.refetch()}
            />
          ) : auditQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-11 rounded-lg" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={FileClock}
              title="Aucun événement"
              description="Aucun événement ne correspond à ces filtres."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden lg:table-cell">Élément</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setSelected(log)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelected(log);
                    }}
                  >
                    <TableCell className="whitespace-nowrap text-[11px] text-muted">
                      {formatDateTime(log.occurred_at)}
                    </TableCell>
                    <TableCell className="text-xs">{log.actor_label ?? "Système"}</TableCell>
                    <TableCell className="text-xs">{humanize(log.module)}</TableCell>
                    <TableCell className="font-mono text-[10px] text-muted">{log.action}</TableCell>
                    <TableCell className="hidden max-w-48 truncate text-xs text-muted lg:table-cell">
                      {log.entity_label ?? log.entity_id ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={log.status === "success" ? "success" : "danger"}>
                        {log.status === "success" ? "Succès" : "Échec"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {auditQuery.data && auditQuery.data.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
            <span>
              Page {auditQuery.data.page} sur {auditQuery.data.pages} · {auditQuery.data.total} événement(s)
            </span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Précédent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= auditQuery.data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Événement d'audit #{selected?.id}</DialogTitle>
            <DialogDescription>
              {selected ? `${formatDateTime(selected.occurred_at)} · ${selected.actor_label ?? "Système"}` : ""}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4">
              <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                <p><span className="text-muted-2">Module :</span> {humanize(selected.module)}</p>
                <p><span className="text-muted-2">Action :</span> <span className="font-mono">{selected.action}</span></p>
                <p><span className="text-muted-2">Élément :</span> {selected.entity_label ?? selected.entity_id ?? "—"}</p>
                <p><span className="text-muted-2">Statut :</span> {selected.status}</p>
                <p><span className="text-muted-2">Source :</span> {selected.source}</p>
                <p><span className="text-muted-2">IP :</span> {selected.ip ?? "—"}</p>
                <p className="sm:col-span-2"><span className="text-muted-2">Requête :</span> <span className="font-mono">{selected.request_id ?? "—"}</span></p>
                <p className="sm:col-span-2 truncate"><span className="text-muted-2">Agent :</span> {selected.user_agent ?? "—"}</p>
              </div>
              <JsonBlock label="Valeurs avant" value={selected.before_json} />
              <JsonBlock label="Valeurs après" value={selected.after_json} />
              <JsonBlock label="Différentiel" value={selected.diff_json} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
