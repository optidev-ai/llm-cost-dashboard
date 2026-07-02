import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCurrency, fmtCurrencyFull, fmtDayShort, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { NamedSpend } from "@/lib/analytics";

const AXIS = "var(--viz-ink-muted)";
const GRID = "var(--viz-grid)";

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}
function VizTooltip({
  active,
  payload,
  label,
  labelFmt,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string; stroke?: string }[];
  label?: string;
  labelFmt?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p) => (p.value ?? 0) > 0);
  const total = entries.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="min-w-[168px] rounded-lg border border-border bg-popover/95 p-3 text-xs shadow-xl backdrop-blur">
      {label && <div className="mb-2 font-medium text-foreground">{labelFmt ? labelFmt(label) : label}</div>}
      <div className="space-y-1.5">
        {entries
          .slice()
          .reverse()
          .map((p) => (
            <div key={p.name} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: p.color ?? p.stroke }} />
                {p.name}
              </span>
              <span className="tnum text-foreground">{fmtCurrencyFull(p.value)}</span>
            </div>
          ))}
      </div>
      {entries.length > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-1.5 font-medium">
          <span className="text-muted-foreground">Total</span>
          <span className="tnum text-foreground">{fmtCurrencyFull(total)}</span>
        </div>
      )}
    </div>
  );
}

/** Stacked-area spend over time, one band per series key. */
export function SpendAreaChart({
  data,
  keys,
  colorFor,
  height = 260,
}: {
  data: Record<string, number | string>[];
  keys: readonly string[];
  colorFor: (k: string) => string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          {keys.map((k) => {
            const c = colorFor(k);
            return (
              <linearGradient id={`g-${k}`} key={k} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c} stopOpacity={0.38} />
                <stop offset="100%" stopColor={c} stopOpacity={0.02} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="2 4" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDayShort}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={44}
          dy={6}
        />
        <YAxis
          tickFormatter={(v) => fmtCurrency(Number(v))}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip content={<VizTooltip labelFmt={fmtDayShort} />} />
        {keys.map((k) => (
          <Area
            key={k}
            type="monotone"
            dataKey={k}
            stackId="1"
            stroke={colorFor(k)}
            strokeWidth={1.5}
            fill={`url(#g-${k})`}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut with a centered headline and a labeled legend list beside it. */
export function MixDonut({
  data,
  colorFor,
  centerLabel,
  centerValue,
  height = 176,
}: {
  data: NamedSpend[];
  colorFor: (key: string) => string;
  centerLabel: string;
  centerValue: string;
  height?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="cost"
              nameKey="name"
              innerRadius="66%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={colorFor(d.key)} />
              ))}
            </Pie>
            <Tooltip content={<VizTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="tnum text-xl font-semibold text-foreground">{centerValue}</div>
          <div className="label-caps mt-0.5">{centerLabel}</div>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: colorFor(d.key) }} />
              <span className="truncate text-foreground">{d.name}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2 tnum">
              <span className="text-foreground">{fmtCurrency(d.cost)}</span>
              <span className="w-12 text-right text-xs text-muted-foreground">{fmtPct(d.share * 100)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars (single hue = magnitude). Div-based for crisp labels. */
export function RankedBars({
  data,
  color = "var(--series-1)",
  valueFmt = fmtCurrency,
}: {
  data: { key: string; name: string; cost: number; share?: number }[];
  color?: string;
  valueFmt?: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.cost), 1);
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm text-foreground">{d.name}</span>
          <span className="tnum text-sm text-foreground">{valueFmt(d.cost)}</span>
          <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full transition-all"
              style={{ width: `${Math.max(2, (d.cost / max) * 100)}%`, backgroundColor: color }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MiniBarMeter({ value, tone = "var(--series-1)", className }: { value: number; tone?: string; className?: string }) {
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, value * 100))}%`, backgroundColor: tone }} />
    </span>
  );
}

export type { TooltipEntry };
