import { Cpu, Network, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";

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
import {
  assetConditionLabels,
  assetConditionTones,
  assetStatusLabels,
  assetStatusTones,
} from "@/features/assets/labels";
import { formatCurrency, formatDate, formatDateTime, humanize } from "@/lib/utils";
import type { AssetDetailItem } from "@/types/api";

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-2">{label}</p>
      <p className="mt-0.5 break-words text-xs text-foreground">{value || "—"}</p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border-soft bg-background-soft/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <p className="text-xs font-semibold text-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

const waptLabels: Record<string, string> = {
  statut: "Statut WAPT",
  joignable: "Joignable",
  machine: "Machine",
  adresse_ip: "Adresse IP",
  description: "Description",
  manufacteur: "Fabricant",
  plateforme: "Plateforme",
  systeme_d_exploitation: "Système d'exploitation",
  modele: "Modèle",
  numero_de_serie: "Numéro de série",
  derniere_connexion: "Dernière connexion",
  utilisateurs_logues: "Utilisateurs connectés",
  adresse_mac: "Adresse MAC",
  version_de_wapt: "Version WAPT",
  uuid: "UUID WAPT",
  n_commande_achat: "N° commande achat",
  date_d_achat: "Date d'achat",
  controleur_de_domaine: "Contrôleur de domaine",
  groupes: "Groupes",
  domaine: "Domaine",
  adresse_d_ecoute: "Adresse d'écoute",
  dn_dans_l_ad: "DN Active Directory",
  dernier_utilisateur_logue: "Dernier utilisateur",
  methode_d_enregistrement: "Méthode d'enregistrement",
  depots: "Dépôts",
  adresses_ip: "Adresses IP",
  est_depot_secondaire: "Dépôt secondaire",
};

function sourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface AssetDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetDetailItem | null;
}

export function AssetDetailDialog({ open, onOpenChange, asset }: AssetDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {asset?.name ?? "Équipement"}
            <Badge tone={asset ? assetStatusTones[asset.status] ?? "neutral" : "neutral"}>
              {asset ? assetStatusLabels[asset.status] ?? asset.status : "—"}
            </Badge>
            {asset ? (
              <Badge tone={assetConditionTones[asset.condition] ?? "neutral"}>
                {assetConditionLabels[asset.condition] ?? asset.condition}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {asset?.asset_tag} · {asset?.category.name}
            {asset?.is_critical ? " · équipement critique" : ""}
          </DialogDescription>
        </DialogHeader>

        {asset ? (
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
            <Section icon={<Cpu className="h-3.5 w-3.5" />} title="Identification et matériel">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Marque" value={asset.brand} />
                <Field label="Modèle" value={asset.model} />
                <Field label="N° de série" value={asset.serial_number} />
                <Field label="Nom machine" value={asset.hostname} />
                <Field label="Système" value={asset.os_name} />
                <Field label="Version" value={asset.os_version} />
                <Field label="Date d'achat" value={formatDate(asset.purchase_date)} />
                <Field label="Mise en service" value={formatDate(asset.commissioning_date)} />
                <Field label="Fin de garantie" value={formatDate(asset.warranty_end)} />
                <Field label="Prix d'achat" value={asset.purchase_price != null ? formatCurrency(asset.purchase_price) : "—"} />
                <Field label="Fournisseur" value={asset.supplier?.name ?? "—"} />
                <Field label="Criticité" value={asset.is_critical ? "Critique" : "Standard"} />
              </div>
            </Section>

            <Section icon={<Network className="h-3.5 w-3.5" />} title="Réseau">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Adresse IP" value={asset.ip_address} />
                <Field label="Adresse MAC" value={asset.mac_address} />
                <Field label="Hostname" value={asset.hostname} />
              </div>
            </Section>

            <Section icon={<UserRound className="h-3.5 w-3.5" />} title="Affectation">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  label="Agent"
                  value={
                    asset.assigned_agent
                      ? `${asset.assigned_agent.first_name} ${asset.assigned_agent.last_name}`
                      : "Non affecté"
                  }
                />
                <Field label="Service" value={asset.service?.name} />
                <Field label="Site" value={asset.location?.name} />
              </div>
            </Section>

            {asset.external_data ? (
              <>
                <Section icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Suivi WAPT">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Statut WAPT" value={asset.wapt_status} />
                    <Field label="Joignable" value={asset.wapt_reachable} />
                    <Field
                      label="Dernière connexion"
                      value={asset.wapt_last_seen ? formatDateTime(asset.wapt_last_seen) : "—"}
                    />
                    <Field label="Dernier utilisateur" value={asset.wapt_last_user} />
                    <Field label="Domaine" value={asset.wapt_domain} />
                    <Field label="Groupes" value={asset.wapt_groups} />
                  </div>
                </Section>

                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-2">
                    Données source WAPT
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border-soft">
                    <table className="w-full text-left text-[11px]">
                      <tbody>
                        {Object.entries(asset.external_data).map(([key, value]) => (
                          <tr key={key} className="border-b border-border-soft/60 last:border-0">
                            <td className="w-1/3 px-3 py-1.5 text-muted-2">
                              {waptLabels[key] ?? humanize(key)}
                            </td>
                            <td className="px-3 py-1.5 text-foreground">{sourceValue(value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : null}

            {asset.comments ? (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-2">Commentaires</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{asset.comments}</p>
              </div>
            ) : null}
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
