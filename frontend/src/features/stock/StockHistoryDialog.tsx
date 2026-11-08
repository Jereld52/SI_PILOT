import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { stockDirectionLabels, stockDirectionTones } from "@/features/stock/labels";
import { apiFetch } from "@/lib/api";
import { formatDateTime, formatNumber, fullName } from "@/lib/utils";
import type { StockItemDetailItem } from "@/types/api";

interface StockHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
}

export function StockHistoryDialog({ open, onOpenChange, itemId }: StockHistoryDialogProps) {
  const detailQuery = useQuery({
    queryKey: ["stock", "item", itemId],
    queryFn: () => apiFetch<StockItemDetailItem>(`/stock/items/${itemId}`),
    enabled: open && Boolean(itemId),
  });
  const item = detailQuery.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Historique des mouvements</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.reference} — ${item.name} · ${formatNumber(item.quantity)} ${item.unit}(s) en stock`
              : "Chargement…"}
          </DialogDescription>
        </DialogHeader>
        {detailQuery.isError ? (
          <ErrorState
            message={
              detailQuery.error instanceof Error ? detailQuery.error.message : "Erreur inconnue."
            }
            onRetry={() => void detailQuery.refetch()}
          />
        ) : detailQuery.isLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : item && item.movements.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mouvement</TableHead>
                  <TableHead>Quantité</TableHead>
                  <TableHead>Après</TableHead>
                  <TableHead className="hidden lg:table-cell">Motif</TableHead>
                  <TableHead className="hidden xl:table-cell">Bénéficiaire</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="text-xs text-muted">{formatDateTime(movement.moved_at)}</TableCell>
                    <TableCell>
                      <Badge tone={stockDirectionTones[movement.direction] ?? "neutral"}>
                        {stockDirectionLabels[movement.direction] ?? movement.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-foreground">
                      {movement.direction === "out" ? "−" : movement.direction === "in" ? "+" : "="}
                      {formatNumber(movement.quantity)}
                    </TableCell>
                    <TableCell className="text-xs text-foreground">
                      {movement.quantity_after != null ? formatNumber(movement.quantity_after) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted lg:table-cell">
                      {movement.reason ?? "—"}
                      {movement.reference ? ` · ${movement.reference}` : ""}
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted xl:table-cell">
                      {movement.recipient_agent
                        ? fullName(movement.recipient_agent.first_name, movement.recipient_agent.last_name)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={History}
            title="Aucun mouvement"
            description="Les entrées, sorties et ajustements apparaîtront ici."
          />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
