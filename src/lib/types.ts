/**
 * Domain model for the LLM Cost & Usage Governance dashboard.
 *
 * The shape is deliberately gateway-friendly: a `UsageRow` mirrors what an
 * LLM gateway (LiteLLM, Cloudflare AI Gateway) emits per request-batch, tagged
 * with the attribution dimensions (team, model, provider) that org FinOps needs.
 * Mode ① (demo) synthesizes these rows; Mode ②/③ will populate them from a
 * provider Usage/Cost API or a gateway export — same downstream analytics.
 */

export type ProviderId = "openai" | "anthropic" | "google";

export interface Provider {
  id: ProviderId;
  name: string;
}

export interface Model {
  id: string;
  name: string;
  provider: ProviderId;
  /** USD per 1M input tokens */
  priceIn: number;
  /** USD per 1M output tokens */
  priceOut: number;
}

export interface Team {
  id: string;
  name: string;
  department: string;
  /** USD/month allocated budget */
  monthlyBudget: number;
  /** Optional headcount — enables headcount-based chargeback allocation. */
  headcount?: number;
  /**
   * Shared / platform cost centers (evals, shared infra, unattributed traffic)
   * aren't budget-owned by a single team. Their spend is the pool that
   * chargeback distributes across the budget-owned teams.
   */
  shared?: boolean;
}

/** One team's usage of one model on one day — the atomic fact. */
export interface UsageRow {
  date: string; // yyyy-mm-dd
  teamId: string;
  modelId: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  errors: number;
  cost: number; // USD, derived from tokens × model price
  latencyP50: number; // ms
  latencyP95: number; // ms
}

/** One provider's billed-vs-estimated split, for reconciliation. */
export interface ProviderReconcile {
  provider: ProviderId;
  /** Actual billed cost (provider Cost API). */
  billed: number;
  /** Our token × list-price estimate. */
  estimated: number;
}

/**
 * Reconciles our list-price estimate against the provider's ACTUAL billed cost.
 *
 * Our per-row `cost` is `tokens × published price` — it can't see committed-use
 * discounts, batch pricing, or negotiated rates. The provider Cost API (or the
 * real invoice) is the truth finance defends. This block carries both figures
 * over the same window so a view can show the gap and explain it. Optional:
 * absent when the source can't supply billed cost (e.g. demo before wiring, or
 * a provider whose Cost API we couldn't reach).
 */
export interface BillingReconciliation {
  /** Actual billed cost over [from, to], from the Cost API or a user invoice. */
  billedCost: number;
  /** Our token × list-price estimate over the same window. */
  estimatedCost: number;
  /** Provenance of `billedCost`. */
  source: "cost-api" | "invoice";
  /** ISO dates of the reconciled period (inclusive). */
  from: string;
  to: string;
  byProvider?: ProviderReconcile[];
}

export interface Dataset {
  org: string;
  generatedAt: string;
  /** ISO date of the first and last day covered (inclusive). */
  startDate: string;
  endDate: string;
  orgMonthlyBudget: number;
  providers: Provider[];
  models: Model[];
  teams: Team[];
  usage: UsageRow[];
  /** Invoice reconciliation, when the source can supply actual billed cost. */
  billing?: BillingReconciliation;
}

export type DataMode = "demo" | "key" | "gateway";

export type PersonaView = "executive" | "platform" | "team" | "audit";

export interface DateRange {
  /** inclusive ISO dates */
  from: string;
  to: string;
  label: string;
}
