import { Database, FileClock, Settings, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/admin/users", label: "Utilisateurs", icon: UsersRound, permission: "admin.users.read" },
  { to: "/admin/roles", label: "Rôles & permissions", icon: ShieldCheck, permission: "admin.roles.read" },
  { to: "/admin/referentials", label: "Référentiels", icon: Database, permission: "referentials.read" },
  { to: "/admin/audit", label: "Journal d'audit", icon: FileClock, permission: "audit.read" },
  { to: "/admin/settings", label: "Paramètres", icon: Settings, permission: "admin.settings.read" },
];

export function AdminLayout() {
  const { hasPermission } = useAuth();
  const visibleTabs = tabs.filter((tab) => hasPermission(tab.permission));

  if (visibleTabs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Accès refusé"
          description="Votre rôle ne permet pas d'accéder à l'administration."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Gouvernance de l'application"
        description="Comptes, rôles, permissions, paramètres et traçabilité des actions."
      />

      <nav className="flex gap-1 overflow-x-auto border-b border-border-soft" aria-label="Sections d'administration">
        {visibleTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary-strong text-primary-strong"
                  : "border-transparent text-muted hover:text-foreground",
              )
            }
          >
            <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
