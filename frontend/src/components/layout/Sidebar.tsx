import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/BrandMark";
import { navigation } from "@/components/layout/navigation";
import { useAuth } from "@/features/auth/AuthProvider";
import { cn, fullName } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const items = navigation.filter((item) => hasPermission(item.permission));

  return (
    <>
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border-soft bg-[linear-gradient(180deg,#12100f_0%,#0d1210_42%,#0a0f0e_100%)] shadow-[18px_0_50px_-36px_rgba(0,0,0,0.95)] backdrop-blur-xl transition-all duration-200 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(420px_300px_at_0%_0%,rgba(119,43,47,0.12),transparent_72%)]",
          collapsed ? "w-[76px]" : "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Navigation principale"
      >
        <div
          className={cn(
            "relative z-10 flex h-16 items-center border-b border-border-soft px-4",
            collapsed ? "justify-center px-2" : "justify-between",
          )}
        >
          <BrandMark compact={collapsed} />
          <button
            type="button"
            onClick={onMobileClose}
            className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
            aria-label="Fermer la navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative z-10 flex h-px w-full" aria-hidden="true">
          <span className="flex-[4] bg-primary/70" />
          <span className="flex-1 bg-accent/50" />
          <span className="flex-1 bg-brand-green/40" />
        </div>

        <nav className="relative z-10 flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
          {items.map((item) => {
            const active = item.admin
              ? location.pathname.startsWith("/admin")
              : item.to === "/"
                ? location.pathname === "/"
                : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onMobileClose}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md border px-2.5 py-2 text-[13px] transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "border-primary/30 bg-primary/[0.17] text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
                    : "border-transparent text-muted hover:bg-white/[0.035] hover:text-foreground",
                )}
              >
                <item.icon
                  className={cn("h-4 w-4 shrink-0", active ? "text-accent" : "")}
                  aria-hidden="true"
                />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                {!collapsed && active ? (
                  <span className="ml-auto h-1 w-1 rounded-full bg-accent/80" />
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="relative z-10 border-t border-border-soft p-3">
          <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
            <Avatar firstName={user?.first_name} lastName={user?.last_name} className="h-8 w-8" />
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {fullName(user?.first_name, user?.last_name)}
                </p>
                <p className="truncate text-[10px] text-muted-2">{user?.role.name ?? "—"}</p>
              </div>
            ) : null}
          </div>

          <div className={cn("mt-3 flex items-center", collapsed ? "justify-center" : "justify-between")}>
            {!collapsed ? (
              <p className="text-[10px] text-muted-2">v0.1.0 · Cockpit SI</p>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="hidden h-7 w-7 lg:inline-flex"
              aria-label={collapsed ? "Déplier la navigation" : "Replier la navigation"}
              title={collapsed ? "Déplier" : "Replier"}
            >
              {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
