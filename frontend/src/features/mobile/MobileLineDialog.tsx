import { useEffect, useState } from "react";
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
import type { MobileLineItem } from "@/types/api";

interface MobileLineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: MobileLineItem | null;
  onSaved: () => void;
}

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function MobileLineDialog({ open, onOpenChange, line, onSaved }: MobileLineDialogProps) {
  const editing = Boolean(line);
  const [lineNumber, setLineNumber] = useState("");
  const [civility, setCivility] = useState("");
  const [holderName, setHolderName] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("Actif");
  const [siren, setSiren] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [titulaireNumber, setTitulaireNumber] = useState("");
  const [cfNumber, setCfNumber] = useState("");
  const [cfName, setCfName] = useState("");
  const [activationDate, setActivationDate] = useState("");
  const [commitmentEndDate, setCommitmentEndDate] = useState("");
  const [planName, setPlanName] = useState("");
  const [offerType, setOfferType] = useState("");
  const [terminal, setTerminal] = useState("");
  const [imei, setImei] = useState("");
  const [simFormat, setSimFormat] = useState("");
  const [vpnIdentifier, setVpnIdentifier] = useState("");
  const [privateNumber, setPrivateNumber] = useState("");
  const [mainLineNumber, setMainLineNumber] = useState("");
  const [isSecondary, setIsSecondary] = useState(false);
  const [outOfBundle, setOutOfBundle] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLineNumber(line?.line_number ?? "");
    setCivility(line?.civility ?? "");
    setHolderName(line?.holder_name ?? "");
    setRoleLabel(line?.role_label ?? "");
    setEmail(line?.email ?? "");
    setStatus(line?.status ?? "Actif");
    setSiren(line?.siren ?? "");
    setCompanyName(line?.company_name ?? "");
    setContractNumber(line?.contract_number ?? "");
    setTitulaireNumber(line?.titulaire_number ?? "");
    setCfNumber(line?.cf_number ?? "");
    setCfName(line?.cf_name ?? "");
    setActivationDate(line?.activation_date ?? "");
    setCommitmentEndDate(line?.commitment_end_date ?? "");
    setPlanName(line?.plan_name ?? "");
    setOfferType(line?.offer_type ?? "");
    setTerminal(line?.terminal_communicating ?? line?.terminal_purchased ?? "");
    setImei(line?.imei_communicating ?? line?.imei_purchased ?? "");
    setSimFormat(line?.sim_format ?? "");
    setVpnIdentifier(line?.vpn_identifier ?? "");
    setPrivateNumber(line?.private_number ?? "");
    setMainLineNumber(line?.main_line_number ?? "");
    setIsSecondary(line?.is_secondary_line ?? false);
    setOutOfBundle(
      line?.out_of_bundle != null ? String(line.out_of_bundle) : "",
    );
    setNotes(line?.notes ?? "");
    setError(null);
  }, [open, line]);

  const submit = async () => {
    if (!lineNumber.trim() && !editing) {
      setError("Le numéro de ligne est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);
    const payload = {
      civility: nullable(civility),
      holder_name: nullable(holderName),
      role_label: nullable(roleLabel),
      email: nullable(email),
      status: status.trim() || "Actif",
      siren: nullable(siren),
      company_name: nullable(companyName),
      contract_number: nullable(contractNumber),
      titulaire_number: nullable(titulaireNumber),
      cf_number: nullable(cfNumber),
      cf_name: nullable(cfName),
      activation_date: activationDate || null,
      commitment_end_date: commitmentEndDate || null,
      plan_name: nullable(planName),
      offer_type: nullable(offerType),
      terminal_communicating: nullable(terminal),
      imei_communicating: nullable(imei),
      sim_format: nullable(simFormat),
      vpn_identifier: nullable(vpnIdentifier),
      private_number: nullable(privateNumber),
      main_line_number: nullable(mainLineNumber),
      is_secondary_line: isSecondary,
      out_of_bundle: outOfBundle ? Number(outOfBundle.replace(",", ".")) : null,
      notes: nullable(notes),
      ...(editing ? {} : { line_number: lineNumber.trim() }),
    };
    try {
      if (line) {
        await apiFetch(`/mobile-lines/${line.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Ligne mobile mise à jour.");
      } else {
        await apiFetch("/mobile-lines", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Ligne mobile créée.");
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
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier la ligne mobile" : "Nouvelle ligne mobile"}</DialogTitle>
          <DialogDescription>
            Les codes PIN/PUK se gèrent depuis la fiche détaillée, avec les permissions dédiées.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {error ? (
            <p className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="mobile-line-number">Numéro de ligne</Label>
              <Input
                id="mobile-line-number"
                value={lineNumber}
                onChange={(event) => setLineNumber(event.target.value)}
                disabled={editing}
                placeholder="06 12 34 56 78"
              />
            </div>
            <div>
              <Label htmlFor="mobile-civility">Civilité</Label>
              <Input
                id="mobile-civility"
                value={civility}
                onChange={(event) => setCivility(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-status">Statut</Label>
              <Select
                id="mobile-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="Actif">Actif</option>
                <option value="Suspendu">Suspendu</option>
                <option value="Résilié">Résilié</option>
                <option value="En attente">En attente</option>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mobile-holder">Titulaire</Label>
              <Input
                id="mobile-holder"
                value={holderName}
                onChange={(event) => setHolderName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-role">Fonction</Label>
              <Input
                id="mobile-role"
                value={roleLabel}
                onChange={(event) => setRoleLabel(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mobile-email">E-mail</Label>
              <Input
                id="mobile-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-plan">Forfait</Label>
              <Input
                id="mobile-plan"
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="mobile-siren">SIREN</Label>
              <Input id="mobile-siren" value={siren} onChange={(event) => setSiren(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="mobile-company">Société</Label>
              <Input
                id="mobile-company"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-contract">N° contrat</Label>
              <Input
                id="mobile-contract"
                value={contractNumber}
                onChange={(event) => setContractNumber(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-titulaire">N° titulaire</Label>
              <Input
                id="mobile-titulaire"
                value={titulaireNumber}
                onChange={(event) => setTitulaireNumber(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-cf">N° CF</Label>
              <Input id="mobile-cf" value={cfNumber} onChange={(event) => setCfNumber(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="mobile-cf-name">Nom CF</Label>
              <Input id="mobile-cf-name" value={cfName} onChange={(event) => setCfName(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="mobile-activation">Mise en service</Label>
              <Input
                id="mobile-activation"
                type="date"
                value={activationDate}
                onChange={(event) => setActivationDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-commitment">Fin d'engagement</Label>
              <Input
                id="mobile-commitment"
                type="date"
                value={commitmentEndDate}
                onChange={(event) => setCommitmentEndDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-offer">Type d'offre</Label>
              <Input
                id="mobile-offer"
                value={offerType}
                onChange={(event) => setOfferType(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-terminal">Terminal</Label>
              <Input id="mobile-terminal" value={terminal} onChange={(event) => setTerminal(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="mobile-imei">IMEI</Label>
              <Input id="mobile-imei" value={imei} onChange={(event) => setImei(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="mobile-sim">Format SIM</Label>
              <Input id="mobile-sim" value={simFormat} onChange={(event) => setSimFormat(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="mobile-vpn">Identifiant VPN</Label>
              <Input
                id="mobile-vpn"
                value={vpnIdentifier}
                onChange={(event) => setVpnIdentifier(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-private">Numéro privé</Label>
              <Input
                id="mobile-private"
                value={privateNumber}
                onChange={(event) => setPrivateNumber(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="mobile-out">Hors-forfait (EUR)</Label>
              <Input
                id="mobile-out"
                inputMode="decimal"
                value={outOfBundle}
                onChange={(event) => setOutOfBundle(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mobile-main-line">Ligne principale</Label>
              <Input
                id="mobile-main-line"
                value={mainLineNumber}
                onChange={(event) => setMainLineNumber(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={isSecondary}
                  onChange={(event) => setIsSecondary(event.target.checked)}
                  className="h-4 w-4 accent-[var(--color-primary-strong)]"
                />
                Ligne secondaire
              </label>
            </div>
          </div>
          <div>
            <Label htmlFor="mobile-notes">Notes</Label>
            <Textarea
              id="mobile-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button loading={loading} onClick={() => void submit()}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
