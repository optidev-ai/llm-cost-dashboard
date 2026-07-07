// LLM Ledger — Mode ② backend (Supabase / OptiDev Cloud edge function, Deno).
//
// One endpoint, two actions (POST body { action }):
//   • "connect" { provider, adminKey } → encrypts the admin key and stores it in
//     the project's Cloud DB (self-provisions the app_usage_credential table).
//     Runs ONCE; the key never lives in the browser after this.
//   • "fetch"   { days? }              → reads the stored key, calls the provider
//     Usage/Cost API, returns the app's Dataset. Returns { needsKey: true } if no
//     key is stored. Falls back to a body key or ANTHROPIC_ADMIN_KEY /
//     OPENAI_ADMIN_KEY env secret.
//
// Called through the OptiDev HMAC gateway (the web app signs each request); CORS
// therefore allows the gateway headers. What the billing API can't give
// (latency, errors, request counts) needs a gateway integration — that's Mode ③.
//
// Endpoints (verified live 2026-07): Anthropic /v1/organizations/usage_report/messages
// + /cost_report (x-api-key sk-ant-admin); OpenAI /v1/organization/usage/completions
// + /costs (Bearer admin; daily buckets cap at limit=31 → paginate). Cost =
// tokens × price (cached/batch adjusted).

import postgres from "npm:postgres@3";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-session-id, x-ts, x-sig",
};

const DAY = 86_400_000;
type Provider = "anthropic" | "openai";

// ── price table: USD per 1M tokens (illustrative; edit to negotiated rates) ────
interface Price { in: number; out: number }
function priceFor(provider: string, model: string): Price {
  const m = model.toLowerCase();
  if (provider === "anthropic") {
    if (m.includes("opus")) return { in: 15, out: 75 };
    if (m.includes("haiku")) return { in: 1, out: 5 };
    return { in: 3, out: 15 };
  }
  if (m.includes("mini") || m.includes("nano")) return { in: 0.15, out: 0.6 };
  if (/\bo\d/.test(m) || m.includes("o3") || m.includes("o1")) return { in: 10, out: 40 };
  return { in: 2.5, out: 10 };
}

interface RawRow {
  date: string; teamId: string; teamName: string; modelId: string;
  inputTokens: number; outputTokens: number; cachedTokens: number;
  requests: number; errors: number; cost: number;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// ── parallel time-chunking ──────────────────────────────────────────────────────
// Provider org APIs are slow per request and cap at 31 daily buckets per page.
// Crawling next_page sequentially means N slow round-trips (and the 13-month
// auto-widen below becomes ~13 of them → minutes). Instead we split the window
// into contiguous ≤30-day sub-ranges and fetch them CONCURRENTLY (capped), so the
// whole pull collapses to roughly one request's latency. Ranges tile with an
// exclusive upper bound (both APIs document ending_at/end_time as exclusive), so
// no day is double-counted; usage rows are additionally deduped by
// (date, team, model) — a tuple the APIs already aggregate to — as insurance.
const CHUNK_DAYS = 30;
const FETCH_CONCURRENCY = 5;

interface TimeWindow {
  start: Date;
  end: Date;
}

function timeWindows(days: number, chunkDays = CHUNK_DAYS): TimeWindow[] {
  const windows: TimeWindow[] = [];
  let cursorMs = Date.now();
  let remaining = days;
  while (remaining > 0) {
    const span = Math.min(chunkDays, remaining);
    const startMs = cursorMs - span * DAY;
    windows.push({ start: new Date(startMs), end: new Date(cursorMs) });
    cursorMs = startMs;
    remaining -= span;
  }
  return windows;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function dedupeRows(rows: RawRow[]): RawRow[] {
  const seen = new Set<string>();
  const out: RawRow[] = [];
  for (const r of rows) {
    const k = `${r.date}|${r.teamId}|${r.modelId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// ── provider fetchers (usage) ────────────────────────────────────────────────────
async function fetchAnthropicWindow(adminKey: string, w: TimeWindow): Promise<RawRow[]> {
  const qs = new URLSearchParams({ starting_at: w.start.toISOString(), ending_at: w.end.toISOString(), bucket_width: "1d", limit: "31" });
  qs.append("group_by[]", "model");
  qs.append("group_by[]", "workspace_id");
  const res = await fetch(`https://api.anthropic.com/v1/organizations/usage_report/messages?${qs}`, {
    headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`Anthropic usage API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const rows: RawRow[] = [];
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
      const cost = ((uncached * p.in + cacheRead * p.in * 0.1 + cacheCreate * p.in * 1.25 + output * p.out) / 1e6) * batch;
      const wsId = r.workspace_id ?? "default";
      rows.push({
        date, teamId: wsId, teamName: r.workspace_id ? `Workspace ${String(wsId).slice(-6)}` : "Default workspace",
        modelId: model, inputTokens: uncached + cacheRead + cacheCreate, outputTokens: output,
        cachedTokens: cacheRead, requests: 0, errors: 0, cost,
      });
    }
  }
  return rows;
}

async function fetchAnthropic(adminKey: string, days: number): Promise<RawRow[]> {
  const parts = await mapLimit(timeWindows(days), FETCH_CONCURRENCY, (w) => fetchAnthropicWindow(adminKey, w));
  return dedupeRows(parts.flat());
}

async function fetchOpenAIWindow(adminKey: string, w: TimeWindow): Promise<RawRow[]> {
  const qs = new URLSearchParams({
    start_time: String(Math.floor(w.start.getTime() / 1000)),
    end_time: String(Math.floor(w.end.getTime() / 1000)),
    bucket_width: "1d",
    limit: "31",
  });
  qs.append("group_by[]", "model");
  qs.append("group_by[]", "project_id");
  const res = await fetch(`https://api.openai.com/v1/organization/usage/completions?${qs}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI usage API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const rows: RawRow[] = [];
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
        date, teamId: projId, teamName: r.project_id ? `Project ${String(projId).slice(-6)}` : "Default project",
        modelId: model, inputTokens: input, outputTokens: output, cachedTokens: cached,
        requests: r.num_model_requests ?? 0, errors: 0, cost,
      });
    }
  }
  return rows;
}

async function fetchOpenAI(adminKey: string, days: number): Promise<RawRow[]> {
  const parts = await mapLimit(timeWindows(days), FETCH_CONCURRENCY, (w) => fetchOpenAIWindow(adminKey, w));
  return dedupeRows(parts.flat());
}

// ── actual billed cost (Cost API — the invoice truth) ───────────────────────────
// The usage fetchers above compute cost = tokens × list price. The Cost API
// returns what the org was ACTUALLY billed (committed-use / batch discounts,
// negotiated rates). Reconciling the two is the finance-grade differentiator.
// Best-effort: a failure here must never break the usage response.
async function fetchAnthropicBilledWindow(adminKey: string, w: TimeWindow): Promise<number> {
  const qs = new URLSearchParams({ starting_at: w.start.toISOString(), ending_at: w.end.toISOString(), bucket_width: "1d", limit: "31" });
  const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, {
    headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`Anthropic cost API ${res.status}`);
  const json = await res.json();
  let total = 0;
  for (const bucket of json.data ?? []) {
    for (const r of bucket.results ?? []) total += Number(r.amount ?? 0);
  }
  return total;
}

async function fetchAnthropicBilled(adminKey: string, days: number): Promise<number> {
  // Non-overlapping (exclusive-end) windows → summing per-window totals is exact.
  const parts = await mapLimit(timeWindows(days), FETCH_CONCURRENCY, (w) => fetchAnthropicBilledWindow(adminKey, w));
  return parts.reduce((s, v) => s + v, 0);
}

async function fetchOpenAIBilledWindow(adminKey: string, w: TimeWindow): Promise<number> {
  const qs = new URLSearchParams({
    start_time: String(Math.floor(w.start.getTime() / 1000)),
    end_time: String(Math.floor(w.end.getTime() / 1000)),
    bucket_width: "1d",
    limit: "31",
  });
  const res = await fetch(`https://api.openai.com/v1/organization/costs?${qs}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI cost API ${res.status}`);
  const json = await res.json();
  let total = 0;
  for (const bucket of json.data ?? []) {
    for (const r of bucket.results ?? []) total += Number(r.amount?.value ?? 0);
  }
  return total;
}

async function fetchOpenAIBilled(adminKey: string, days: number): Promise<number> {
  const parts = await mapLimit(timeWindows(days), FETCH_CONCURRENCY, (w) => fetchOpenAIBilledWindow(adminKey, w));
  return parts.reduce((s, v) => s + v, 0);
}

// ── normalize → Dataset ──────────────────────────────────────────────────────
function buildDataset(provider: Provider, rows: RawRow[], days: number) {
  const providerName = provider === "anthropic" ? "Anthropic" : "OpenAI";
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const modelIds = [...new Set(rows.map((r) => r.modelId))];
  const models = modelIds.map((id) => { const p = priceFor(provider, id); return { id, name: id, provider, priceIn: p.in, priceOut: p.out }; });
  const teamMeta = new Map<string, string>();
  rows.forEach((r) => teamMeta.set(r.teamId, r.teamName));
  const cut30 = isoDay(new Date(Date.now() - 30 * DAY));
  const spend30 = new Map<string, number>();
  rows.forEach((r) => { if (r.date >= cut30) spend30.set(r.teamId, (spend30.get(r.teamId) ?? 0) + r.cost); });
  const teams = [...teamMeta.entries()].map(([id, name]) => ({
    id, name, department: name, monthlyBudget: Math.max(50, Math.round(((spend30.get(id) ?? 0) / 0.8) / 10) * 10),
  }));
  return {
    org: `${providerName} org`,
    generatedAt: new Date().toISOString(),
    startDate: dates[0] ?? isoDay(new Date(Date.now() - days * DAY)),
    endDate: dates[dates.length - 1] ?? isoDay(new Date()),
    orgMonthlyBudget: Math.round(teams.reduce((s, t) => s + t.monthlyBudget, 0) / 100) * 100,
    providers: [{ id: provider, name: providerName }],
    models, teams,
    usage: rows.map((r) => ({
      date: r.date, teamId: r.teamId, modelId: r.modelId, requests: r.requests,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedTokens: r.cachedTokens,
      errors: r.errors, cost: r.cost, latencyP50: 0, latencyP95: 0,
    })),
    _note: "Live data from the provider billing API. Latency/error/request-count metrics require a gateway (Mode ③); cost is token×price with cached/batch adjustment.",
  };
}

// ── encrypted credential storage (self-provisioning table in the project's DB) ──
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const ub64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("USAGE_ENCRYPTION_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_DB_URL") ?? "insecure-dev-key";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(plain: string): Promise<{ ct: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain));
  return { ct: b64(new Uint8Array(buf)), iv: b64(iv) };
}
async function decrypt(ct: string, iv: string): Promise<string> {
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub64(iv) }, await aesKey(), ub64(ct));
  return new TextDecoder().decode(buf);
}

// Deno edge functions get SUPABASE_DB_URL (direct Postgres). Use the transaction
// pooler with prepare:false; one short-lived connection per invocation.
function dbUrl(): string | undefined {
  return Deno.env.get("SUPABASE_DB_URL");
}

async function saveCredential(provider: Provider, adminKey: string): Promise<void> {
  const url = dbUrl();
  if (!url) throw new Error("cloud_not_active");
  const { ct, iv } = await encrypt(adminKey);
  const sql = postgres(url, { prepare: false });
  try {
    await sql`create table if not exists app_usage_credential (
      id text primary key default 'default',
      provider text not null,
      key_encrypted text not null,
      key_iv text not null,
      updated_at timestamptz not null default now()
    )`;
    await sql`insert into app_usage_credential (id, provider, key_encrypted, key_iv, updated_at)
      values ('default', ${provider}, ${ct}, ${iv}, now())
      on conflict (id) do update set
        provider = excluded.provider,
        key_encrypted = excluded.key_encrypted,
        key_iv = excluded.key_iv,
        updated_at = now()`;
    // Invalidate any cached datasets — the key just changed, so cached data may
    // belong to a different key/org. Best-effort (table may not exist yet).
    await sql`delete from app_usage_cache where true`.catch(() => {});
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function loadCredential(): Promise<{ provider: Provider; adminKey: string } | null> {
  const url = dbUrl();
  if (!url) return null;
  const sql = postgres(url, { prepare: false });
  try {
    const rows = await sql`select provider, key_encrypted, key_iv from app_usage_credential where id = 'default' limit 1`;
    if (!rows.length) return null;
    return { provider: rows[0].provider as Provider, adminKey: await decrypt(rows[0].key_encrypted, rows[0].key_iv) };
  } catch {
    // table not created yet (no connect has happened) → treat as no key
    return null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ── server-side dataset cache (skip the slow provider APIs on repeat loads) ─────
// Billing/usage data changes slowly; caching the built Dataset for a few minutes
// turns repeat loads (reloads, background revalidations, multiple viewers) from a
// multi-second provider round-trip into a single fast DB read. `refresh` bypasses it.
const CACHE_TTL_MIN = 10;

async function loadCachedDataset(provider: Provider, days: number): Promise<unknown | null> {
  const url = dbUrl();
  if (!url) return null;
  const sql = postgres(url, { prepare: false });
  try {
    const rows = await sql`select dataset from app_usage_cache
      where id = ${`${provider}:${days}`} and updated_at > now() - (${CACHE_TTL_MIN} * interval '1 minute')
      limit 1`;
    return rows.length ? rows[0].dataset : null;
  } catch {
    return null; // table not created yet / read error → treat as cache miss
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function saveCachedDataset(provider: Provider, days: number, dataset: unknown): Promise<void> {
  const url = dbUrl();
  if (!url) return;
  const sql = postgres(url, { prepare: false });
  try {
    await sql`create table if not exists app_usage_cache (
      id text primary key,
      dataset jsonb not null,
      updated_at timestamptz not null default now()
    )`;
    await sql`insert into app_usage_cache (id, dataset, updated_at)
      values (${`${provider}:${days}`}, ${sql.json(dataset as object)}, now())
      on conflict (id) do update set dataset = excluded.dataset, updated_at = now()`;
  } catch {
    // cache write is best-effort — never fail the fetch over it
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } });
}

// Fetch actual billed cost for a provider (best-effort; 0 on any error).
async function fetchBilled(provider: Provider, adminKey: string, days: number): Promise<number> {
  try {
    return provider === "anthropic"
      ? await fetchAnthropicBilled(adminKey, days)
      : await fetchOpenAIBilled(adminKey, days);
  } catch {
    return 0;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const body = await req.json().catch(() => ({}));
  const action = body.action === "connect" ? "connect" : "fetch";

  try {
    if (action === "connect") {
      const provider: Provider = body.provider === "openai" ? "openai" : "anthropic";
      const adminKey = String(body.adminKey ?? "").trim();
      if (adminKey.length < 8) return json({ error: "missing adminKey" }, 400);
      await saveCredential(provider, adminKey);
      return json({ ok: true, provider }, 200);
    }

    const days = Math.min(Math.max(Number(body.days) || 90, 1), 180);
    const refresh = body.refresh === true;
    let cred = await loadCredential();
    if (!cred) {
      const bodyKey = body.adminKey && String(body.adminKey).trim();
      if (bodyKey) cred = { provider: body.provider === "openai" ? "openai" : "anthropic", adminKey: bodyKey };
      else if (Deno.env.get("ANTHROPIC_ADMIN_KEY")) cred = { provider: "anthropic", adminKey: Deno.env.get("ANTHROPIC_ADMIN_KEY")! };
      else if (Deno.env.get("OPENAI_ADMIN_KEY")) cred = { provider: "openai", adminKey: Deno.env.get("OPENAI_ADMIN_KEY")! };
    }
    if (!cred) return json({ needsKey: true }, 200);

    // Fast path: return the recently-cached dataset without touching the (slow)
    // provider APIs. `refresh: true` forces a fresh pull.
    if (!refresh) {
      const cached = await loadCachedDataset(cred.provider, days);
      if (cached) return json(cached, 200);
    }

    const fetcher = cred.provider === "anthropic" ? fetchAnthropic : fetchOpenAI;
    // Fetch usage and actual billed cost concurrently (they're independent, and
    // each provider call is slow) — roughly halves the round-trip.
    let effectiveDays = days;
    let [rows, billedCost] = await Promise.all([
      fetcher(cred.adminKey, effectiveDays),
      fetchBilled(cred.provider, cred.adminKey, effectiveDays),
    ]);
    // Sparse orgs (test / low-usage) can have no activity in the requested window
    // but real spend further back. Auto-widen once to ~13 months before giving up.
    // Active orgs hit the first pass and never pay for the wider scan.
    if (rows.length === 0 && effectiveDays < 400) {
      effectiveDays = 400;
      [rows, billedCost] = await Promise.all([
        fetcher(cred.adminKey, effectiveDays),
        fetchBilled(cred.provider, cred.adminKey, effectiveDays),
      ]);
    }
    if (rows.length === 0) {
      return json({ error: "No usage found for this org in the last 13 months. The key is valid, but the org has no recorded activity in that window — check the provider's own usage dashboard." }, 404);
    }
    const dataset = buildDataset(cred.provider, rows, effectiveDays);
    // Attach invoice reconciliation from the Cost API (best-effort — the usage
    // response stands on its own if the Cost API was unavailable, billedCost = 0).
    if (billedCost > 0) {
      const estimatedCost = rows.reduce((s, r) => s + r.cost, 0);
      (dataset as Record<string, unknown>).billing = {
        billedCost,
        estimatedCost,
        source: "cost-api",
        from: dataset.startDate,
        to: dataset.endDate,
        byProvider: [{ provider: cred.provider, billed: billedCost, estimated: estimatedCost }],
      };
    }
    // Warm the cache for subsequent loads (best-effort, keyed by requested days).
    await saveCachedDataset(cred.provider, days, dataset);
    return json(dataset, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, msg === "cloud_not_active" ? 409 : 502);
  }
});
