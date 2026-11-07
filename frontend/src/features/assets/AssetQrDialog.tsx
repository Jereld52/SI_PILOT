import { Download, QrCode, RefreshCw } from "lucide-react";
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
import { apiFetch } from "@/lib/api";
import type { AssetItem } from "@/types/api";

interface AssetQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetItem | null;
  onRegenerated?: () => void;
}

export function AssetQrDialog({ open, onOpenChange, asset, onRegenerated }: AssetQrDialogProps) {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);

  const regenerate = async () => {
    if (!asset) return;
    setLoading(true);
    try {
      await apiFetch(`/assets/${asset.id}/qr/regenerate`, { method: "POST" });
      setVersion((value) => value + 1);
      toast.success("QR code régénéré. L'ancien QR ne pointe plus vers cette fiche.");
      onRegenerated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Régénération impossible.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-accent" aria-hidden="true" />
            QR code équipement
          </DialogTitle>
          <DialogDescription>
            {asset ? `${asset.name} — ${asset.asset_tag}` : ""}
            <br />
            Le scan ouvre la fiche après authentification. Aucun accès anonyme.
          </DialogDescription>
        </DialogHeader>

        {asset ? (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-xl border border-border bg-white p-3">
              <img
                src={`/api/v1/assets/${asset.id}/qr?v=${version}`}
                alt={`QR code ${asset.asset_tag}`}
                className="h-64 w-64 object-contain"
              />
            </div>
            <p className="font-mono text-[11px] text-muted">{asset.asset_tag}</p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
          <Button variant="secondary" loading={loading} onClick={() => void regenerate()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Régénérer
          </Button>
          {asset ? (
            <a
              href={`/api/v1/assets/${asset.id}/qr`}
              download={`qr-${asset.asset_tag}.png`}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" />
              Télécharger
            </a>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
