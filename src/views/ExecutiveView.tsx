import { Boxes, CircleDollarSign, Download, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { BudgetTable } from "@/components/dashboard/BudgetTable";
import { MixDonut, RankedBars, SpendAreaChart } from "@/components/dashboard/charts";
import { CapsLabel, DeltaBadge, SectionCard, SectionHeader, StatTile } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import type { AllocationMethod } from "@/lib/analytics";
import {
  budgetByTeam,
  capabilities,
  chargeback,
  dailyByDept,
  departments,
  kpis,
  monthFinance,
  rowsInRange,
  spendByModel,
  spendByProvider,
  topMovers,
} from "@/lib/analytics";
import { useDashboard } from "@/lib/datasource";
import { fmtCurrency, fmtCurrencyFull, fmtPct } from "@/lib/format";
import { modelColor, OTHER_COLOR, providerColor, SERIES } from "@/lib/palette";
import type { DateRange } from "@/lib/types";
import { cn } from "@/lib/utils";

function shiftRange(range: DateRange): DateRange {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
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

const ALLOCATION_METHODS: { value: AllocationMethod; label: string }[] = [
  { value: "usage", label: "Usage" },
  { value: "equal", label: "Equal" },
  { value: "headcount", label: "Headcount" },
];

/**
 * Real chargeback — not a relabel. Showback shows each team's directly-attributed
 * spend with the shared/platform pool left explicit; chargeback distributes that
 * pool across budget-owned teams by the chosen driver, so every dollar lands on a
 * team and the totals tie out. Exports a per-team chargeback statement.
 */
function ChargebackCard() {
  const { dataset, range } = useDashboard();
  const [mode, setMode] = useState<"showback" | "chargeback">("showback");
  const [method, setMethod] = useState<AllocationMethod>("usage");

  const rows = useMemo(() => rowsInRange(dataset, range), [dataset, range]);
  const cb = useMemo(() => chargeback(dataset, rows, method), [dataset, rows, method]);

  const isCharge = mode === "chargeback";
  const grand = cb.directTotal + cb.sharedPool;
  const bars = cb.rows.slice(0, 8).map((r) => ({
    key: r.teamId,
    name: r.name,
    cost: isCharge ? r.total : r.direct,
    share: r.share,
  }));

  function exportStatement(): void {
    const header = ["team", "department", "direct_usd", "allocated_shared_usd", "total_usd"];
    const lines = cb.rows.map((r) =>
      [r.name, r.department, r.direct.toFixed(2), r.allocated.toFixed(2), r.total.toFixed(2)]
        .map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : v))
        .join(","),
    );
    const meta = `# Chargeback statement · ${range.label} · shared pool ${fmtCurrencyFull(cb.sharedPool)} allocated by ${cb.effectiveMethod}`;
    const blob = new Blob([[meta, header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chargeback-${range.label.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <SectionCard
      title="Cost allocation"
      subtitle={isCharge ? `Shared pool billed back by ${cb.effectiveMethod}` : "Directly-attributed spend by team"}
      action={
        <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
          {(["showback", "chargeback"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2 py-1 font-medium capitalize transition-colors",
                m === mode ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      }
    >
      {isCharge && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Allocate shared by</span>
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs">
            {ALLOCATION_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMethod(m.value)}
                className={cn(
                  "rounded-md px-2 py-1 font-medium transition-colors",
                  m.value === method ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <RankedBars data={bars} color={isCharge ? "var(--primary)" : "var(--series-1)"} />

      <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{isCharge ? "Total charged back" : "Directly attributed"}</span>
          <span className="tnum font-medium text-foreground">{fmtCurrencyFull(isCharge ? grand : cb.directTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {isCharge ? `Shared pool distributed (${cb.effectiveMethod})` : "Shared / unallocated pool"}
          </span>
          <span className="tnum text-muted-foreground">{fmtCurrencyFull(cb.sharedPool)}</span>
        </div>
        <div className="pt-1">
          <Button variant="outline" size="sm" onClick={exportStatement} className="h-8 w-full gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export chargeback statement
          </Button>
        </div>
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
  const caps = useMemo(() => capabilities(dataset), [dataset]);

  const spendDelta = prevSpend ? (k.spend - prevSpend) / prevSpend : 0;
  const orgUtil = dataset.orgMonthlyBudget ? mf.forecast / dataset.orgMonthlyBudget : 0;

  const stagger = (i: number) => ({ animationDelay: `${i * 60}ms` });

  return (
    <div className="space-y-8 px-6 py-6 lg:px-8">
      {/* Overview */}
      <section>
        <SectionHeader title="Overview" hint={`${range.label} · vs prior period`} />
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
      </section>

      {/* Trends */}
      <section>
        <SectionHeader title="Trends" hint={range.label} />
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
            <MixDonut
              data={models}
              colorFor={(key) => modelColor(key, dataset.models)}
              centerLabel="Total"
              centerValue={fmtCurrency(k.spend)}
            />
          </SectionCard>
        </div>
      </section>

      {/* Budgets & allocation */}
      <section>
        <SectionHeader title="Budgets & allocation" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SectionCard
            className="lg:col-span-2"
            title="Budget vs. actual"
            subtitle="Forecast-to-month-end against each team's monthly budget"
          >
            <BudgetTable rows={budgets} />
          </SectionCard>
          <ChargebackCard />
        </div>
      </section>

      {/* Signals */}
      <section>
        <SectionHeader title="Signals" />
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
                  <span className="tnum text-lg font-semibold text-foreground">
                    {caps.hasRequests ? fmtCurrency(k.costPerRequest * 1000) : "—"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {caps.hasRequests
                    ? `${fmtCurrency(k.spend)} over ${k.requests.toLocaleString()} requests`
                    : "request counts need a gateway (Mode ③)"}
                </p>
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <CapsLabel>Error rate</CapsLabel>
                  <span className="tnum text-lg font-semibold text-foreground">
                    {caps.hasErrors ? fmtPct(k.errorRate * 100, 2) : "—"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {caps.hasErrors ? "failed requests across all providers" : "error rates need a gateway (Mode ③)"}
                </p>
              </div>
            </dl>
          </SectionCard>
        </div>
      </section>
    </div>
  );
}
