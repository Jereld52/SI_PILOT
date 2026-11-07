import { Phone } from "lucide-react";

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
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";
import type { MobileLineItem } from "@/types/api";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-0.5 text-xs text-foreground">{value ?? "—"}</p>
    </div>
  );
}

interface MobileLineDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: MobileLineItem | null;
}

export function MobileLineDetailDialog({ open, onOpenChange, line }: MobileLineDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-accent" aria-hidden="true" />
            {line ? formatPhone(line.line_number) : "Ligne mobile"}
            {line?.is_secondary_line ? <Badge tone="info">Secondaire</Badge> : null}
          </DialogTitle>
          <DialogDescription>
            {line?.holder_name ?? "Titulaire non renseigné"}
            {line?.role_label ? ` · ${line.role_label}` : ""}
          </DialogDescription>
        </DialogHeader>

        {line ? (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-border-soft bg-background-soft/60 p-3 sm:grid-cols-3">
              <Field label="Statut" value={line.status} />
              <Field label="Forfait" value={line.plan_name} />
              <Field label="Type d'offre" value={line.offer_type} />
              <Field label="Date de mise en service" value={formatDate(line.activation_date)} />
              <Field label="Fin d'engagement" value={formatDate(line.commitment_end_date)} />
              <Field label="Hors-forfait" value={line.out_of_bundle != null ? formatCurrency(line.out_of_bundle) : "—"} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Civilité" value={line.civility} />
              <Field label="E-mail" value={line.email} />
              <Field label="SIREN" value={line.siren} />
              <Field label="Raison sociale" value={line.company_name} />
              <Field label="N° de contrat" value={line.contract_number} />
              <Field label="N° titulaire" value={line.titulaire_number} />
              <Field label="N° CF" value={line.cf_number} />
              <Field label="Nom CF" value={line.cf_name} />
              <Field label="Identifiant VPN" value={line.vpn_identifier} />
              <Field label="Numéro privé" value={line.private_number ? formatPhone(line.private_number) : "—"} />
              <Field label="Ligne principale" value={line.main_line_number ? formatPhone(line.main_line_number) : "—"} />
              <Field label="Master ID Accès" value={line.master_access_id} />
            </div>

            <div className="grid gap-3 rounded-lg border border-border-soft bg-background-soft/60 p-3 sm:grid-cols-3">
              <Field label="Terminal" value={line.terminal_communicating ?? line.terminal_purchased} />
              <Field label="IMEI" value={line.imei_communicating ?? line.imei_purchased} />
              <Field label="Format SIM" value={line.sim_format} />
              <Field label="Date de facturation" value={formatDate(line.billing_date)} />
              <Field label="Portage" value={formatDate(line.portability_date)} />
              <Field label="Changement de terminal" value={formatDate(line.terminal_change_date)} />
              <Field label="Modification du forfait" value={formatDate(line.plan_change_date)} />
              <Field label="Id société" value={line.company_id} />
            </div>

            {line.notes ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{line.notes}</p>
              </div>
            ) : null}

            <p className="text-[10px] leading-4 text-muted-2">
              Les codes PIN, PUK, EID, CSIM et QR de carte SIM ne sont jamais stockés dans
              l'application.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
