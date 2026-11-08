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

const tones: Record<string, { card: string; icon: string; value: string; bar: string }> = {
  danger: {
    card: "border-l-danger/70",
    icon: "border-danger/25 bg-danger/10 text-danger",
    value: "text-danger",
    bar: "from-danger/70 to-danger/10",
  },
  warning: {
    card: "border-l-warning/70",
    icon: "border-warning/25 bg-warning/10 text-warning",
    value: "text-warning",
    bar: "from-warning/70 to-warning/10",
  },
  success: {
    card: "border-l-success/70",
    icon: "border-success/25 bg-success/10 text-success",
    value: "text-success",
    bar: "from-success/70 to-success/10",
  },
  neutral: {
    card: "border-l-primary/70",
    icon: "border-primary/30 bg-primary/10 text-primary-strong",
    value: "text-foreground",
    bar: "from-primary/70 to-primary/10",
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
        "group relative h-full overflow-hidden rounded-lg border border-border-soft border-l-2 bg-surface/70 p-3.5 shadow-card transition-colors hover:border-border hover:bg-surface/85",
        tone.card,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-md border", tone.icon)}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        {kpi.link ? (
          <span className="text-[9px] uppercase tracking-wide text-muted-2 opacity-0 transition-opacity group-hover:opacity-100">
            Ouvrir →
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-2">
        {kpi.label}
      </p>
      <p className={cn("mt-0.5 text-[1.6rem] font-semibold tracking-tight", tone.value)}>{value}</p>
      {kpi.hint ? (
        <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-2">{kpi.hint}</p>
      ) : null}
      <span
        className={cn("absolute inset-x-0 bottom-0 h-px bg-gradient-to-r opacity-50", tone.bar)}
        aria-hidden="true"
      />
    </div>
  );

  if (kpi.link) {
    return (
      <Link
        to={kpi.link}
        className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/40"
      >
        {content}
      </Link>
    );
  }
  return content;
}
