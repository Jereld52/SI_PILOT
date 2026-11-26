import { Sparkles } from "lucide-react";
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/AuthProvider";
import { useModules } from "@/features/modules/ModulesProvider";
import { ApiError, apiFetch } from "@/lib/api";
import type { AiComposeRequest, AiComposeResponse } from "@/types/api";

interface AiTextSuggestionButtonProps {
  kind: AiComposeRequest["kind"];
  field: AiComposeRequest["field"];
  title?: string;
  value?: string;
  context?: string;
  onApply: (text: string) => void;
  label?: string;
  instructions?: string;
  disabled?: boolean;
}

export function AiTextSuggestionButton({
  kind,
  field,
  title,
  value,
  context,
  onApply,
  label = "Suggestion IA",
  instructions,
  disabled = false,
}: AiTextSuggestionButtonProps) {
  const { hasPermission } = useAuth();
  const { isEnabled } = useModules();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState("");
  const [tone, setTone] = useState<AiComposeRequest["tone"]>("professional");
  const [length, setLength] = useState<AiComposeRequest["length"]>("medium");

  if (!hasPermission("ai.use") || !isEnabled("ai")) return null;

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<AiComposeResponse>("/ai/compose", {
        method: "POST",
        body: JSON.stringify({
          kind,
          field,
          title: title?.trim() || null,
          current: value?.trim() || null,
          context: context?.trim() || null,
          tone,
          length,
          instructions: instructions || null,
        }),
      });
      setSuggestion(response.text);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Impossible de générer une suggestion.",
      );
    } finally {
      setLoading(false);
    }
  };

  const open = () => {
    setDialogOpen(true);
    setSuggestion("");
    void generate();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={open}
        className="h-7 gap-1 px-2 text-[10px] text-accent hover:text-accent"
        title="Générer un texte avec l'IA à partir du titre et du contexte"
      >
        <Sparkles className="h-3 w-3" />
        {label}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Suggestion IA
            </DialogTitle>
            <DialogDescription>
              Texte généré à partir du titre et des informations déjà saisies. Vous pouvez
              le modifier avant de l'utiliser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {error ? (
              <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="ai-suggestion-tone">Ton</Label>
                <Select
                  id="ai-suggestion-tone"
                  value={tone}
                  onChange={(event) =>
                    setTone(event.target.value as AiComposeRequest["tone"])
                  }
                >
                  <option value="professional">Professionnel</option>
                  <option value="friendly">Chaleureux</option>
                  <option value="direct">Direct</option>
                  <option value="technical">Technique</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ai-suggestion-length">Longueur</Label>
                <Select
                  id="ai-suggestion-length"
                  value={length}
                  onChange={(event) =>
                    setLength(event.target.value as AiComposeRequest["length"])
                  }
                >
                  <option value="short">Courte</option>
                  <option value="medium">Moyenne</option>
                  <option value="long">Détaillée</option>
                </Select>
              </div>
            </div>
            <Textarea
              value={suggestion}
              onChange={(event) => setSuggestion(event.target.value)}
              rows={10}
              placeholder={loading ? "Génération en cours…" : "La suggestion apparaîtra ici."}
              disabled={loading}
              className="min-h-[220px] text-sm"
            />
            <p className="text-[10px] leading-4 text-muted-2">
              Vérifiez toujours les faits, dates, noms et montants avant d'utiliser le
              texte. L'IA ne doit pas inventer d'information.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              loading={loading}
              onClick={() => void generate()}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Régénérer
            </Button>
            <Button
              type="button"
              disabled={!suggestion.trim() || loading}
              onClick={() => {
                onApply(suggestion.trim());
                setDialogOpen(false);
                toast.success("Suggestion appliquée.");
              }}
            >
              Utiliser ce texte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
