/**
 * Pure selectors over a Dataset. All views read through these so Mode ①/②/③
 * share identical downstream math — only the row source differs.
 */
import type { Dataset, DateRange, ProviderReconcile, Team, UsageRow } from "./types";

export function rowsInRange(ds: Dataset, range: DateRange): UsageRow[] {
  return ds.usage.filter((r) => r.date >= range.from && r.date <= range.to);
}

// ── source capabilities ───────────────────────────────────────────────────────
export interface DatasetCapabilities {
  hasRequests: boolean;
  hasLatency: boolean;
  hasErrors: boolean;
}

/**
 * Which metrics the underlying source actually populates. Billing-API data
 * (Mode ②) reports tokens & cost but zeroes request counts, latency and errors,
 * so views can hide or annotate those panels instead of rendering misleading
 * `$0.00` / `0%`. Derived from data presence, so it stays source-agnostic.
 */
export function capabilities(ds: Dataset): DatasetCapabilities {
  let hasRequests = false;
  let hasLatency = false;
  let hasErrors = false;
  for (const r of ds.usage) {
    if (r.requests > 0) hasRequests = true;
    if (r.latencyP95 > 0) hasLatency = true;
    if (r.errors > 0) hasErrors = true;
    if (hasRequests && hasLatency && hasErrors) break;
  }
  return { hasRequests, hasLatency, hasErrors };
}

function sum<T>(arr: T[], f: (t: T) => number): number {
  return arr.reduce((s, t) => s + f(t), 0);
}

export interface Kpis {
  spend: number;
  requests: number;
  tokens: number;
  cachedTokens: number;
  errors: number;
  activeTeams: number;
  costPerRequest: number;
  cacheHitRate: number; // 0..1
  errorRate: number; // 0..1
}

export function kpis(rows: UsageRow[]): Kpis {
  const spend = sum(rows, (r) => r.cost);
  const requests = sum(rows, (r) => r.requests);
  const inputTokens = sum(rows, (r) => r.inputTokens);
  const outputTokens = sum(rows, (r) => r.outputTokens);
  const cachedTokens = sum(rows, (r) => r.cachedTokens);
  const errors = sum(rows, (r) => r.errors);
  const tokens = inputTokens + outputTokens;
  return {
    spend,
    requests,
    tokens,
    cachedTokens,
    errors,
    activeTeams: new Set(rows.map((r) => r.teamId)).size,
    costPerRequest: requests ? spend / requests : 0,
    cacheHitRate: inputTokens ? cachedTokens / inputTokens : 0,
    errorRate: requests ? errors / requests : 0,
  };
}

/** Weighted latency percentiles (weighted by request volume). */
export function latency(rows: UsageRow[]): { p50: number; p95: number } {
  const w = sum(rows, (r) => r.requests) || 1;
  return {
    p50: sum(rows, (r) => r.latencyP50 * r.requests) / w,
    p95: sum(rows, (r) => r.latencyP95 * r.requests) / w,
  };
}

// ── grouping ────────────────────────────────────────────────────────────────
export interface NamedSpend {
  key: string;
  name: string;
  cost: number;
  share: number;
}

function groupSpend(rows: UsageRow[], keyer: (r: UsageRow) => string, namer: (k: string) => string): NamedSpend[] {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    m.set(keyer(r), (m.get(keyer(r)) ?? 0) + r.cost);
  });
  const total = [...m.values()].reduce((s, v) => s + v, 0) || 1;
  return [...m.entries()]
    .map(([key, cost]) => ({ key, name: namer(key), cost, share: cost / total }))
    .sort((a, b) => b.cost - a.cost);
}

export function spendByTeam(ds: Dataset, rows: UsageRow[]): NamedSpend[] {
  const name = new Map(ds.teams.map((t) => [t.id, t.name]));
  return groupSpend(
    rows,
    (r) => r.teamId,
    (k) => name.get(k) ?? k,
  );
}

export function spendByDept(ds: Dataset, rows: UsageRow[]): NamedSpend[] {
  const dept = new Map(ds.teams.map((t) => [t.id, t.department]));
  return groupSpend(
    rows,
    (r) => dept.get(r.teamId) ?? "—",
    (k) => k,
  );
}

export function spendByModel(ds: Dataset, rows: UsageRow[]): NamedSpend[] {
  const name = new Map(ds.models.map((m) => [m.id, m.name]));
  return groupSpend(
    rows,
    (r) => r.modelId,
    (k) => name.get(k) ?? k,
  );
}

export function spendByProvider(ds: Dataset, rows: UsageRow[]): NamedSpend[] {
  const prov = new Map<string, string>(ds.models.map((m) => [m.id, m.provider]));
  const name = new Map<string, string>(ds.providers.map((p) => [p.id, p.name]));
  return groupSpend(
    rows,
    (r) => prov.get(r.modelId) ?? "—",
    (k) => name.get(k) ?? k,
  );
}

/** Daily total spend across the range. */
export function dailySpend(rows: UsageRow[]): { date: string; cost: number }[] {
  const m = new Map<string, number>();
  rows.forEach((r) => {
    m.set(r.date, (m.get(r.date) ?? 0) + r.cost);
  });
  return [...m.entries()].map(([date, cost]) => ({ date, cost })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Ordered department list for a dataset (by spend, capped; overflow → "Other"). */
export function departments(ds: Dataset, rows: UsageRow[], cap = 6): string[] {
  const ranked = spendByDept(ds, rows).map((d) => d.name);
  if (ranked.length <= cap) return ranked;
  return [...ranked.slice(0, cap), "Other"];
}

/** Daily spend split into one column per department (stacked-area friendly). */
export function dailyByDept(ds: Dataset, rows: UsageRow[], depts: string[]): Record<string, number | string>[] {
  const inSet = new Set(depts);
  const hasOther = inSet.has("Other");
  const dept = new Map(ds.teams.map((t) => [t.id, t.department]));
  const byDate = new Map<string, Record<string, number>>();
  rows.forEach((r) => {
    const d = byDate.get(r.date) ?? {};
    let k = dept.get(r.teamId) ?? "Other";
    if (!inSet.has(k)) k = hasOther ? "Other" : k;
    d[k] = (d[k] ?? 0) + r.cost;
    byDate.set(r.date, d);
  });
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => {
      const row: Record<string, number | string> = { date };
      depts.forEach((dep) => {
        row[dep] = d[dep] ?? 0;
      });
      return row;
    });
}

// ── month-based finance math ─────────────────────────────────────────────────
function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function daysInMonth(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export interface MonthFinance {
  mtd: number;
  forecast: number;
  monthElapsed: number; // fraction 0..1
  lastMonthTotal: number;
  momGrowth: number; // forecast vs last-month total, as fraction
}

/** Month-to-date + straight-line forecast for the month containing ds.endDate. */
export function monthFinance(ds: Dataset): MonthFinance {
  const end = ds.endDate;
  const ms = monthStart(end);
  const dim = daysInMonth(end);
  const dayOfMonth = Number(end.slice(8, 10));
  const elapsed = dayOfMonth / dim;

  const mtd = sum(
    ds.usage.filter((r) => r.date >= ms && r.date <= end),
    (r) => r.cost,
  );

  // previous calendar month total
  const [y, m] = ms.split("-").map(Number);
  const prev = new Date(y, m - 2, 1);
  const prevStart = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
  const prevEnd = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(
    daysInMonth(prevStart),
  ).padStart(2, "0")}`;
  const lastMonthTotal = sum(
    ds.usage.filter((r) => r.date >= prevStart && r.date <= prevEnd),
    (r) => r.cost,
  );

  const forecast = elapsed > 0 ? mtd / elapsed : mtd;
  const momGrowth = lastMonthTotal ? (forecast - lastMonthTotal) / lastMonthTotal : 0;
  return { mtd, forecast, monthElapsed: elapsed, lastMonthTotal, momGrowth };
}

// ── budget vs actual (per team) ───────────────────────────────────────────────
export type BudgetStatus = "under" | "watch" | "over";
export interface TeamBudget {
  teamId: string;
  name: string;
  department: string;
  budget: number;
  mtd: number;
  forecast: number;
  util: number; // forecast / budget
  status: BudgetStatus;
}

export function budgetByTeam(ds: Dataset): TeamBudget[] {
  const ms = monthStart(ds.endDate);
  const elapsed = Number(ds.endDate.slice(8, 10)) / daysInMonth(ds.endDate);
  const mtdByTeam = new Map<string, number>();
  ds.usage
    .filter((r) => r.date >= ms && r.date <= ds.endDate)
    .forEach((r) => {
      mtdByTeam.set(r.teamId, (mtdByTeam.get(r.teamId) ?? 0) + r.cost);
    });

  // Shared/platform cost centers aren't budget-owned — excluded from the
  // per-team accountability table (their spend surfaces via chargeback instead).
  return ds.teams
    .filter((t) => !t.shared)
    .map((t) => {
      const mtd = mtdByTeam.get(t.id) ?? 0;
      const forecast = elapsed > 0 ? mtd / elapsed : mtd;
      const util = t.monthlyBudget ? forecast / t.monthlyBudget : 0;
      const status: BudgetStatus = util >= 1 ? "over" : util >= 0.85 ? "watch" : "under";
      return {
        teamId: t.id,
        name: t.name,
        department: t.department,
        budget: t.monthlyBudget,
        mtd,
        forecast,
        util,
        status,
      };
    })
    .sort((a, b) => b.util - a.util);
}

// ── alerts & anomalies (Audit view) ───────────────────────────────────────────
export interface BudgetAlert {
  teamId: string;
  name: string;
  util: number;
  level: "warning" | "critical";
}

/** Budget-threshold alerts — teams forecast to cross 90% / 100% of budget. */
export function budgetAlerts(ds: Dataset): BudgetAlert[] {
  return budgetByTeam(ds)
    .filter((b) => b.util >= 0.9)
    .map((b) => ({
      teamId: b.teamId,
      name: b.name,
      util: b.util,
      level: b.util >= 1 ? "critical" : ("warning" as const),
    }));
}

export interface Anomaly {
  teamId: string;
  name: string;
  date: string;
  cost: number;
  factor: number; // × trailing median
}

/** Spend-spike detection: a team-day whose cost exceeds `mult`× its trailing-7d median. */
export function anomalies(ds: Dataset, mult = 3): Anomaly[] {
  const name = new Map(ds.teams.map((t) => [t.id, t.name]));
  // daily cost per team
  const byTeam = new Map<string, Map<string, number>>();
  ds.usage.forEach((r) => {
    const m = byTeam.get(r.teamId) ?? new Map<string, number>();
    m.set(r.date, (m.get(r.date) ?? 0) + r.cost);
    byTeam.set(r.teamId, m);
  });
  const out: Anomaly[] = [];
  byTeam.forEach((series, teamId) => {
    const days = [...series.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 7; i < days.length; i++) {
      const window = days
        .slice(i - 7, i)
        .map(([, c]) => c)
        .sort((a, b) => a - b);
      const median = window[Math.floor(window.length / 2)] || 0;
      const [date, cost] = days[i];
      if (median > 0 && cost > median * mult) {
        out.push({ teamId, name: name.get(teamId) ?? teamId, date, cost, factor: cost / median });
      }
    }
  });
  return out.sort((a, b) => b.factor - a.factor).slice(0, 8);
}

/** Biggest week-over-week spend movers (last 7 days vs prior 7). */
export interface Mover {
  teamId: string;
  name: string;
  recent: number;
  prior: number;
  delta: number; // fraction
}
export function topMovers(ds: Dataset, limit = 5): Mover[] {
  const end = ds.endDate;
  const endD = new Date(`${end}T00:00:00`);
  const cut = (n: number) => {
    const d = new Date(endD);
    d.setDate(endD.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const recentFrom = cut(6);
  const priorFrom = cut(13);
  const priorTo = cut(7);
  const name = new Map(ds.teams.map((t) => [t.id, t.name]));
  const acc = new Map<string, { recent: number; prior: number }>();
  ds.usage.forEach((r) => {
    const a = acc.get(r.teamId) ?? { recent: 0, prior: 0 };
    if (r.date >= recentFrom && r.date <= end) a.recent += r.cost;
    else if (r.date >= priorFrom && r.date <= priorTo) a.prior += r.cost;
    acc.set(r.teamId, a);
  });
  return [...acc.entries()]
    .map(([teamId, v]) => ({
      teamId,
      name: name.get(teamId) ?? teamId,
      recent: v.recent,
      prior: v.prior,
      delta: v.prior ? (v.recent - v.prior) / v.prior : 0,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

// ── invoice reconciliation ─────────────────────────────────────────────────────
export interface Reconciliation {
  /** Actual billed cost (Cost API, or the user-entered invoice total). */
  billed: number;
  /** Our token × list-price estimate over the same window. */
  estimated: number;
  /** billed − estimated (negative = billed below list price). */
  delta: number;
  /** delta / estimated; negative = effective discount vs list price. */
  deltaPct: number;
  /** true when billed < estimated (discounts / caching / batch working). */
  underList: boolean;
  source: "cost-api" | "invoice";
  from: string;
  to: string;
  byProvider: ProviderReconcile[];
}

/**
 * Reconcile the list-price estimate against actual billed cost.
 *
 * `invoiceTotal`, when provided (> 0), overrides the Cost-API billed figure —
 * the last-mile check against the real invoice, which can include taxes,
 * minimums and credits the Cost API omits. Returns null when the dataset
 * carries no billing truth (nothing to reconcile against yet).
 */
export function reconcile(ds: Dataset, invoiceTotal?: number): Reconciliation | null {
  const b = ds.billing;
  if (!b) return null;
  const estimated = b.estimatedCost;
  const useInvoice = invoiceTotal !== undefined && invoiceTotal > 0;
  const billed = useInvoice ? invoiceTotal : b.billedCost;
  const delta = billed - estimated;
  return {
    billed,
    estimated,
    delta,
    deltaPct: estimated ? delta / estimated : 0,
    underList: delta < 0,
    source: useInvoice ? "invoice" : b.source,
    from: b.from,
    to: b.to,
    byProvider: b.byProvider ?? [],
  };
}

// ── chargeback (real cost allocation) ───────────────────────────────────────────
export type AllocationMethod = "usage" | "equal" | "headcount";

export interface ChargebackRow {
  teamId: string;
  name: string;
  department: string;
  /** The team's own, directly-attributed spend (this is showback). */
  direct: number;
  /** Its share of the shared/unallocated pool (0 in showback). */
  allocated: number;
  /** direct + allocated. */
  total: number;
  /** total / grand total. */
  share: number;
}

export interface Chargeback {
  rows: ChargebackRow[];
  /** Sum of shared/unallocated cost centers over the range. */
  sharedPool: number;
  /** Directly-attributed spend across budget-owned teams. */
  directTotal: number;
  /** Method requested. */
  method: AllocationMethod;
  /** Method actually applied (falls back to "equal" if headcount is unavailable). */
  effectiveMethod: AllocationMethod;
}

/**
 * Real chargeback allocation. Showback = each team's `direct` cost only, with the
 * shared pool left explicit. Chargeback distributes that shared pool across the
 * budget-owned teams by the chosen driver (usage share / equal split / headcount),
 * so every dollar lands on a team and the totals tie out to the full bill. This
 * is the genuine allocation math a cosmetic showback/chargeback relabel skips.
 */
export function chargeback(ds: Dataset, rows: UsageRow[], method: AllocationMethod = "usage"): Chargeback {
  const teamById = new Map(ds.teams.map((t) => [t.id, t]));
  const isShared = (id: string): boolean => teamById.get(id)?.shared === true;

  // direct spend per budget-owned team; shared spend → the pool
  const direct = new Map<string, number>();
  let sharedPool = 0;
  for (const r of rows) {
    if (isShared(r.teamId)) sharedPool += r.cost;
    else direct.set(r.teamId, (direct.get(r.teamId) ?? 0) + r.cost);
  }

  const teams = ds.teams.filter((t) => !t.shared);
  const directTotal = [...direct.values()].reduce((s, v) => s + v, 0);

  // headcount allocation needs headcount on every team; else fall back to equal
  const canHeadcount = teams.length > 0 && teams.every((t) => (t.headcount ?? 0) > 0);
  const effectiveMethod: AllocationMethod = method === "headcount" && !canHeadcount ? "equal" : method;

  const weightOf = (t: Team): number => {
    if (effectiveMethod === "usage") return direct.get(t.id) ?? 0;
    if (effectiveMethod === "headcount") return t.headcount ?? 0;
    return 1; // equal
  };
  const weightSum = teams.reduce((s, t) => s + weightOf(t), 0) || 1;
  const grand = directTotal + sharedPool || 1;

  const cbRows: ChargebackRow[] = teams
    .map((t) => {
      const d = direct.get(t.id) ?? 0;
      const allocated = (weightOf(t) / weightSum) * sharedPool;
      const total = d + allocated;
      return {
        teamId: t.id,
        name: t.name,
        department: t.department,
        direct: d,
        allocated,
        total,
        share: total / grand,
      };
    })
    .sort((a, b) => b.total - a.total);

  return { rows: cbRows, sharedPool, directTotal, method, effectiveMethod };
}
