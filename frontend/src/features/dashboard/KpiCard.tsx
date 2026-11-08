import {
  Clock,
  FileClock,
  LifeBuoy,
  Monitor,
  Receipt,
  RefreshCw,
  Server,
  ShieldAlert,
  Smartphone,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { KpiValue } from "@/types/api";

const icons: Record<string, LucideIcon> = {
  agents: Users,
  users: UserRound,
  workstations: Monitor,
  servers: Server,
  phones: Smartphone,
  open_tickets: LifeBuoy,
  critical_incidents: ShieldAlert,
  broken_assets: TriangleAlert,
  to_renew: RefreshCw,
  contracts_expiring: FileClock,
  overdue_actions: Clock,
  budget_engaged: Wallet,
  budget_consumed: Receipt,
};

const tones: Record<
  string,
  { card: string; icon: string; value: string; bar: string; glow: string }
> = {
  danger: {
    card: "border-danger/30 bg-[linear-gradient(145deg,rgba(224,133,133,0.16),rgba(23,32,29,0.92)_58%)]",
    icon: "border-danger/35 bg-danger/15 text-danger",
    value: "text-danger",
    bar: "from-danger/80 to-danger/20",
    glow: "bg-danger/20",
  },
  warning: {
    card: "border-warning/25 bg-[linear-gradient(145deg,rgba(246,219,67,0.14),rgba(23,32,29,0.92)_58%)]",
    icon: "border-warning/30 bg-warning/15 text-warning",
    value: "text-warning",
    bar: "from-warning/80 to-warning/15",
    glow: "bg-warning/15",
  },
  success: {
    card: "border-success/25 bg-[linear-gradient(145deg,rgba(140,196,106,0.14),rgba(23,32,29,0.92)_58%)]",
    icon: "border-success/30 bg-success/15 text-success",
    value: "text-success",
    bar: "from-success/80 to-success/15",
    glow: "bg-success/15",
  },
  neutral: {
    card: "border-primary/40 bg-[linear-gradient(145deg,rgba(119,43,47,0.34),rgba(23,32,29,0.92)_62%)]",
    icon: "border-primary-bright/40 bg-primary/25 text-primary-strong",
    value: "text-foreground",
    bar: "from-primary-bright/80 to-primary/20",
    glow: "bg-primary/25",
  },
};

export function KpiCard({ kpi }: { kpi: KpiValue }) {
  const Icon = icons[kpi.key] ?? Monitor;
  const tone = tones[kpi.severity] ?? tones.neutral;
  const value =
    kpi.unit === "EUR"
      ? formatCurrency(kpi.value, 0)
      : formatNumber(kpi.value, Number.isInteger(kpi.value) ? 0 : 1);

  const content = (
    <div
      className={cn(
        "group relative h-full overflow-hidden rounded-xl border p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
        tone.card,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full blur-2xl",
          tone.glow,
        )}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border shadow-inner",
            tone.icon,
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        {kpi.link ? (
          <span className="text-[10px] text-muted-2 opacity-0 transition-opacity group-hover:opacity-100">
            Ouvrir →
          </span>
        ) : null}
      </div>
      <p className="relative mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-2">
        {kpi.label}
      </p>
      <p className={cn("relative mt-1 text-3xl font-semibold tracking-tight", tone.value)}>{value}</p>
      {kpi.hint ? (
        <p className="relative mt-1 line-clamp-2 text-[11px] leading-4 text-muted-2">{kpi.hint}</p>
      ) : null}
      <span
        className={cn(
          "absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r opacity-70",
          tone.bar,
        )}
        aria-hidden="true"
      />
    </div>
  );

  if (kpi.link) {
    return (
      <Link
        to={kpi.link}
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/40"
      >
        {content}
      </Link>
    );
  }
  return content;
}
