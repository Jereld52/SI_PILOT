import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Phone,
  Search,
  Upload,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ImportDialog } from "@/features/imports/ImportDialog";
import { MobileLineDetailDialog } from "@/features/mobile/MobileLineDetailDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { apiFetch, buildQuery } from "@/lib/api";
import { formatDate, formatPhone } from "@/lib/utils";
import type { MobileLineItem, Page } from "@/types/api";

const statusTones: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  Actif: "success",
  Suspendu: "warning",
  Résilié: "danger",
  Resilié: "danger",
};

export function MobileLinesPage() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [secondary, setSecondary] = useState("");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<MobileLineItem | null>(null);

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, status, plan, secondary]);

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const query = searchParams.get("q");
    if (query) setSearch(query);
  }, [searchParams]);

  const metaQuery = useQuery({
    queryKey: ["mobile-lines", "meta"],
    queryFn: () => apiFetch<{ statuses: string[]; plans: string[] }>("/mobile-lines/meta"),
    staleTime: 60_000,
  });
  const linesQuery = useQuery({
    queryKey: ["mobile-lines", { page, q: deferredSearch, status, plan, secondary }],
    queryFn: () =>
      apiFetch<Page<MobileLineItem>>(
        `/mobile-lines${buildQuery({
          page,
          page_size: 25,
          q: deferredSearch,
          status,
          plan,
          secondary: secondary === "" ? undefined : secondary === "true",
        })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const lines = linesQuery.data?.items ?? [];
  const canImport = hasPermission("imports.preview");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Téléphonie"
        title="Lignes mobiles"
        description="Inventaire des lignes, titulaires, forfaits, terminaux et engagements."
        actions={
          <>
            {hasPermission("exports.run") ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    Exporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => window.open("/api/v1/exports/mobile-lines?format=xlsx", "_blank")}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel détaillé (XLSX)
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => window.open("/api/v1/exports/mobile-lines?format=pdf", "_blank")}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Synthèse PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => window.open("/exports?dataset=mobile_lines", "_self")}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export sur mesure…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canImport ? (
              <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" />
                Importer
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <CardHeader className="flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Numéro, titulaire, forfait, IMEI…"
              className="pl-8"
              aria-label="Rechercher une ligne mobile"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filtrer par statut"
              className="sm:w-36"
            >
              <option value="">Tous les statuts</option>
              {(metaQuery.data?.statuses ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
              aria-label="Filtrer par forfait"
              className="sm:w-64"
            >
              <option value="">Tous les forfaits</option>
              {(metaQuery.data?.plans ?? []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <Select
              value={secondary}
              onChange={(event) => setSecondary(event.target.value)}
              aria-label="Filtrer par type de ligne"
              className="sm:w-44"
            >
              <option value="">Toutes les lignes</option>
              <option value="false">Principales</option>
              <option value="true">Secondaires</option>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0 pt-3">
          {linesQuery.isError ? (
            <ErrorState
              message={linesQuery.error instanceof Error ? linesQuery.error.message : "Erreur inconnue."}
              onRetry={() => void linesQuery.refetch()}
            />
          ) : linesQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : lines.length === 0 ? (
            <EmptyState
              icon={Phone}
              title="Aucune ligne mobile"
              description="Importez votre fichier lignes_mobiles.xlsx ou créez une ligne."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ligne</TableHead>
                  <TableHead>Titulaire</TableHead>
                  <TableHead className="hidden lg:table-cell">Fonction</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden xl:table-cell">Forfait</TableHead>
                  <TableHead className="hidden xl:table-cell">Terminal</TableHead>
                  <TableHead className="hidden lg:table-cell">Fin engagement</TableHead>
                  <TableHead className="w-10 text-right">Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-foreground">
                      {formatPhone(line.line_number)}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{line.holder_name ?? "—"}</p>
                      <p className="text-[10px] text-muted-2">{line.email ?? "—"}</p>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {line.role_label ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[line.status] ?? "neutral"}>{line.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-56 truncate text-xs text-muted xl:table-cell">
                      {line.plan_name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-48 truncate text-xs text-muted xl:table-cell">
                      {line.terminal_communicating ?? line.terminal_purchased ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {formatDate(line.commitment_end_date)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Détail de la ligne ${formatPhone(line.line_number)}`}
                        onClick={() => setSelected(line)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {linesQuery.data && linesQuery.data.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-border-soft px-4 py-2.5 text-[11px] text-muted">
            <span>
              Page {linesQuery.data.page} sur {linesQuery.data.pages} · {linesQuery.data.total} ligne(s)
            </span>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Précédent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= linesQuery.data.pages}
                onClick={() => setPage((value) => value + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType="mobile_lines"
        entityLabel="lignes mobiles"
        onImported={() => void linesQuery.refetch()}
      />

      <MobileLineDetailDialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        line={selected}
      />
    </div>
  );
}
