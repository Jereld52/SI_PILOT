import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileSpreadsheet,
  KeyRound,
  MonitorSmartphone,
  Server,
  Smartphone,
  Truck,
  Upload,
  Users,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/features/auth/AuthProvider";
import { ImportDialog } from "@/features/imports/ImportDialog";
import { apiFetch } from "@/lib/api";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";
import type { ImportJob } from "@/types/api";

type ImportType =
  | "agents"
  | "assets"
  | "mobile_lines"
  | "suppliers"
  | "licenses"
  | "infrastructure";

const importTypes: {
  type: ImportType;
  label: string;
  description: string;
  icon: typeof Users;
  tone: string;
}[] = [
  {
    type: "agents",
    label: "Agents",
    description: "Annuaire des agents, services, sites et identifiants.",
    icon: Users,
    tone: "border-primary/35 bg-primary/10 text-primary-strong",
  },
  {
    type: "assets",
    label: "Parc informatique",
    description: "CSV standard ou export WAPT reconnu automatiquement.",
    icon: MonitorSmartphone,
    tone: "border-accent/30 bg-accent/10 text-accent",
  },
  {
    type: "mobile_lines",
    label: "Lignes mobiles",
    description: "CSV ou XLSX, avec chiffrement des PIN/PUK à l'import.",
    icon: Smartphone,
    tone: "border-success/30 bg-success/10 text-success",
  },
  {
    type: "suppliers",
    label: "Fournisseurs",
    description: "Coordonnées, SIRET, contacts et notes.",
    icon: Truck,
    tone: "border-warning/30 bg-warning/10 text-warning",
  },
  {
    type: "licenses",
    label: "Licences",
    description: "Éditeurs, sièges, échéances et coûts annuels.",
    icon: KeyRound,
    tone: "border-info/30 bg-info/10 text-info",
  },
  {
    type: "infrastructure",
    label: "Infrastructure",
    description: "Serveurs, VM et équipements réseau avec IP et OS.",
    icon: Server,
    tone: "border-danger/30 bg-danger/10 text-danger",
  },
];

const entityLabels: Record<string, string> = {
  agents: "Agents",
  assets: "Parc",
  mobile_lines: "Lignes mobiles",
  suppliers: "Fournisseurs",
  licenses: "Licences",
  infrastructure: "Infrastructure",
  rdm: "Remote Desktop Manager",
  ldap: "Active Directory",
};

const importTitles: Record<ImportType, string> = {
  agents: "agents",
  assets: "équipements",
  mobile_lines: "lignes mobiles",
  suppliers: "fournisseurs",
  licenses: "licences",
  infrastructure: "équipements d'infrastructure",
};

const statusTones: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  applied: "success",
  partial: "warning",
  preview: "info",
  uploaded: "neutral",
  error: "danger",
};

export function ImportsPage() {
  const { hasPermission } = useAuth();
  const canPreview = hasPermission("imports.preview");

  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<ImportType>("agents");
  const [importLabel, setImportLabel] = useState("agents");

  const historyQuery = useQuery({
    queryKey: ["imports", "history"],
    queryFn: () => apiFetch<ImportJob[]>("/imports"),
  });

  const history = historyQuery.data ?? [];
  const lastImport = history[0];
  const totalCreated = history.reduce((sum, job) => sum + job.valid_rows, 0);

  const openImport = (type: ImportType) => {
    setImportType(type);
    setImportLabel(importTitles[type]);
    setImportOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Alimentation de la base"
        title="Imports de fichiers"
        description="Import CSV/XLSX avec prévisualisation, détection des doublons, rapport d'erreurs et historique."
        actions={
          canPreview ? (
            <Button size="sm" onClick={() => openImport("agents")}>
              <Upload className="h-3.5 w-3.5" />
              Nouvel import
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Imports réalisés</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(history.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Éléments traités</p>
          <p className="mt-1 text-2xl font-semibold text-success">{formatNumber(totalCreated)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Dernier import</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {lastImport ? entityLabels[lastImport.entity_type] ?? lastImport.entity_type : "—"}
          </p>
          <p className="text-[10px] text-muted-2">
            {lastImport ? formatDateTime(lastImport.created_at) : "Aucun import"}
          </p>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {importTypes.map((item) => (
          <Card key={item.type} className="panel-sheen flex flex-col border-primary/20 p-4">
            <div className="flex items-start gap-3">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", item.tone)}>
                <item.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-muted">{item.description}</p>
              </div>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <Button size="sm" onClick={() => openImport(item.type)}>
                <Upload className="h-3.5 w-3.5" />
                Importer
              </Button>
              <a
                href={`/api/v1/imports/templates/${item.type}`}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                <Download className="h-3.5 w-3.5" />
                Modèle
              </a>
            </div>
          </Card>
        ))}
      </div>

      <Card className="panel-sheen border-primary/20">
        <CardHeader>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Historique des imports</h2>
            <p className="mt-1 text-xs text-muted">
              Chaque fichier est prévisualisé avant application. Les rapports d'erreurs sont conservés.
            </p>
          </div>
          <Badge tone="neutral">{formatNumber(history.length)}</Badge>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {historyQuery.isError ? (
            <ErrorState
              message={
                historyQuery.error instanceof Error ? historyQuery.error.message : "Erreur inconnue."
              }
              onRetry={() => void historyQuery.refetch()}
            />
          ) : historyQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="Aucun import"
              description="Les imports de fichiers apparaîtront ici."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Lignes</TableHead>
                  <TableHead className="hidden xl:table-cell">Appliqué</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="text-xs text-muted">{formatDateTime(job.created_at)}</TableCell>
                    <TableCell className="text-xs text-foreground">
                      {entityLabels[job.entity_type] ?? job.entity_type}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted">
                      {job.original_filename}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[job.status] ?? "neutral"}>{job.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {job.total_rows} · {job.valid_rows} valides · {job.error_rows} erreurs
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {job.applied_at ? formatDateTime(job.applied_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-primary/25 bg-primary/10 px-4 py-3 text-[11px] text-muted">
        La connexion Active Directory et l'import Remote Desktop Manager se configurent dans{" "}
        <span className="font-medium text-primary-strong">Administration → Sources de données</span>.
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entityType={importType}
        entityLabel={importLabel}
        onImported={() => void historyQuery.refetch()}
      />
    </div>
  );
}
