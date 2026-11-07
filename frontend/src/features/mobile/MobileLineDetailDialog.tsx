import { Eye, EyeOff, KeyRound, Phone, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError, apiFetch } from "@/lib/api";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils";
import type { MobileLineItem, MobileSecrets } from "@/types/api";

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-0.5 break-words text-xs text-foreground">{value ?? "—"}</p>
    </div>
  );
}

const emptySecrets: MobileSecrets = { pin_1: null, pin_2: null, puk_1: null, puk_2: null };

interface MobileLineDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: MobileLineItem | null;
}

export function MobileLineDetailDialog({ open, onOpenChange, line }: MobileLineDetailDialogProps) {
  const { hasPermission } = useAuth();
  const canReadSecrets = hasPermission("mobile_lines.secrets.read");
  const canManageSecrets = hasPermission("mobile_lines.secrets.manage");
  const [secrets, setSecrets] = useState<MobileSecrets>(emptySecrets);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSecrets(emptySecrets);
      setRevealed(false);
      setEditing(false);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  const loadSecrets = async () => {
    if (!line) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<MobileSecrets>(`/mobile-lines/${line.id}/secrets`);
      setSecrets(data);
      setRevealed(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Impossible de lire les codes.");
    } finally {
      setLoading(false);
    }
  };

  const saveSecrets = async () => {
    if (!line) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/mobile-lines/${line.id}/secrets`, {
        method: "PUT",
        body: JSON.stringify(secrets),
      });
      toast.success("Codes PIN/PUK enregistrés et chiffrés.");
      setEditing(false);
      setRevealed(true);
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
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-accent" aria-hidden="true" />
            {line ? formatPhone(line.line_number) : "Ligne mobile"}
            {line?.is_secondary_line ? <Badge tone="info">Secondaire</Badge> : null}
            {line?.has_secrets ? <Badge tone="warning">Codes disponibles</Badge> : null}
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
              <Field label="RIO" value={line.rio} />
              <Field label="EID" value={line.eid} />
              <Field label="N° CSIM" value={line.csim_number} />
              <Field label="QR de carte SIM" value={line.qr_code} />
            </div>

            {canReadSecrets ? (
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary-strong" aria-hidden="true" />
                    <div>
                      <p className="text-xs font-medium text-foreground">Codes PIN / PUK</p>
                      <p className="text-[10px] text-muted-2">
                        Chiffrés au repos. Chaque consultation est journalisée.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!revealed ? (
                      <Button variant="secondary" size="sm" loading={loading} onClick={() => void loadSecrets()}>
                        <Eye className="h-3.5 w-3.5" />
                        Afficher
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setRevealed(false)}>
                        <EyeOff className="h-3.5 w-3.5" />
                        Masquer
                      </Button>
                    )}
                    {canManageSecrets && revealed ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditing((value) => !value)}>
                        {editing ? "Annuler" : "Modifier"}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {error ? <p className="mt-2 text-[11px] text-danger">{error}</p> : null}

                {revealed ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["PIN 1", "pin_1"],
                        ["PIN 2", "pin_2"],
                        ["PUK 1", "puk_1"],
                        ["PUK 2", "puk_2"],
                      ] as Array<[string, keyof MobileSecrets]>
                    ).map(([label, key]) => (
                      <div key={key}>
                        <Label htmlFor={`secret-${key}`}>{label}</Label>
                        {editing ? (
                          <Input
                            id={`secret-${key}`}
                            value={secrets[key] ?? ""}
                            onChange={(event) =>
                              setSecrets((current) => ({ ...current, [key]: event.target.value }))
                            }
                            autoComplete="off"
                          />
                        ) : (
                          <p className="rounded-lg border border-border-soft bg-background-soft px-3 py-2 font-mono text-xs text-foreground">
                            {secrets[key] || "—"}
                          </p>
                        )}
                      </div>
                    ))}
                    {editing ? (
                      <div className="sm:col-span-2">
                        <Button size="sm" loading={loading} onClick={() => void saveSecrets()}>
                          <Save className="h-3.5 w-3.5" />
                          Enregistrer les codes
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 font-mono text-xs text-muted">•••• •••• •••• ••••</p>
                )}
              </div>
            ) : null}

            {line.notes ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{line.notes}</p>
              </div>
            ) : null}

            <p className="text-[10px] leading-4 text-muted-2">
              Les codes PIN et PUK sont chiffrés dans la base. Les identifiants EID, CSIM et RIO
              sont conservés pour la gestion de la carte SIM.
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
