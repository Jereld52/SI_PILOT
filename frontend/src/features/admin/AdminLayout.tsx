import {
  ArchiveRestore,
  ArrowDownUp,
  Database,
  DatabaseBackup,
  FileClock,
  Laptop,
  LayoutGrid,
  Plug,
  ServerCog,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn } from "@/lib/utils";

interface AdminTab {
  to: string;
  label: string;
  icon: typeof UsersRound;
  permission: string;
}

interface AdminGroup {
  key: string;
  label: string;
  icon: typeof UsersRound;
  items: AdminTab[];
}

const groups: AdminGroup[] = [
  {
    key: "accounts",
    label: "Comptes & droits",
    icon: UsersRound,
    items: [
      { to: "/admin/users", label: "Utilisateurs", icon: UsersRound, permission: "admin.users.read" },
      { to: "/admin/roles", label: "Rôles & permissions", icon: ShieldCheck, permission: "admin.roles.read" },
    ],
  },
  {
    key: "data",
    label: "Données & intégrations",
    icon: Database,
    items: [
      { to: "/admin/referentials", label: "Référentiels", icon: Database, permission: "referentials.read" },
      { to: "/admin/sources", label: "Sources de données", icon: Plug, permission: "admin.settings.read" },
      { to: "/admin/wapt", label: "Connexion WAPT", icon: Laptop, permission: "admin.settings.read" },
      { to: "/admin/veeam", label: "Connexion Veeam", icon: DatabaseBackup, permission: "admin.settings.read" },
      { to: "/admin/import-export", label: "Import / Export", icon: ArrowDownUp, permission: "imports.preview" },
    ],
  },
  {
    key: "system",
    label: "Système & IA",
    icon: ServerCog,
    items: [
      { to: "/admin/ai", label: "Assistant IA", icon: Sparkles, permission: "ai.configure" },
      { to: "/admin/modules", label: "Modules", icon: LayoutGrid, permission: "admin.settings.read" },
      { to: "/admin/backup", label: "Sauvegarde", icon: ArchiveRestore, permission: "admin.backup.manage" },
      { to: "/admin/system", label: "Système", icon: ServerCog, permission: "admin.settings.read" },
      { to: "/admin/settings", label: "Paramètres", icon: Settings, permission: "admin.settings.read" },
    ],
  },
  {
    key: "audit",
    label: "Journal d'audit",
    icon: FileClock,
    items: [
      { to: "/admin/audit", label: "Journal d'audit", icon: FileClock, permission: "audit.read" },
    ],
  },
];

function isTabActive(pathname: string, tab: AdminTab): boolean {
  return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
}

export function AdminLayout() {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const visibleGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((tab) => hasPermission(tab.permission)),
    }))
    .filter((group) => group.items.length > 0);

  const activeItem = visibleGroups
    .flatMap((group) => group.items)
    .sort((left, right) => right.to.length - left.to.length)
    .find((tab) => isTabActive(location.pathname, tab));
  const activeGroup =
    visibleGroups.find((group) =>
      group.items.some((tab) => tab.to === activeItem?.to),
    ) ?? visibleGroups[0];

  if (visibleGroups.length === 0) {
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

      <div className="space-y-2">
        <nav
          className="flex gap-1 overflow-x-auto rounded-lg border border-border-soft bg-background-soft/40 p-1"
          aria-label="Catégories d'administration"
        >
          {visibleGroups.map((group) => {
            const active = group.key === activeGroup?.key;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => navigate(group.items[0].to)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary/15 text-primary-strong"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <group.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {group.label}
              </button>
            );
          })}
        </nav>

        {activeGroup && activeGroup.items.length > 1 ? (
          <nav
            className="flex gap-1 overflow-x-auto border-b border-border-soft"
            aria-label="Sections d'administration"
          >
            {activeGroup.items.map((tab) => (
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
        ) : null}
      </div>

      <Outlet />
    </div>
  );
}
