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
}

export type DataMode = "demo" | "key" | "gateway";

export type PersonaView = "executive" | "platform" | "team" | "audit";

export interface DateRange {
  /** inclusive ISO dates */
  from: string;
  to: string;
  label: string;
}
