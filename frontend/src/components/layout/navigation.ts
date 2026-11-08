import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Download,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  MonitorSmartphone,
  Package,
  Radar,
  Scale,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission: string;
  admin?: boolean;
}

export const navigation: NavItem[] = [
  { label: "Vue générale", to: "/", icon: LayoutDashboard, permission: "dashboard.read" },
  { label: "Statistiques", to: "/statistiques", icon: BarChart3, permission: "statistics.read" },
  { label: "Exports", to: "/exports", icon: Download, permission: "exports.run" },
  { label: "Demandes IT", to: "/demandes", icon: LifeBuoy, permission: "tickets.read" },
  { label: "Parc informatique", to: "/parc", icon: MonitorSmartphone, permission: "assets.read" },
  { label: "Fournisseurs & licences", to: "/fournisseurs", icon: Truck, permission: "suppliers.read" },
  { label: "Stock IT", to: "/stock", icon: Package, permission: "stock.read" },
  { label: "Téléphonie mobile", to: "/telephonie", icon: Smartphone, permission: "mobile_lines.read" },
  { label: "Agents", to: "/agents", icon: Users, permission: "agents.read" },
  { label: "Infrastructure", to: "/infrastructure", icon: Server, permission: "infrastructure.read" },
  { label: "Supervision", to: "/supervision", icon: Radar, permission: "infrastructure.topology" },
  { label: "Cybersécurité", to: "/cybersecurite", icon: ShieldCheck, permission: "security.read" },
  { label: "Contrats", to: "/contrats", icon: FileText, permission: "contracts.read" },
  { label: "Budget", to: "/budget", icon: Wallet, permission: "budget.read" },
  { label: "Projets", to: "/projets", icon: FolderKanban, permission: "projects.read" },
  { label: "RGPD", to: "/rgpd", icon: Scale, permission: "rgpd.read" },
  { label: "Documentation", to: "/documentation", icon: BookOpen, permission: "documents.read" },
  { label: "Calendrier", to: "/calendrier", icon: CalendarDays, permission: "calendar.read" },
  {
    label: "Administration",
    to: "/admin/users",
    icon: Settings,
    permission: "admin.users.read",
    admin: true,
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname.startsWith("/admin")) {
    return navigation.find((item) => item.admin);
  }
  return navigation
    .filter((item) => item.to !== "/")
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ??
    navigation.find((item) => item.to === "/");
}
