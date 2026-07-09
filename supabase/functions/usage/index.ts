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
  date: string; provider: Provider; teamId: string; teamName: string; modelId: string;
  inputTokens: number; outputTokens: number; cachedTokens: number;
  requests: number; errors: number; cost: number;
}

const PROVIDER_NAME: Record<Provider, string> = { anthropic: "Anthropic", openai: "OpenAI" };

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

// Provider org APIs return transient 429/500/502/503s (Anthropic's usage endpoint
// especially). Retry those with backoff so a single blip doesn't fail the whole
// (multi-provider) fetch. Non-transient errors return immediately for the caller
// to handle.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
async function fetchRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let res = await fetch(url, init);
  for (let i = 1; i < attempts && !res.ok && RETRYABLE.has(res.status); i++) {
    await new Promise((r) => setTimeout(r, 400 * i));
    res = await fetch(url, init);
  }
  return res;
}

// ── provider fetchers (usage) ────────────────────────────────────────────────────
async function fetchAnthropicWindow(adminKey: string, w: TimeWindow, names: Record<string, string>): Promise<RawRow[]> {
  const qs = new URLSearchParams({ starting_at: w.start.toISOString(), ending_at: w.end.toISOString(), bucket_width: "1d", limit: "31" });
  qs.append("group_by[]", "model");
  qs.append("group_by[]", "workspace_id");
  const res = await fetchRetry(`https://api.anthropic.com/v1/organizations/usage_report/messages?${qs}`, {
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
      // Cache-creation moved to a nested object (5-minute vs 1-hour TTL); the old
      // flat cache_creation_input_tokens field is gone. Missing it dropped the
      // single biggest cost bucket to $0. 5m write = 1.25× input, 1h write = 2×.
      const cc = r.cache_creation ?? {};
      const cache5m = cc.ephemeral_5m_input_tokens ?? 0;
      const cache1h = cc.ephemeral_1h_input_tokens ?? 0;
      const cacheCreate = cache5m + cache1h;
      const output = r.output_tokens ?? 0;
      const webSearches = r.server_tool_use?.web_search_requests ?? 0;
      if (uncached + cacheRead + cacheCreate + output + webSearches === 0) continue;
      const p = priceFor("anthropic", model);
      const batch = r.service_tier === "batch" ? 0.5 : 1;
      const cost =
        ((uncached * p.in + cacheRead * p.in * 0.1 + cache5m * p.in * 1.25 + cache1h * p.in * 2 + output * p.out) / 1e6) *
          batch +
        (webSearches / 1000) * 10; // web search billed ~$10 / 1k requests
      const wsId = r.workspace_id ?? "default";
      rows.push({
        date, provider: "anthropic", teamId: `anthropic:${wsId}`,
        teamName: r.workspace_id ? (names[wsId] ?? `Workspace ${String(wsId).slice(-6)}`) : "Default workspace",
        modelId: model, inputTokens: uncached + cacheRead + cacheCreate, outputTokens: output,
        cachedTokens: cacheRead, requests: 0, errors: 0, cost,
      });
    }
  }
  return rows;
}

async function fetchAnthropic(adminKey: string, days: number, names: Record<string, string>): Promise<RawRow[]> {
  const parts = await mapLimit(timeWindows(days), FETCH_CONCURRENCY, (w) => fetchAnthropicWindow(adminKey, w, names));
  return dedupeRows(parts.flat());
}

async function fetchOpenAIWindow(adminKey: string, w: TimeWindow, names: Record<string, string>): Promise<RawRow[]> {
  const qs = new URLSearchParams({
    start_time: String(Math.floor(w.start.getTime() / 1000)),
    end_time: String(Math.floor(w.end.getTime() / 1000)),
    bucket_width: "1d",
    limit: "31",
  });
  qs.append("group_by[]", "model");
  qs.append("group_by[]", "project_id");
  const res = await fetchRetry(`https://api.openai.com/v1/organization/usage/completions?${qs}`, {
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
        date, provider: "openai", teamId: `openai:${projId}`,
        teamName: r.project_id ? (names[projId] ?? `Project ${String(projId).slice(-6)}`) : "Default project",
        modelId: model, inputTokens: input, outputTokens: output, cachedTokens: cached,
        requests: r.num_model_requests ?? 0, errors: 0, cost,
      });
    }
  }
  return rows;
}

async function fetchOpenAI(adminKey: string, days: number, names: Record<string, string>): Promise<RawRow[]> {
  const parts = await mapLimit(timeWindows(days), FETCH_CONCURRENCY, (w) => fetchOpenAIWindow(adminKey, w, names));
  return dedupeRows(parts.flat());
}

// Resolve friendly workspace/project names so teams read "OptiEdge" instead of
// "Workspace 5XKYgY". Best-effort — falls back to the truncated id on any error.
async function fetchNames(provider: Provider, adminKey: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/organizations/workspaces?limit=100", {
        headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
      });
      if (res.ok) for (const w of (await res.json()).data ?? []) if (w.id && w.name) out[w.id] = w.name;
    } else {
      const res = await fetch("https://api.openai.com/v1/organization/projects?limit=100", {
        headers: { Authorization: `Bearer ${adminKey}` },
      });
      if (res.ok) for (const p of (await res.json()).data ?? []) if (p.id && p.name) out[p.id] = p.name;
    }
  } catch {
    // names are cosmetic — never fail the fetch over them
  }
  return out;
}

// ── actual billed cost (Cost API — the invoice truth) ───────────────────────────
// The usage fetchers above compute cost = tokens × list price. The Cost API
// returns what the org was ACTUALLY billed (committed-use / batch discounts,
// negotiated rates). Reconciling the two is the finance-grade differentiator.
// Best-effort: a failure here must never break the usage response.
// Anthropic's cost_report `amount` is in CENTS (minor units), verified against a
// real org: plain uncached-input billed 568.77 → $5.69, matching a token×price
// estimate of $5.84. So divide by 100 to get dollars. (OpenAI's costs endpoint
// returns dollars in `amount.value` — no scaling there.)
const ANTHROPIC_COST_UNITS_PER_DOLLAR = 100;

async function fetchAnthropicBilledWindow(adminKey: string, w: TimeWindow): Promise<number> {
  const qs = new URLSearchParams({ starting_at: w.start.toISOString(), ending_at: w.end.toISOString(), bucket_width: "1d", limit: "31" });
  const res = await fetchRetry(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, {
    headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`Anthropic cost API ${res.status}`);
  const json = await res.json();
  let cents = 0;
  for (const bucket of json.data ?? []) {
    for (const r of bucket.results ?? []) cents += Number(r.amount ?? 0);
  }
  return cents / ANTHROPIC_COST_UNITS_PER_DOLLAR;
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
  const res = await fetchRetry(`https://api.openai.com/v1/organization/costs?${qs}`, {
    headers: { Authorization: `Bearer ${adminKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI cost API ${res.status}`);
  const json = await res.json();
  // OpenAI returns dollars in `amount.value` (USD) — no scaling needed.
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

// ── normalize → Dataset (merges rows from every connected provider) ────────────
function buildDataset(rows: RawRow[], days: number) {
  const providerIds = [...new Set(rows.map((r) => r.provider))];
  const providers = providerIds.map((id) => ({ id, name: PROVIDER_NAME[id] }));

  // model → its provider (first seen), so a merged set prices each model correctly
  const modelProvider = new Map<string, Provider>();
  for (const r of rows) if (!modelProvider.has(r.modelId)) modelProvider.set(r.modelId, r.provider);
  const models = [...modelProvider.entries()].map(([id, prov]) => {
    const p = priceFor(prov, id);
    return { id, name: id, provider: prov, priceIn: p.in, priceOut: p.out };
  });

  // teams = each provider's workspaces/projects; department = provider name, so the
  // "by department" views become an honest per-provider consolidation.
  const teamMeta = new Map<string, { name: string; provider: Provider }>();
  rows.forEach((r) => {
    if (!teamMeta.has(r.teamId)) teamMeta.set(r.teamId, { name: r.teamName, provider: r.provider });
  });
  const cut30 = isoDay(new Date(Date.now() - 30 * DAY));
  const spend30 = new Map<string, number>();
  rows.forEach((r) => {
    if (r.date >= cut30) spend30.set(r.teamId, (spend30.get(r.teamId) ?? 0) + r.cost);
  });
  const teams = [...teamMeta.entries()].map(([id, meta]) => ({
    id, name: meta.name, department: PROVIDER_NAME[meta.provider],
    monthlyBudget: Math.max(50, Math.round(((spend30.get(id) ?? 0) / 0.8) / 10) * 10),
  }));

  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  return {
    org: providers.length === 1 ? `${providers[0].name} org` : "Connected providers",
    generatedAt: new Date().toISOString(),
    startDate: dates[0] ?? isoDay(new Date(Date.now() - days * DAY)),
    endDate: dates[dates.length - 1] ?? isoDay(new Date()),
    orgMonthlyBudget: Math.round(teams.reduce((s, t) => s + t.monthlyBudget, 0) / 100) * 100,
    providers, models, teams,
    usage: rows.map((r) => ({
      date: r.date, teamId: r.teamId, modelId: r.modelId, requests: r.requests,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedTokens: r.cachedTokens,
      errors: r.errors, cost: r.cost, latencyP50: 0, latencyP95: 0,
    })),
    _note: "Live data from provider billing APIs. Latency/error/request-count metrics require a gateway (Mode ③); cost is token×price with cached/batch adjustment.",
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

// One credential row PER provider (id = provider), so OpenAI + Anthropic coexist
// and the dashboard can consolidate both. (The old single 'default' row is
// migrated on the next connect and ignored by loadCredentials's provider dedupe.)
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
      values (${provider}, ${provider}, ${ct}, ${iv}, now())
      on conflict (id) do update set
        provider = excluded.provider,
        key_encrypted = excluded.key_encrypted,
        key_iv = excluded.key_iv,
        updated_at = now()`;
    // Drop the legacy single-credential row if it was for this same provider.
    await sql`delete from app_usage_credential where id = 'default' and provider = ${provider}`.catch(() => {});
    // The connected set changed → invalidate cached datasets (best-effort).
    await sql`delete from app_usage_cache where true`.catch(() => {});
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function deleteCredential(provider: Provider): Promise<void> {
  const url = dbUrl();
  if (!url) return;
  const sql = postgres(url, { prepare: false });
  try {
    await sql`delete from app_usage_credential where provider = ${provider}`.catch(() => {});
    await sql`delete from app_usage_cache where true`.catch(() => {});
  } finally {
    await sql.end({ timeout: 5 });
  }
}

interface Cred {
  provider: Provider;
  adminKey: string;
}

// All connected credentials, most-recent-per-provider (handles the legacy row).
async function loadCredentials(): Promise<Cred[]> {
  const url = dbUrl();
  if (!url) return [];
  const sql = postgres(url, { prepare: false });
  try {
    const rows = await sql`select provider, key_encrypted, key_iv, updated_at
      from app_usage_credential order by updated_at desc`;
    const byProvider = new Map<Provider, Cred>();
    for (const row of rows) {
      const provider = row.provider as Provider;
      if (byProvider.has(provider)) continue; // keep the newest per provider
      byProvider.set(provider, { provider, adminKey: await decrypt(row.key_encrypted, row.key_iv) });
    }
    return [...byProvider.values()];
  } catch {
    return []; // table not created yet → no keys
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Fast validity check — a lightweight admin call so `connect` can confirm the key
// works in ~1s and return, without waiting on the slow usage aggregation.
async function validateKey(provider: Provider, adminKey: string): Promise<boolean> {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/organizations/workspaces?limit=1", {
        headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
      });
      return res.ok;
    }
    const res = await fetch("https://api.openai.com/v1/organization/projects?limit=1", {
      headers: { Authorization: `Bearer ${adminKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── server-side dataset cache (skip the slow provider APIs on repeat loads) ─────
// Billing/usage data changes slowly; caching the built Dataset for a few minutes
// turns repeat loads (reloads, background revalidations, multiple viewers) from a
// multi-second provider round-trip into a single fast DB read. `refresh` bypasses it.
const CACHE_TTL_MIN = 10;

async function loadCachedDataset(key: string): Promise<unknown | null> {
  const url = dbUrl();
  if (!url) return null;
  const sql = postgres(url, { prepare: false });
  try {
    const rows = await sql`select dataset from app_usage_cache
      where id = ${key} and updated_at > now() - (${CACHE_TTL_MIN} * interval '1 minute')
      limit 1`;
    return rows.length ? rows[0].dataset : null;
  } catch {
    return null; // table not created yet / read error → treat as cache miss
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function saveCachedDataset(key: string, dataset: unknown): Promise<void> {
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
      values (${key}, ${sql.json(dataset as object)}, now())
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
  const action = String(body.action ?? "fetch");
  const asProvider = (v: unknown): Provider => (v === "openai" ? "openai" : "anthropic");

  try {
    // ── connect: store the key + fast validity check (no slow usage fetch here,
    // so the dialog returns in ~1s; the dashboard does the real pull after). ──
    if (action === "connect") {
      const provider = asProvider(body.provider);
      const adminKey = String(body.adminKey ?? "").trim();
      if (adminKey.length < 8) return json({ error: "missing adminKey" }, 400);
      if (!(await validateKey(provider, adminKey))) {
        return json({ error: `That key was rejected by ${PROVIDER_NAME[provider]}. It needs to be an admin/org key, not a standard project key.` }, 400);
      }
      await saveCredential(provider, adminKey);
      return json({ ok: true, provider }, 200);
    }

    // ── disconnect: remove one provider's key ──
    if (action === "disconnect") {
      await deleteCredential(asProvider(body.provider));
      const remaining = await loadCredentials();
      return json({ ok: true, providers: remaining.map((c) => c.provider) }, 200);
    }

    // ── providers: list what's connected (drives the manager UI) ──
    if (action === "providers") {
      const creds = await loadCredentials();
      return json({ providers: creds.map((c) => c.provider) }, 200);
    }

    // ── fetch: pull + merge every connected provider ──
    const days = Math.min(Math.max(Number(body.days) || 90, 1), 180);
    const refresh = body.refresh === true;

    let creds = await loadCredentials();
    if (creds.length === 0) {
      // Fallbacks: an inline body key, or env secrets (self-hosted).
      const bodyKey = body.adminKey && String(body.adminKey).trim();
      if (bodyKey) creds = [{ provider: asProvider(body.provider), adminKey: bodyKey }];
      else if (Deno.env.get("ANTHROPIC_ADMIN_KEY")) creds = [{ provider: "anthropic", adminKey: Deno.env.get("ANTHROPIC_ADMIN_KEY")! }];
      else if (Deno.env.get("OPENAI_ADMIN_KEY")) creds = [{ provider: "openai", adminKey: Deno.env.get("OPENAI_ADMIN_KEY")! }];
    }
    if (creds.length === 0) return json({ needsKey: true }, 200);

    const cacheKey = `${creds.map((c) => c.provider).sort().join("+")}:${days}`;
    if (!refresh) {
      const cached = await loadCachedDataset(cacheKey);
      if (cached) return json(cached, 200);
    }

    // Pull usage + billed cost for every provider concurrently, with friendly
    // workspace/project names resolved so teams read "OptiEdge" not "Workspace …".
    // Each provider is isolated: if one fails (after retries), it returns empty so
    // the others still render — one provider's outage never blanks the whole view.
    const failed: Provider[] = [];
    const pull = async () =>
      Promise.all(
        creds.map(async (c) => {
          try {
            const fetcher = c.provider === "anthropic" ? fetchAnthropic : fetchOpenAI;
            const names = await fetchNames(c.provider, c.adminKey);
            let [rows, billed] = await Promise.all([
              fetcher(c.adminKey, days, names),
              fetchBilled(c.provider, c.adminKey, days),
            ]);
            // Per-provider widen: THIS provider has no activity in the requested
            // window but may have older spend. Widen it alone to ~13 months so a
            // provider whose only usage predates the window still appears — a
            // busier provider's recent data no longer suppresses it (the old
            // all-or-nothing widen dropped such providers entirely).
            if (rows.length === 0 && days < 400) {
              [rows, billed] = await Promise.all([
                fetcher(c.adminKey, 400, names),
                fetchBilled(c.provider, c.adminKey, 400),
              ]);
            }
            return { provider: c.provider, rows, billed };
          } catch {
            if (!failed.includes(c.provider)) failed.push(c.provider);
            return { provider: c.provider, rows: [] as RawRow[], billed: 0 };
          }
        }),
      );

    const parts = await pull();
    const effectiveDays = days;
    const allRows = parts.flatMap((p) => p.rows);
    if (allRows.length === 0) {
      return json({ error: "No usage found for the connected org(s) in the last 13 months. The key(s) are valid, but there's no recorded activity in that window — check the provider's own usage dashboard." }, 404);
    }

    const dataset = buildDataset(allRows, effectiveDays);
    // Invoice reconciliation: only include providers whose Cost API returned a real
    // figure, so the estimate↔billed comparison stays apples-to-apples.
    const byProvider = parts
      .filter((p) => p.billed > 0 && p.rows.length > 0)
      .map((p) => ({ provider: p.provider, billed: p.billed, estimated: p.rows.reduce((s, r) => s + r.cost, 0) }));
    if (byProvider.length > 0) {
      (dataset as Record<string, unknown>).billing = {
        billedCost: byProvider.reduce((s, p) => s + p.billed, 0),
        estimatedCost: byProvider.reduce((s, p) => s + p.estimated, 0),
        source: "cost-api",
        from: dataset.startDate,
        to: dataset.endDate,
        byProvider,
      };
    }
    // Only cache a complete result — never persist a partial view from a provider
    // that failed this round, so the next load retries it fresh.
    if (failed.length === 0) {
      await saveCachedDataset(cacheKey, dataset);
    } else {
      (dataset as Record<string, unknown>).partialProviders = failed;
    }
    return json(dataset, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, msg === "cloud_not_active" ? 409 : 502);
  }
});
