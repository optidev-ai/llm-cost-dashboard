import { useMemo, useState } from "react";
import { Boxes, CircleDollarSign, TrendingUp, Wallet } from "lucide-react";
import { useDashboard } from "@/lib/datasource";
import {
  budgetByTeam,
  dailyByDept,
  departments,
  kpis,
  monthFinance,
  rowsInRange,
  spendByDept,
  spendByModel,
  spendByProvider,
  topMovers,
} from "@/lib/analytics";
import type { DateRange } from "@/lib/types";
import { OTHER_COLOR, SERIES, modelColor, providerColor } from "@/lib/palette";
import { fmtCurrency, fmtCurrencyFull, fmtPct } from "@/lib/format";
import { CapsLabel, DeltaBadge, SectionCard, StatTile } from "@/components/dashboard/primitives";
import { MixDonut, RankedBars, SpendAreaChart } from "@/components/dashboard/charts";
import { BudgetTable } from "@/components/dashboard/BudgetTable";

function shiftRange(range: DateRange): DateRange {
  const from = new Date(range.from + "T00:00:00");
  const to = new Date(range.to + "T00:00:00");
  const len = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const pTo = new Date(from);
  pTo.setDate(from.getDate() - 1);
  const pFrom = new Date(pTo);
  pFrom.setDate(pTo.getDate() - (len - 1));
  return { from: pFrom.toISOString().slice(0, 10), to: pTo.toISOString().slice(0, 10), label: "prev" };
}

function DeptLegend({ depts, colorFor }: { depts: string[]; colorFor: (d: string) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {depts.map((d) => (
        <span key={d} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: colorFor(d) }} />
          {d}
        </span>
      ))}
    </div>
  );
}

function AllocationCard() {
  const { dataset, range } = useDashboard();
  const [mode, setMode] = useState<"showback" | "chargeback">("showback");
  const rows = useMemo(() => rowsInRange(dataset, range), [dataset, range]);
  const byDept = useMemo(() => spendByDept(dataset, rows), [dataset, rows]);
  const total = byDept.reduce((s, d) => s + d.cost, 0);

  return (
    <SectionCard
      title="Cost allocation"
      subtitle={mode === "showback" ? "Visibility by department (no transfer)" : "Billed back to each department"}
      action={
        <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
          {(["showback", "chargeback"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                "rounded-md px-2 py-1 font-medium capitalize transition-colors " +
                (m === mode ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {m}
            </button>
          ))}
        </div>
      }
    >
      <RankedBars data={byDept} color={mode === "chargeback" ? "var(--primary)" : "var(--series-1)"} />
      <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
        <span className="text-muted-foreground">{mode === "chargeback" ? "Total charged back" : "Total attributed"}</span>
        <span className="tnum font-medium text-foreground">{fmtCurrencyFull(total)}</span>
      </div>
    </SectionCard>
  );
}

export function ExecutiveView() {
  const { dataset, range } = useDashboard();

  const rows = useMemo(() => rowsInRange(dataset, range), [dataset, range]);
  const prevRows = useMemo(() => rowsInRange(dataset, shiftRange(range)), [dataset, range]);
  const k = useMemo(() => kpis(rows), [rows]);
  const prevSpend = useMemo(() => prevRows.reduce((s, r) => s + r.cost, 0), [prevRows]);
  const mf = useMemo(() => monthFinance(dataset), [dataset]);
  const depts = useMemo(() => departments(dataset, rows), [dataset, rows]);
  const colorForDept = useMemo(() => {
    const idx = new Map(depts.map((d, i) => [d, i]));
    return (d: string) => SERIES[idx.get(d) ?? -1] ?? OTHER_COLOR;
  }, [depts]);
  const dailyDept = useMemo(() => dailyByDept(dataset, rows, depts), [dataset, rows, depts]);
  const models = useMemo(() => spendByModel(dataset, rows), [dataset, rows]);
  const providers = useMemo(() => spendByProvider(dataset, rows), [dataset, rows]);
  const budgets = useMemo(() => budgetByTeam(dataset), [dataset]);
  const movers = useMemo(() => topMovers(dataset, 5), [dataset]);

  const spendDelta = prevSpend ? (k.spend - prevSpend) / prevSpend : 0;
  const orgUtil = dataset.orgMonthlyBudget ? mf.forecast / dataset.orgMonthlyBudget : 0;

  const stagger = (i: number) => ({ animationDelay: `${i * 60}ms` });

  return (
    <div className="space-y-4 p-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="animate-slide-up" style={stagger(0)}>
          <StatTile
            label={`Spend · ${range.label}`}
            value={fmtCurrency(k.spend)}
            delta={spendDelta}
            deltaGoodDir="down"
            icon={CircleDollarSign}
            sub={`vs ${fmtCurrency(prevSpend)} prior period`}
          />
        </div>
        <div className="animate-slide-up" style={stagger(1)}>
          <StatTile
            label="Forecast · month-end"
            value={fmtCurrency(mf.forecast)}
            delta={mf.momGrowth}
            deltaGoodDir="down"
            icon={TrendingUp}
            accent
            sub={`${fmtCurrency(mf.mtd)} MTD · ${fmtPct(mf.monthElapsed * 100, 0)} of month elapsed`}
          />
        </div>
        <div className="animate-slide-up" style={stagger(2)}>
          <StatTile
            label="Budget used · forecast"
            value={fmtPct(orgUtil * 100, 0)}
            icon={Wallet}
            deltaGoodDir="down"
            sub={`${fmtCurrency(mf.forecast)} of ${fmtCurrency(dataset.orgMonthlyBudget)}/mo org budget`}
          />
        </div>
        <div className="animate-slide-up" style={stagger(3)}>
          <StatTile
            label="Active teams"
            value={`${k.activeTeams}`}
            icon={Boxes}
            sub={`${dataset.models.length} models · ${dataset.providers.length} providers`}
          />
        </div>
      </div>

      {/* trend + model mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Spend over time"
          subtitle="Daily cost, stacked by department"
          action={<DeptLegend depts={depts} colorFor={colorForDept} />}
        >
          <SpendAreaChart data={dailyDept} keys={depts} colorFor={colorForDept} />
        </SectionCard>
        <SectionCard title="Spend by model" subtitle={`${range.label} · ${dataset.models.length} models`}>
          <MixDonut data={models} colorFor={(key) => modelColor(key, dataset.models)} centerLabel="Total" centerValue={fmtCurrency(k.spend)} />
        </SectionCard>
      </div>

      {/* budget table + allocation */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Budget vs. actual"
          subtitle="Forecast-to-month-end against each team's monthly budget"
        >
          <BudgetTable rows={budgets} />
        </SectionCard>
        <AllocationCard />
      </div>

      {/* movers + provider mix + efficiency */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Biggest movers" subtitle="Week-over-week spend change">
          <ul className="space-y-3">
            {movers.map((m) => (
              <li key={m.teamId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{m.name}</div>
                  <div className="tnum text-xs text-muted-foreground">
                    {fmtCurrency(m.recent)} <span className="opacity-60">from {fmtCurrency(m.prior)}</span>
                  </div>
                </div>
                <DeltaBadge value={m.delta} goodDirection="down" />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Spend by provider" subtitle={`${range.label}`}>
          <MixDonut
            data={providers}
            colorFor={(key) => providerColor(key as never)}
            centerLabel="Providers"
            centerValue={`${providers.length}`}
            height={180}
          />
        </SectionCard>

        <SectionCard title="Efficiency" subtitle="Unit economics across the range">
          <dl className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <CapsLabel>Cache hit rate</CapsLabel>
                <span className="tnum text-lg font-semibold text-foreground">{fmtPct(k.cacheHitRate * 100)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">of input tokens served from cache</p>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <CapsLabel>Cost / 1k requests</CapsLabel>
                <span className="tnum text-lg font-semibold text-foreground">{fmtCurrency(k.costPerRequest * 1000)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{fmtCurrency(k.spend)} over {k.requests.toLocaleString()} requests</p>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <CapsLabel>Error rate</CapsLabel>
                <span className="tnum text-lg font-semibold text-foreground">{fmtPct(k.errorRate * 100, 2)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">failed requests across all providers</p>
            </div>
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}
