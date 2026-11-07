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
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border-soft bg-background-soft/95 backdrop-blur-xl transition-all duration-200",
          collapsed ? "w-[76px]" : "w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-label="Navigation principale"
      >
        <div
          className={cn(
            "flex h-16 items-center border-b border-border-soft px-4",
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

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
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
                  "group flex items-center gap-3 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "border-primary-strong/20 bg-primary/15 text-primary-strong"
                    : "border-transparent text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {!collapsed ? <span className="truncate">{item.label}</span> : null}
                {!collapsed && active ? (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-strong" />
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-border-soft p-3">
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
              <p className="text-[10px] text-muted-2">v0.1.0 · Socle</p>
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
