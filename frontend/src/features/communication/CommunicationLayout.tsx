import { CalendarClock, GraduationCap, ListChecks, Megaphone, ShieldAlert } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

const tabs = [
  {
    to: "/communication/communications",
    label: "Communications",
    icon: Megaphone,
    permission: "communications.read",
  },
  { to: "/communication/reunions", label: "Réunions", icon: CalendarClock, permission: "meetings.read" },
  { to: "/communication/formations", label: "Formations", icon: GraduationCap, permission: "trainings.read" },
  { to: "/communication/points", label: "Points 1:1", icon: ListChecks, permission: "manager_points.read" },
];

export function CommunicationLayout() {
  const { hasPermission } = useAuth();
  const visibleTabs = tabs.filter((tab) => hasPermission(tab.permission));

  if (visibleTabs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="Accès refusé"
          description="Votre rôle ne permet pas d'accéder au module Communication."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Communication"
        title="Information, réunions et montée en compétences"
        description="Communications aux utilisateurs, réunions d'équipe, formations et points de suivi avec la responsable."
      />

      <nav
        className="flex gap-1 overflow-x-auto border-b border-border-soft"
        aria-label="Sections de communication"
      >
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
