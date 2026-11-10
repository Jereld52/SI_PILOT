import {
  Check,
  ChevronDown,
  CircleHelp,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { findNavItem } from "@/components/layout/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/AuthProvider";
import { useBranding } from "@/features/branding/BrandingProvider";
import { THEME_OPTIONS, useTheme } from "@/features/theme/ThemeProvider";
import { AiDialog } from "@/features/ai/AiDialog";
import { fullName } from "@/lib/utils";

interface TopbarProps {
  onOpenMobile: () => void;
  onChangePassword: () => void;
}

export function Topbar({ onOpenMobile, onChangePassword }: TopbarProps) {
  const { user, hasPermission, logout } = useAuth();
  const branding = useBranding();
  const { theme, setTheme, cycleTheme } = useTheme();
  const themeLabel = THEME_OPTIONS.find((option) => option.value === theme)?.label ?? "Sombre";
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Palette;
  const location = useLocation();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);
  const current = findNavItem(location.pathname);

  const handleLogout = async () => {
    await logout();
    toast.success("Vous êtes déconnecté.");
    navigate("/login", { replace: true });
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border-soft bg-background/80 shadow-[var(--app-topbar-shadow)] backdrop-blur-xl">
        <div className="flex h-16 items-center gap-2 px-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onOpenMobile}
            aria-label="Ouvrir la navigation"
          >
            <Menu className="h-4 w-4" />
          </Button>

          <div className="hidden min-w-0 md:block">
            <p className="text-[9px] uppercase tracking-[0.18em] text-muted-2">{branding.app_name}</p>
            <p className="truncate text-[13px] font-medium text-foreground">
              <span className="mr-2 inline-block h-1 w-1 rounded-full bg-primary-bright align-middle" />
              {current?.label ?? "Vue générale"}
            </p>
          </div>

          <div className="hidden flex-1 justify-center px-4 md:flex">
            <GlobalSearch />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={cycleTheme}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  aria-label={`Thème : ${themeLabel}`}
                >
                  <ThemeIcon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Thème : {themeLabel}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => navigate("/aide")}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                  aria-label="Aide"
                >
                  <CircleHelp className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Aide</TooltipContent>
            </Tooltip>

            {hasPermission("admin.settings.read") ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => navigate("/admin/settings")}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                    aria-label="Paramètres"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Paramètres</TooltipContent>
              </Tooltip>
            ) : null}

            <NotificationsMenu />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setAiOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-2.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                  aria-label="Ouvrir l'assistant IA"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">IA</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Assistant IA</TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 inline-flex items-center gap-2 rounded-lg border border-transparent p-1 pr-1.5 transition-colors hover:border-border-soft hover:bg-surface-2"
                  aria-label="Menu du profil"
                >
                  <Avatar
                    firstName={user?.first_name}
                    lastName={user?.last_name}
                    className="h-8 w-8"
                  />
                  <span className="hidden max-w-32 truncate text-xs font-medium text-foreground lg:block">
                    {fullName(user?.first_name, user?.last_name)}
                  </span>
                  <ChevronDown className="hidden h-3 w-3 text-muted-2 lg:block" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <span className="block truncate normal-case tracking-normal text-foreground">
                    {fullName(user?.first_name, user?.last_name)}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] font-normal normal-case tracking-normal text-muted-2">
                    {user?.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onChangePassword}>
                  <KeyRound className="h-3.5 w-3.5" />
                  Changer le mot de passe
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/compte/securite")}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Sécurité du compte
                </DropdownMenuItem>
                {hasPermission("admin.users.read") ? (
                  <DropdownMenuItem onSelect={() => navigate("/admin/users")}>
                    <Settings className="h-3.5 w-3.5" />
                    Administration
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Thème de l'interface</DropdownMenuLabel>
                {THEME_OPTIONS.map((option) => {
                  const Icon =
                    option.value === "dark" ? Moon : option.value === "light" ? Sun : Palette;
                  return (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => setTheme(option.value)}
                      className="justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        <span>{option.label}</span>
                      </span>
                      {theme === option.value ? (
                        <Check className="h-3.5 w-3.5 text-accent" />
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void handleLogout()}
                  className="text-danger focus:bg-danger/10 focus:text-danger"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="border-t border-border-soft px-3 py-2 md:hidden">
          <GlobalSearch />
        </div>
      </header>

      <AiDialog open={aiOpen} onOpenChange={setAiOpen} />
    </>
  );
}
