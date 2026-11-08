import { BarChart3, ChartPie, TrendingUp, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { ChartSeries } from "@/types/api";

const palette = ["#a84349", "#cdc97e", "#8cc46a", "#f6db43", "#d59a9d", "#4a8a33", "#7f2f34", "#a9a45e"];

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string }>;
  label?: string;
  unit?: string | null;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border border-primary/40 bg-[#241416] px-3 py-2 text-xs shadow-2xl">
      <p className="font-medium text-foreground">{label}</p>
      <p className="mt-1 text-accent">
        {unit === "EUR" ? formatCurrency(value, 2) : formatNumber(value, 1)}
      </p>
    </div>
  );
}

function EvolutionChart({ series }: { series: ChartSeries }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={series.points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a84349" stopOpacity={0.55} />
            <stop offset="55%" stopColor="#772b2f" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#772b2f" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#29372f" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#8b887c", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#8b887c", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <RechartsTooltip content={<ChartTooltip unit={series.unit} />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#e0b1b4"
          strokeWidth={2.4}
          fill={`url(#fill-${series.key})`}
          dot={false}
          activeDot={{ r: 4, fill: "#cdc97e", stroke: "#0c1110", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function StatusPie({ series }: { series: ChartSeries }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={series.points}
          dataKey="value"
          nameKey="label"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={2}
          stroke="#17201d"
          strokeWidth={2}
        >
          {series.points.map((point, index) => (
            <Cell key={point.label} fill={point.color ?? palette[index % palette.length]} />
          ))}
        </Pie>
        <RechartsTooltip content={<ChartTooltip unit={series.unit} />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span className="text-[10px] text-muted">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function HorizontalBars({ series }: { series: ChartSeries }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, series.points.length * 34 + 30)}>
      <BarChart data={series.points} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="#29372f" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#8b887c", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={140}
          tick={{ fill: "#b9b5a6", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <RechartsTooltip content={<ChartTooltip unit={series.unit} />} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
          {series.points.map((point, index) => (
            <Cell key={point.label} fill={point.color ?? palette[index % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartVisual({ series }: { series: ChartSeries }) {
  const hasData = series.points.some((point) => point.value > 0);
  if (!hasData && series.key !== "tickets_evolution") {
    return (
      <EmptyState
        icon={BarChart3}
        title="Aucune donnée disponible"
        description="Les indicateurs apparaîtront dès que des données métier seront enregistrées."
        className="py-10"
      />
    );
  }
  if (series.key.endsWith("_evolution")) return <EvolutionChart series={series} />;
  if (series.key === "assets_by_status" || series.key === "tickets_by_status") {
    return <StatusPie series={series} />;
  }
  return <HorizontalBars series={series} />;
}

function seriesIcon(series: ChartSeries) {
  if (series.unit === "EUR") return Wallet;
  if (series.key.endsWith("_evolution")) return TrendingUp;
  return ChartPie;
}

export function ChartCard({ series }: { series: ChartSeries }) {
  const Icon = seriesIcon(series);
  const total = series.points.reduce((sum, point) => sum + point.value, 0);
  return (
    <Card className="panel-sheen overflow-hidden border-primary/20">
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-bright/40 bg-primary/25 text-primary-strong">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>{series.label}</CardTitle>
            <CardDescription>
              {series.points.length} point(s) · total{" "}
              {series.unit === "EUR" ? formatCurrency(total, 0) : formatNumber(total, 0)}
              {series.unit === "EUR" ? " · montants en euros" : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="rounded-lg border border-border-soft/70 bg-background/35 p-2">
          <ChartVisual series={series} />
        </div>
      </CardContent>
    </Card>
  );
}
