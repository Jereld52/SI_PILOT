import { useQuery } from "@tanstack/react-query";
import {
  Archive,
  BookOpen,
  Download,
  FileUp,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
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
import { DocumentDialog, UploadVersionDialog } from "@/features/documents/DocumentDialogs";
import { ApiError, apiFetch, buildQuery } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/utils";
import type { DocumentCategoryItem, DocumentItem } from "@/types/api";

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  published: "Publié",
  archived: "Archivé",
};

const statusTones: Record<string, "neutral" | "success" | "warning"> = {
  draft: "warning",
  published: "success",
  archived: "neutral",
};

function formatBytes(value: number | null | undefined): string {
  if (!value) return "—";
  const units = ["o", "Ko", "Mo", "Go"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function DocumentsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("documents.create");
  const canEdit = hasPermission("documents.update");
  const canDelete = hasPermission("documents.delete");
  const canDownload = hasPermission("documents.download");

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const query = searchParams.get("q");
    if (query) setSearch(query);
  }, [searchParams]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentItem | null>(null);
  const [uploadTarget, setUploadTarget] = useState<DocumentItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DocumentItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ["documents", deferredSearch, categoryFilter, statusFilter],
    queryFn: () =>
      apiFetch<DocumentItem[]>(
        `/documents${buildQuery({
          q: deferredSearch,
          category_id: categoryFilter,
          status: statusFilter,
        })}`,
      ),
  });
  const categoriesQuery = useQuery({
    queryKey: ["documents", "meta"],
    queryFn: () => apiFetch<DocumentCategoryItem[]>("/documents/meta"),
    staleTime: 60_000,
  });

  const documents = documentsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const published = documents.filter((item) => item.status === "published");
  const withFile = documents.filter((item) => item.current_version);

  const refresh = () => void documentsQuery.refetch();

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await apiFetch(`/documents/${archiveTarget.id}`, { method: "DELETE" });
      toast.success("Document archivé. Les versions restent conservées.");
      setArchiveTarget(null);
      refresh();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Archivage impossible.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Base de connaissances"
        title="Documentation"
        description="Procédures, guides, fiches techniques, versions et fichiers associés."
        actions={
          canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Nouveau document
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Documents</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(documents.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Publiés</p>
          <p className="mt-1 text-2xl font-semibold text-success">
            {formatNumber(published.length)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-2">Avec fichier</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(withFile.length)}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un document…"
              className="pl-8"
              aria-label="Rechercher un document"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="sm:w-52"
              aria-label="Filtrer par catégorie"
            >
              <option value="">Toutes les catégories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="sm:w-40"
              aria-label="Filtrer par statut"
            >
              <option value="">Tous les statuts</option>
              <option value="draft">Brouillons</option>
              <option value="published">Publiés</option>
              <option value="archived">Archivés</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {documentsQuery.isError ? (
            <ErrorState
              message={
                documentsQuery.error instanceof Error
                  ? documentsQuery.error.message
                  : "Erreur inconnue."
              }
              onRetry={() => void documentsQuery.refetch()}
            />
          ) : documentsQuery.isLoading ? (
            <div className="space-y-1 px-2 pb-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Aucun document"
              description="Ajoutez vos procédures et guides, puis déposez les fichiers et leurs versions."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="hidden lg:table-cell">Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Version</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden xl:table-cell">Mis à jour</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell>
                      <p className="text-xs font-medium text-foreground">{document.title}</p>
                      <p className="text-[10px] text-muted-2">
                        {document.tags.length > 0 ? document.tags.join(" · ") : "Sans tag"}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {document.category?.name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {document.doc_type ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {document.current_version ? (
                        <span>
                          v{document.current_version.version_number} ·{" "}
                          {formatBytes(document.current_version.size_bytes)}
                        </span>
                      ) : (
                        "Aucun fichier"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTones[document.status] ?? "neutral"}>
                        {statusLabels[document.status] ?? document.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {formatDateTime(document.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canDownload && document.current_version ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Télécharger ${document.title}`}
                            onClick={() =>
                              window.open(
                                `/api/v1/documents/versions/${document.current_version?.id}/download`,
                                "_blank",
                              )
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canCreate ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ajouter une version à ${document.title}`}
                            onClick={() => setUploadTarget(document)}
                          >
                            <FileUp className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canEdit ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Modifier ${document.title}`}
                            onClick={() => {
                              setEditing(document);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        {canDelete && document.status !== "archived" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Archiver ${document.title}`}
                            onClick={() => setArchiveTarget(document)}
                          >
                            <Archive className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DocumentDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        document={editing}
        categories={categories}
        onSaved={refresh}
      />
      <UploadVersionDialog
        open={Boolean(uploadTarget)}
        onOpenChange={(open) => !open && setUploadTarget(null)}
        document={uploadTarget}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archiver ce document ?"
        description={`« ${archiveTarget?.title ?? ""} » sera archivé. Les fichiers et versions sont conservés.`}
        confirmLabel="Archiver"
        tone="danger"
        loading={archiving}
        onConfirm={() => void archive()}
      />
    </div>
  );
}
