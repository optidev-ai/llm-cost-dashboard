// LLM Ledger — Mode ② backend (Supabase / OptiDev Cloud edge function, Deno).
//
// The browser CANNOT call the provider Usage/Cost APIs directly: CORS blocks
// them and an admin key must never ship to the client. This function holds the
// admin key server-side, calls the provider's org usage API, and returns the
// same `Dataset` shape the demo produces — so every view works unchanged.
//
// POST /usage  { provider: "anthropic"|"openai", adminKey?: string, days?: number }
//   - adminKey may come in the body (from the Connect dialog) OR from a secret
//     env var (ANTHROPIC_ADMIN_KEY / OPENAI_ADMIN_KEY) — the more secure setup,
//     where the key never touches the browser at all.
//
// What the billing API can populate: spend, tokens, model & workspace/project
// attribution, cache-hit rate. What it CANNOT: latency, error rates, and (for
// Anthropic) request counts — those live in the request path, i.e. a gateway
// (Mode ③). That gap is exactly the observability-vs-FinOps line this app sells.
//
// Endpoints (verified 2026-07):
//   Anthropic  GET /v1/organizations/usage_report/messages  (x-api-key: sk-ant-admin…)
//   OpenAI     GET /v1/organization/usage/completions        (Bearer sk-…admin)
// Cost is derived from tokens × price (cached/batch adjusted) for a single
// consistent path across both providers — providers' cost endpoints don't break
// down per-model (OpenAI) the way the views need.

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const DAY = 86_400_000;

// ── price table: USD per 1M tokens (illustrative; edit to your negotiated rates)
interface Price { in: number; out: number }
function priceFor(provider: string, model: string): Price {
  const m = model.toLowerCase();
  if (provider === "anthropic") {
    if (m.includes("opus")) return { in: 15, out: 75 };
    if (m.includes("haiku")) return { in: 1, out: 5 };
    if (m.includes("sonnet")) return { in: 3, out: 15 };
    return { in: 3, out: 15 };
  }
  // openai
  if (m.includes("mini") || m.includes("nano")) return { in: 0.15, out: 0.6 };
  if (/\bo\d/.test(m) || m.includes("o3") || m.includes("o1")) return { in: 10, out: 40 };
  if (m.includes("gpt-4o") || m.includes("gpt-5") || m.includes("gpt-4.1")) return { in: 2.5, out: 10 };
  return { in: 2.5, out: 10 };
}

interface RawRow {
  date: string; teamId: string; teamName: string; modelId: string;
  inputTokens: number; outputTokens: number; cachedTokens: number;
  requests: number; errors: number; cost: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Anthropic ────────────────────────────────────────────────────────────────
async function fetchAnthropic(adminKey: string, days: number): Promise<RawRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const rows: RawRow[] = [];
  let page: string | undefined;

  for (let guard = 0; guard < 8; guard++) {
    const qs = new URLSearchParams({
      starting_at: start.toISOString(),
      ending_at: end.toISOString(),
      bucket_width: "1d",
      limit: "31",
    });
    qs.append("group_by[]", "model");
    qs.append("group_by[]", "workspace_id");
    if (page) qs.set("page", page);

    const res = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?${qs}`,
      { headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" } },
    );
    if (!res.ok) throw new Error(`Anthropic usage API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();

    for (const bucket of json.data ?? []) {
      const date = String(bucket.starting_at ?? bucket.start_time ?? "").slice(0, 10);
      for (const r of bucket.results ?? []) {
        const model = r.model ?? "unknown";
        const uncached = r.uncached_input_tokens ?? 0;
        const cacheRead = r.cache_read_input_tokens ?? 0;
        const cacheCreate = r.cache_creation_input_tokens ?? 0;
        const output = r.output_tokens ?? 0;
        if (uncached + cacheRead + cacheCreate + output === 0) continue;
        const p = priceFor("anthropic", model);
        const batch = r.service_tier === "batch" ? 0.5 : 1;
        const cost =
          ((uncached * p.in + cacheRead * p.in * 0.1 + cacheCreate * p.in * 1.25 + output * p.out) / 1e6) * batch;
        const wsId = r.workspace_id ?? "default";
        rows.push({
          date,
          teamId: wsId,
          teamName: r.workspace_id ? `Workspace ${String(wsId).slice(-6)}` : "Default workspace",
          modelId: model,
          inputTokens: uncached + cacheRead + cacheCreate,
          outputTokens: output,
          cachedTokens: cacheRead,
          requests: 0, // Anthropic usage API doesn't return request counts
          errors: 0,
          cost,
        });
      }
    }
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return rows;
}

// ── OpenAI ───────────────────────────────────────────────────────────────────
async function fetchOpenAI(adminKey: string, days: number): Promise<RawRow[]> {
  const startTime = Math.floor((Date.now() - days * DAY) / 1000);
  const rows: RawRow[] = [];
  let page: string | undefined;

  for (let guard = 0; guard < 8; guard++) {
    const qs = new URLSearchParams({ start_time: String(startTime), bucket_width: "1d", limit: "180" });
    qs.append("group_by[]", "model");
    qs.append("group_by[]", "project_id");
    if (page) qs.set("page", page);

    const res = await fetch(`https://api.openai.com/v1/organization/usage/completions?${qs}`, {
      headers: { Authorization: `Bearer ${adminKey}` },
    });
    if (!res.ok) throw new Error(`OpenAI usage API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();

    for (const bucket of json.data ?? []) {
      const date = isoDay(new Date((bucket.start_time ?? 0) * 1000));
      for (const r of bucket.results ?? []) {
        const model = r.model ?? "unknown";
        const input = r.input_tokens ?? 0;
        const cached = r.input_cached_tokens ?? 0;
        const output = r.output_tokens ?? 0;
        if (input + output === 0) continue;
        const p = priceFor("openai", model);
        const batch = r.batch === true ? 0.5 : 1;
        const cost = (((input - cached) * p.in + cached * p.in * 0.5 + output * p.out) / 1e6) * batch;
        const projId = r.project_id ?? "default";
        rows.push({
          date,
          teamId: projId,
          teamName: r.project_id ? `Project ${String(projId).slice(-6)}` : "Default project",
          modelId: model,
          inputTokens: input,
          outputTokens: output,
          cachedTokens: cached,
          requests: r.num_model_requests ?? 0,
          errors: 0,
          cost,
        });
      }
    }
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return rows;
}

// ── normalize → Dataset ────────────────────────────────────────────────────────
function buildDataset(provider: "anthropic" | "openai", rows: RawRow[], days: number) {
  const providerName = provider === "anthropic" ? "Anthropic" : "OpenAI";
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const startDate = dates[0] ?? isoDay(new Date(Date.now() - days * DAY));
  const endDate = dates[dates.length - 1] ?? isoDay(new Date());

  // models seen
  const modelIds = [...new Set(rows.map((r) => r.modelId))];
  const models = modelIds.map((id) => {
    const p = priceFor(provider, id);
    return { id, name: id, provider, priceIn: p.in, priceOut: p.out };
  });

  // teams = workspaces/projects. providers expose no department layer, so each
  // team is its own "department" (the demo has a real 4-department hierarchy).
  const teamMeta = new Map<string, string>();
  rows.forEach((r) => teamMeta.set(r.teamId, r.teamName));

  // derive a monthly budget from trailing-30d run-rate ÷ 0.8 target utilization
  const cut30 = isoDay(new Date(Date.now() - 30 * DAY));
  const spend30 = new Map<string, number>();
  rows.forEach((r) => {
    if (r.date >= cut30) spend30.set(r.teamId, (spend30.get(r.teamId) ?? 0) + r.cost);
  });

  const teams = [...teamMeta.entries()].map(([id, name]) => ({
    id,
    name,
    department: name,
    monthlyBudget: Math.max(50, Math.round(((spend30.get(id) ?? 0) / 0.8) / 10) * 10),
  }));
  const orgMonthlyBudget = Math.round(teams.reduce((s, t) => s + t.monthlyBudget, 0) / 100) * 100;

  return {
    org: `${providerName} org`,
    generatedAt: new Date().toISOString(),
    startDate,
    endDate,
    orgMonthlyBudget,
    providers: [{ id: provider, name: providerName }],
    models,
    teams,
    usage: rows.map((r) => ({
      date: r.date,
      teamId: r.teamId,
      modelId: r.modelId,
      requests: r.requests,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedTokens: r.cachedTokens,
      errors: r.errors,
      cost: r.cost,
      latencyP50: 0, // not available from the billing API — needs a gateway (Mode ③)
      latencyP95: 0,
    })),
    _note: "Live data from the provider billing API. Latency/error/request-count metrics require a gateway (Mode ③); cost is token×price with cached/batch adjustment.",
  };
}

// deno-lint-ignore no-explicit-any
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const provider = body.provider === "openai" ? "openai" : body.provider === "anthropic" ? "anthropic" : null;
    if (!provider) return json({ error: "provider must be 'anthropic' or 'openai'" }, 400);

    const envKey = provider === "anthropic" ? "ANTHROPIC_ADMIN_KEY" : "OPENAI_ADMIN_KEY";
    const adminKey = (body.adminKey && String(body.adminKey).trim()) || Deno.env.get(envKey);
    if (!adminKey) return json({ error: `No admin key provided and ${envKey} is not set` }, 400);

    const days = Math.min(Math.max(Number(body.days) || 90, 1), 180);
    const rows = provider === "anthropic" ? await fetchAnthropic(adminKey, days) : await fetchOpenAI(adminKey, days);
    if (rows.length === 0) return json({ error: "No usage found for this org/time range" }, 404);

    return json(buildDataset(provider, rows, days), 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 502);
  }
});

// deno-lint-ignore no-explicit-any
function json(data: any, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}
