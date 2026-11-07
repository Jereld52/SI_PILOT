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

const tones: Record<string, { icon: string; border: string; value: string }> = {
  danger: {
    icon: "border-danger/20 bg-danger/10 text-danger",
    border: "before:bg-danger/70",
    value: "text-danger",
  },
  warning: {
    icon: "border-warning/20 bg-warning/10 text-warning",
    border: "before:bg-warning/70",
    value: "text-warning",
  },
  success: {
    icon: "border-success/20 bg-success/10 text-success",
    border: "before:bg-success/70",
    value: "text-success",
  },
  neutral: {
    icon: "border-accent/20 bg-accent/10 text-accent",
    border: "before:bg-accent/60",
    value: "text-foreground",
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
        "group relative h-full overflow-hidden rounded-xl border border-border-soft bg-surface/85 p-4 shadow-card transition-colors hover:border-border",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:content-['']",
        tone.border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", tone.icon)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        {kpi.link ? (
          <span className="text-[10px] text-muted-2 opacity-0 transition-opacity group-hover:opacity-100">
            Ouvrir →
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-2">{kpi.label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight", tone.value)}>{value}</p>
      {kpi.hint ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-2">{kpi.hint}</p> : null}
    </div>
  );

  if (kpi.link) {
    return (
      <Link to={kpi.link} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong/40">
        {content}
      </Link>
    );
  }
  return content;
}
