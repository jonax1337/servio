"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

const DONUT_COLORS = [
  "var(--chart-1)",
  "var(--chart-3)",
  "oklch(0.72 0.16 70)",
  "var(--chart-4)",
  "var(--primary)",
  "oklch(0.65 0.2 15)",
  "oklch(0.6 0.13 250)",
  "var(--muted-foreground)",
];

export function VolumeChart({
  data,
}: {
  data: { label: string; created: number; resolved: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="var(--muted-foreground)"
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={11}
          width={30}
          stroke="var(--muted-foreground)"
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--popover-foreground)",
          }}
        />
        <Area
          type="monotone"
          dataKey="created"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#gCreated)"
          name="Created"
        />
        <Area
          type="monotone"
          dataKey="resolved"
          stroke="var(--chart-4)"
          strokeWidth={2}
          fill="url(#gResolved)"
          name="Resolved"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut/pie for a breakdown (label → value). Legend on the side. */
export function DonutChart({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex h-full min-h-[160px] items-center gap-4">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={44} outerRadius={68} paddingAngle={2} strokeWidth={0}>
              {data.map((_, i) => (
                <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="font-display text-xl font-semibold tabular-nums">{total}</span>
        </div>
      </div>
      <ul className="grid min-w-0 flex-1 gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{d.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Radial gauge for a single 0–100 percentage (e.g. SLA compliance). */
export function GaugeChart({ value, label }: { value: number; label?: string }) {
  const data = [{ name: "v", value: Math.max(0, Math.min(100, value)) }];
  const color = value >= 90 ? "var(--chart-4)" : value >= 75 ? "oklch(0.72 0.16 70)" : "var(--destructive)";
  return (
    <div className="relative h-36 w-36">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="70%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} fill={color} background={{ fill: "var(--muted)" }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-2xl font-semibold tabular-nums">{value}%</div>
          {label ? <div className="text-[11px] text-muted-foreground">{label}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function BarRow({
  label,
  value,
  total,
  colorVar = "var(--primary)",
}: {
  label: string;
  value: number;
  total: number;
  colorVar?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: colorVar }}
        />
      </div>
    </div>
  );
}
