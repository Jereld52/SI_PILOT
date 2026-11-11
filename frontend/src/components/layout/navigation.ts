import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Download,
  FileText,
  FolderKanban,
  GraduationCap,
  FolderTree,
  CircleHelp,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MessagesSquare,
  MonitorSmartphone,
  Package,
  Radar,
  Scale,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Truck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission: string;
  moduleKey?: string;
  admin?: boolean;
}

export interface NavSection {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const homeNavItem: NavItem = {
  label: "Vue générale",
  to: "/",
  icon: LayoutDashboard,
  permission: "dashboard.read",
};

export const calendarNavItem: NavItem = {
  label: "Calendrier",
  to: "/calendrier",
  icon: CalendarDays,
  permission: "calendar.read",
  moduleKey: "calendar",
};

export const navigationSections: NavSection[] = [
  {
    key: "pilotage",
    label: "Pilotage",
    icon: BarChart3,
    items: [
      {
        label: "Statistiques",
        to: "/statistiques",
        icon: BarChart3,
        permission: "statistics.read",
        moduleKey: "statistics",
      },
      {
        label: "Exports",
        to: "/exports",
        icon: Download,
        permission: "exports.run",
        moduleKey: "exports",
      },
    ],
  },
  {
    key: "support",
    label: "Support & parc",
    icon: LifeBuoy,
    items: [
      {
        label: "Demandes IT",
        to: "/demandes",
        icon: LifeBuoy,
        permission: "tickets.read",
        moduleKey: "tickets",
      },
      {
        label: "Parc informatique",
        to: "/parc",
        icon: MonitorSmartphone,
        permission: "assets.read",
        moduleKey: "assets",
      },
      {
        label: "Logiciels",
        to: "/logiciels",
        icon: Boxes,
        permission: "assets.read",
        moduleKey: "software",
      },
      {
        label: "Stock IT",
        to: "/stock",
        icon: Package,
        permission: "stock.read",
        moduleKey: "stock",
      },
      {
        label: "Réservations",
        to: "/reservations",
        icon: CalendarCheck,
        permission: "reservations.read",
        moduleKey: "reservations",
      },
      {
        label: "Téléphonie mobile",
        to: "/telephonie",
        icon: Smartphone,
        permission: "mobile_lines.read",
        moduleKey: "mobile",
      },
      {
        label: "Agents",
        to: "/agents",
        icon: Users,
        permission: "agents.read",
        moduleKey: "agents",
      },
      {
        label: "Arrivées & départs",
        to: "/arrivees-departs",
        icon: UserPlus,
        permission: "agents.read",
        moduleKey: "onboarding",
      },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    icon: MessagesSquare,
    items: [
      {
        label: "Communications",
        to: "/communication/communications",
        icon: Megaphone,
        permission: "communications.read",
        moduleKey: "communications",
      },
      {
        label: "Réunions",
        to: "/communication/reunions",
        icon: CalendarClock,
        permission: "meetings.read",
        moduleKey: "meetings",
      },
      {
        label: "Formations",
        to: "/communication/formations",
        icon: GraduationCap,
        permission: "trainings.read",
        moduleKey: "trainings",
      },
      {
        label: "Points 1:1",
        to: "/communication/points",
        icon: ListChecks,
        permission: "manager_points.read",
        moduleKey: "manager_points",
      },
    ],
  },
  {
    key: "infrastructure",
    label: "Infrastructure",
    icon: Server,
    items: [
      {
        label: "Infrastructure",
        to: "/infrastructure",
        icon: Server,
        permission: "infrastructure.read",
        moduleKey: "infrastructure",
      },
      {
        label: "Supervision",
        to: "/supervision",
        icon: Radar,
        permission: "infrastructure.topology",
        moduleKey: "supervision",
      },
      {
        label: "Partages réseau",
        to: "/partages-reseau",
        icon: FolderTree,
        permission: "infrastructure.read",
        moduleKey: "network_shares",
      },
      {
        label: "Cybersécurité",
        to: "/cybersecurite",
        icon: ShieldCheck,
        permission: "security.read",
        moduleKey: "security",
      },
    ],
  },
  {
    key: "gestion",
    label: "Gestion",
    icon: Briefcase,
    items: [
      {
        label: "Fournisseurs & licences",
        to: "/fournisseurs",
        icon: Truck,
        permission: "suppliers.read",
        moduleKey: "suppliers",
      },
      {
        label: "Contrats",
        to: "/contrats",
        icon: FileText,
        permission: "contracts.read",
        moduleKey: "contracts",
      },
      {
        label: "Budget",
        to: "/budget",
        icon: Wallet,
        permission: "budget.read",
        moduleKey: "budget",
      },
      {
        label: "Projets",
        to: "/projets",
        icon: FolderKanban,
        permission: "projects.read",
        moduleKey: "projects",
      },
    ],
  },
  {
    key: "conformite",
    label: "Conformité",
    icon: Scale,
    items: [
      {
        label: "RGPD",
        to: "/rgpd",
        icon: Scale,
        permission: "rgpd.read",
        moduleKey: "rgpd",
      },
      {
        label: "Documentation",
        to: "/documentation",
        icon: BookOpen,
        permission: "documents.read",
        moduleKey: "documents",
      },
    ],
  },
];

export const adminNavItem: NavItem = {
  label: "Administration",
  to: "/admin/users",
  icon: Settings,
  permission: "admin.users.read",
  admin: true,
};

export const helpNavItem: NavItem = {
  label: "Aide",
  to: "/aide",
  icon: CircleHelp,
  permission: "",
};

export const navigation: NavItem[] = [
  homeNavItem,
  calendarNavItem,
  ...navigationSections.flatMap((section) => section.items),
  adminNavItem,
];

export function isNavigationItemActive(item: NavItem, pathname: string): boolean {
  if (item.admin) return pathname.startsWith("/admin");
  if (item.to === "/") return pathname === "/";
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname.startsWith("/admin")) return adminNavItem;
  if (pathname.startsWith("/aide")) return helpNavItem;
  return (
    navigation
      .filter((item) => item.to !== "/")
      .find((item) => isNavigationItemActive(item, pathname)) ?? homeNavItem
  );
}

export function findModuleKeyForPath(pathname: string): string | undefined {
  const candidates = [...navigationSections.flatMap((section) => section.items), calendarNavItem]
    .filter((item) => Boolean(item.moduleKey))
    .sort((left, right) => right.to.length - left.to.length);
  const match = candidates.find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  return match?.moduleKey;
}
