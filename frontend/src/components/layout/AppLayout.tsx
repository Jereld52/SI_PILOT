import { AlertTriangle, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthProvider";
import { ChangePasswordDialog } from "@/features/auth/ChangePasswordDialog";
import { cn } from "@/lib/utils";

export function AppLayout() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("pnfor.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem("pnfor.sidebar.collapsed", collapsed ? "1" : "0");
    } catch {
      // stockage local indisponible : le repli reste fonctionnel pour la session
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          "min-h-screen transition-[padding] duration-200",
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        <Topbar onOpenMobile={() => setMobileOpen(true)} onChangePassword={() => setPasswordOpen(true)} />

        {user?.must_change_password ? (
          <div className="border-b border-warning/20 bg-warning/10">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-2.5 text-xs text-warning sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Votre mot de passe initial doit être changé pour sécuriser votre compte.
              </span>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit border-warning/30 bg-warning/10 text-warning hover:bg-warning/20"
                onClick={() => setPasswordOpen(true)}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Changer maintenant
              </Button>
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>

        <footer className="mx-auto flex w-full max-w-[1600px] flex-col gap-1 px-4 pb-5 text-[10px] text-muted-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>SI PNFor PILOTE · Parc national de forêts</span>
          <span>Données hébergées localement · accès journalisé</span>
        </footer>
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
