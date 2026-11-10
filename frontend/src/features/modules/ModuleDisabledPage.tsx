import { PowerOff, Settings } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";

export function ModuleDisabledPage() {
  const { hasPermission } = useAuth();
  return (
    <Card>
      <EmptyState
        icon={PowerOff}
        title="Module désactivé"
        description="Ce module a été désactivé par un administrateur pour simplifier l'interface. Les données restent conservées et le module peut être réactivé à tout moment."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link to="/" className={buttonVariants({ variant: "secondary", size: "md" })}>
              Retour à la vue générale
            </Link>
            {hasPermission("admin.settings.manage") ? (
              <Link to="/admin/modules" className={buttonVariants({ size: "md" })}>
                <Settings className="h-3.5 w-3.5" />
                Gérer les modules
              </Link>
            ) : null}
          </div>
        }
      />
    </Card>
  );
}
