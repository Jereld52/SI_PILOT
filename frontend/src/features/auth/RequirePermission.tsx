import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/features/auth/AuthProvider";

export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { hasPermission, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!hasPermission(permission)) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Accès refusé"
          description="Votre rôle ne permet pas d'accéder à cette section. Contactez un administrateur si nécessaire."
        />
      </Card>
    );
  }

  return <>{children}</>;
}
