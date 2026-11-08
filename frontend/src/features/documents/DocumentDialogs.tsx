import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiFetch } from "@/lib/api";
import type { DocumentCategoryItem, DocumentItem } from "@/types/api";

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
      {message}
    </p>
  );
}

interface DocumentDialogProps extends BaseDialogProps {
  document: DocumentItem | null;
  categories: DocumentCategoryItem[];
}

export function DocumentDialog({
  open,
  onOpenChange,
  document,
  categories,
  onSaved,
}: DocumentDialogProps) {
  const editing = Boolean(document);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("procedure");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [status, setStatus] = useState("published");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(document?.title ?? "");
    setDocType(document?.doc_type ?? "procedure");
    setCategoryId(document?.category_id ?? "");
    setDescription(document?.description ?? "");
    setVisibility(document?.visibility ?? "all");
    setStatus(document?.status ?? "published");
    setTags((document?.tags ?? []).join(", "));
    setFile(null);
    setError(null);
  }, [open, document]);

  const doSubmit = async () => {
    if (!title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      title: title.trim(),
      doc_type: nullable(docType),
      category_id: categoryId || null,
      description: nullable(description),
      visibility,
      status,
      tags: tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    try {
      if (document) {
        await apiFetch(`/documents/${document.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Document mis à jour.");
      } else {
        const created = await apiFetch<{ id: string }>("/documents", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (file) {
          const form = new FormData();
          form.append("file", file);
          form.append("changelog", "Version initiale");
          await apiFetch(`/documents/${created.id}/versions`, {
            method: "POST",
            body: form,
          });
        }
        toast.success("Document créé.");
      }
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Enregistrement impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier le document" : "Nouveau document"}</DialogTitle>
          <DialogDescription>
            Métadonnées, classement, visibilité et fichier. Les versions sont conservées.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="document-title">Titre</Label>
              <Input
                id="document-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="document-type">Type</Label>
              <Select
                id="document-type"
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
              >
                <option value="procedure">Procédure</option>
                <option value="user_guide">Guide utilisateur</option>
                <option value="technical_sheet">Fiche technique</option>
                <option value="diagram">Schéma</option>
                <option value="configuration">Configuration</option>
                <option value="minutes">Compte rendu</option>
                <option value="supplier">Documentation fournisseur</option>
                <option value="security">Document sécurité</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="document-category">Catégorie</Label>
              <Select
                id="document-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Non classé</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="document-visibility">Visibilité</Label>
              <Select
                id="document-visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
              >
                <option value="all">Tous</option>
                <option value="module">Module</option>
                <option value="restricted">Restreint</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="document-status">Statut</Label>
              <Select
                id="document-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="draft">Brouillon</option>
                <option value="published">Publié</option>
                <option value="archived">Archivé</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="document-description">Description</Label>
            <Textarea
              id="document-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label htmlFor="document-tags">Tags (séparés par des virgules)</Label>
            <Input
              id="document-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="sécurité, réseau, procédure"
            />
          </div>
          {!editing ? (
            <div>
              <Label htmlFor="document-file">Fichier (facultatif)</Label>
              <Input
                id="document-file"
                ref={fileRef}
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-[10px] text-muted-2">
                Vous pourrez ajouter d'autres versions depuis la liste.
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void doSubmit()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UploadVersionDialogProps extends BaseDialogProps {
  document: DocumentItem | null;
}

export function UploadVersionDialog({
  open,
  onOpenChange,
  document,
  onSaved,
}: UploadVersionDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [changelog, setChangelog] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setChangelog("");
    setError(null);
  }, [open]);

  const doSubmit = async () => {
    if (!document || !file) {
      setError("Sélectionnez un fichier.");
      return;
    }
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (changelog.trim()) form.append("changelog", changelog.trim());
    try {
      await apiFetch(`/documents/${document.id}/versions`, {
        method: "POST",
        body: form,
      });
      toast.success("Nouvelle version ajoutée.");
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Envoi impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une version</DialogTitle>
          <DialogDescription>{document?.title ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <div>
            <Label htmlFor="version-file">Fichier</Label>
            <Input
              id="version-file"
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="version-changelog">Changelog</Label>
            <Textarea
              id="version-changelog"
              value={changelog}
              onChange={(event) => setChangelog(event.target.value)}
              rows={2}
              placeholder="Ce qui change dans cette version"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void doSubmit()}>
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
