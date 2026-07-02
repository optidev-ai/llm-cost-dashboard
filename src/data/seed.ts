/**
 * Deterministic synthetic-org generator for Mode ① (demo).
 *
 * A fixed RNG seed keeps the *shape* stable across reloads (so the demo always
 * looks the same), while the date window rolls forward to "today" so the
 * dashboard feels live. Costs are derived from tokens × model price, so every
 * number is internally consistent — spend always ties back to usage.
 *
 * 12 teams · 4 departments · 6 models · 3 providers · 90 days, with a couple of
 * injected anomalies (a runaway batch job, a team trending over budget) so the
 * alerting / budget views have something real to show.
 */

import type { Dataset, Model, Provider, Team, UsageRow } from "@/lib/types";

// ── seeded RNG (mulberry32) ────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── catalog ────────────────────────────────────────────────────────────────
const PROVIDERS: Provider[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
];

const MODELS: Model[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", priceIn: 2.5, priceOut: 10 },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "openai", priceIn: 0.15, priceOut: 0.6 },
  { id: "o3", name: "o3", provider: "openai", priceIn: 10, priceOut: 40 },
  { id: "claude-opus-4", name: "Claude Opus 4", provider: "anthropic", priceIn: 15, priceOut: 75 },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", provider: "anthropic", priceIn: 3, priceOut: 15 },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", priceIn: 1.25, priceOut: 5 },
];

// model → baseline latency (ms) and typical output/input token ratio
const MODEL_PROFILE: Record<string, { p50: number; p95: number; outRatio: number }> = {
  "gpt-4o": { p50: 1500, p95: 3600, outRatio: 0.55 },
  "gpt-4o-mini": { p50: 650, p95: 1400, outRatio: 0.5 },
  o3: { p50: 4200, p95: 9500, outRatio: 0.9 },
  "claude-opus-4": { p50: 2600, p95: 6400, outRatio: 0.7 },
  "claude-sonnet-4": { p50: 1500, p95: 3400, outRatio: 0.6 },
  "gemini-2.5-pro": { p50: 1300, p95: 3100, outRatio: 0.55 },
};

interface TeamCfg {
  id: string;
  name: string;
  department: string;
  scale: number; // relative daily request volume
  weights: Partial<Record<string, number>>; // model mix
  avgInTokens: number; // avg input tokens per request
  cache: number; // cache affinity 0..1
  util: number; // target forecast/budget utilization (drives monthlyBudget)
  errRate: number;
}

const TEAMS: TeamCfg[] = [
  // Engineering
  { id: "platform-eng", name: "Platform Eng", department: "Engineering", scale: 2.6, weights: { "claude-sonnet-4": 5, "gpt-4o": 3, o3: 2, "claude-opus-4": 1 }, avgInTokens: 3200, cache: 0.55, util: 0.71, errRate: 0.004 },
  { id: "core-product", name: "Core Product", department: "Engineering", scale: 3.0, weights: { "gpt-4o": 4, "claude-sonnet-4": 4, "gpt-4o-mini": 2 }, avgInTokens: 2400, cache: 0.48, util: 0.83, errRate: 0.005 },
  { id: "data-ml", name: "Data & ML", department: "Engineering", scale: 2.2, weights: { o3: 4, "claude-opus-4": 3, "gemini-2.5-pro": 3 }, avgInTokens: 5200, cache: 0.3, util: 0.64, errRate: 0.006 },
  { id: "devex", name: "Developer Experience", department: "Engineering", scale: 1.2, weights: { "claude-sonnet-4": 5, "gpt-4o-mini": 5 }, avgInTokens: 1800, cache: 0.62, util: 0.52, errRate: 0.004 },
  // Customer
  { id: "support-copilot", name: "Support Copilot", department: "Customer", scale: 4.2, weights: { "gpt-4o-mini": 6, "claude-haiku": 0, "claude-sonnet-4": 3, "gpt-4o": 1 }, avgInTokens: 1500, cache: 0.72, util: 0.94, errRate: 0.007 },
  { id: "customer-success", name: "Customer Success", department: "Customer", scale: 1.0, weights: { "gpt-4o": 5, "claude-sonnet-4": 5 }, avgInTokens: 2000, cache: 0.4, util: 0.58, errRate: 0.005 },
  { id: "solutions-eng", name: "Solutions Eng", department: "Customer", scale: 0.9, weights: { "claude-sonnet-4": 6, "gpt-4o": 4 }, avgInTokens: 2600, cache: 0.45, util: 0.61, errRate: 0.004 },
  // Growth
  { id: "marketing", name: "Marketing", department: "Growth", scale: 1.6, weights: { "gpt-4o": 6, "gemini-2.5-pro": 4 }, avgInTokens: 2200, cache: 0.35, util: 0.68, errRate: 0.006 },
  { id: "content-seo", name: "Content & SEO", department: "Growth", scale: 2.0, weights: { "gpt-4o": 5, "gemini-2.5-pro": 3, "claude-sonnet-4": 2 }, avgInTokens: 3400, cache: 0.42, util: 0.77, errRate: 0.005 },
  { id: "growth-eng", name: "Growth Eng", department: "Growth", scale: 1.1, weights: { "claude-sonnet-4": 4, "gpt-4o": 3, o3: 3 }, avgInTokens: 2800, cache: 0.5, util: 1.08, errRate: 0.009 },
  // Operations
  { id: "revops", name: "RevOps", department: "Operations", scale: 0.8, weights: { "gpt-4o": 5, "gpt-4o-mini": 5 }, avgInTokens: 1900, cache: 0.5, util: 0.55, errRate: 0.004 },
  { id: "legal-compliance", name: "Legal & Compliance", department: "Operations", scale: 0.35, weights: { "claude-opus-4": 6, "claude-sonnet-4": 4 }, avgInTokens: 6800, cache: 0.25, util: 0.41, errRate: 0.003 },
];

// injected anomalies: teamId, days-before-end, duration, spend multiplier
const ANOMALIES = [
  { teamId: "growth-eng", offset: 16, days: 2, mult: 5.5 }, // runaway eval batch
];

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDataset(days = 90): Dataset {
  const rng = mulberry32(0x5eed);
  const modelById = Object.fromEntries(MODELS.map((m) => [m.id, m]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(toISO(d));
  }

  const usage: UsageRow[] = [];

  TEAMS.forEach((team) => {
    // normalize model weights (drop any zero/unknown)
    const entries = Object.entries(team.weights).filter(
      ([id, w]) => modelById[id] && (w ?? 0) > 0,
    ) as [string, number][];
    const wsum = entries.reduce((s, [, w]) => s + w, 0);
    const mix = entries.map(([id, w]) => ({ id, p: w / wsum }));

    dates.forEach((date, di) => {
      const dow = new Date(date + "T00:00:00").getDay();
      const weekend = dow === 0 || dow === 6 ? 0.5 : 1;
      const trend = 0.78 + (di / days) * 0.42; // gradual adoption growth
      const noise = 0.85 + rng() * 0.3;
      let dayReq = team.scale * 900 * weekend * trend * noise;

      // anomaly overlay
      for (const a of ANOMALIES) {
        if (a.teamId === team.id) {
          const start = days - a.offset;
          if (di >= start && di < start + a.days) dayReq *= a.mult;
        }
      }

      mix.forEach(({ id, p }) => {
        const model = modelById[id];
        const prof = MODEL_PROFILE[id];
        const reqs = Math.max(0, Math.round(dayReq * p * (0.9 + rng() * 0.2)));
        if (reqs === 0) return;
        const inPerReq = team.avgInTokens * (0.8 + rng() * 0.4);
        const inputTokens = Math.round(reqs * inPerReq);
        const outputTokens = Math.round(inputTokens * prof.outRatio * (0.85 + rng() * 0.3));
        const cachedTokens = Math.round(inputTokens * team.cache * (0.6 + rng() * 0.4));
        const errors = Math.round(reqs * team.errRate * (0.5 + rng()));
        const billableIn = inputTokens - cachedTokens;
        const cost =
          (billableIn * model.priceIn) / 1e6 +
          (cachedTokens * model.priceIn * 0.1) / 1e6 +
          (outputTokens * model.priceOut) / 1e6;
        usage.push({
          date,
          teamId: team.id,
          modelId: id,
          requests: reqs,
          inputTokens,
          outputTokens,
          cachedTokens,
          errors,
          cost,
          latencyP50: Math.round(prof.p50 * (0.9 + rng() * 0.25)),
          latencyP95: Math.round(prof.p95 * (0.9 + rng() * 0.3)),
        });
      });
    });
  });

  // derive monthly budgets from trailing-30d run-rate ÷ target utilization
  const last30 = dates.slice(-30);
  const last30Set = new Set(last30);
  const spend30: Record<string, number> = {};
  usage.forEach((r) => {
    if (last30Set.has(r.date)) spend30[r.teamId] = (spend30[r.teamId] ?? 0) + r.cost;
  });
  const teams: Team[] = TEAMS.map((t) => {
    const runRate = spend30[t.id] ?? 0; // ≈ monthly
    const budget = runRate / t.util;
    return {
      id: t.id,
      name: t.name,
      department: t.department,
      monthlyBudget: Math.max(500, Math.round(budget / 100) * 100),
    };
  });
  const orgMonthlyBudget = Math.round(teams.reduce((s, t) => s + t.monthlyBudget, 0) / 1000) * 1000;

  return {
    org: "Acme Corp",
    generatedAt: new Date().toISOString(),
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    orgMonthlyBudget,
    providers: PROVIDERS,
    models: MODELS,
    teams,
    usage,
  };
}

let _cache: Dataset | null = null;
/** Memoized demo dataset (built once per page load). */
export function getDemoDataset(): Dataset {
  if (!_cache) _cache = buildDataset();
  return _cache;
}
