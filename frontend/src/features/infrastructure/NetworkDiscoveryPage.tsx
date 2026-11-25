import { Wifi } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/features/auth/AuthProvider";
import { NetworkDiscoveryPanel } from "@/features/infrastructure/NetworkDiscoveryPanel";

export function NetworkDiscoveryPage() {
  const { hasPermission } = useAuth();
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Infrastructure"
        title="Découverte réseau"
        description="Scanner un sous-réseau privé, rapprocher les hôtes du parc et ajouter les équipements manquants."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border-soft bg-background/50 px-2.5 py-1.5 text-[10px] text-muted">
            <Wifi className="h-3.5 w-3.5 text-accent" />
            Lecture seule · adresses privées
          </span>
        }
      />
      <NetworkDiscoveryPanel
        canCreate={hasPermission("infrastructure.create")}
        onEquipmentAdded={() => undefined}
      />
    </div>
  );
}
