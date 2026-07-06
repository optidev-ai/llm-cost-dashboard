// LLM Ledger — Mode ② backend (Supabase / OptiDev Cloud edge function, Deno).
//
// One endpoint, two actions (POST body { action }):
//   • "connect" { provider, adminKey } → encrypts the admin key and stores it in
//     the project's Cloud DB (app_usage_credential). Runs ONCE; the key never
//     lives in the browser after this.
//   • "fetch"   { days? }              → reads the stored key, calls the provider
//     Usage/Cost API, returns the app's Dataset. If no key is stored yet, returns
//     { needsKey: true } so the app can prompt Connect. Falls back to a body key
//     or ANTHROPIC_ADMIN_KEY / OPENAI_ADMIN_KEY env secret.
//
// Cloud is a prerequisite: this function runs on OptiDev Cloud and the key table
// lives there — remix (autoActivateSupabase) provisions both before the user
// ever connects. What the billing API can't give (latency, errors, request
// counts) needs a gateway — that's Mode ③.
//
// Endpoints (verified 2026-07): Anthropic /v1/organizations/usage_report/messages
// + /cost_report (x-api-key sk-ant-admin); OpenAI /v1/organization/usage/completions
// + /costs (Bearer admin). Cost = tokens × price (cached/batch adjusted).

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const DAY = 86_400_000;
const TABLE = "app_usage_credential";

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

// ── provider fetchers ──────────────────────────────────────────────────────────
async function fetchAnthropic(adminKey: string, days: number): Promise<RawRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const rows: RawRow[] = [];
  let page: string | undefined;
  for (let guard = 0; guard < 8; guard++) {
    const qs = new URLSearchParams({ starting_at: start.toISOString(), ending_at: end.toISOString(), bucket_width: "1d", limit: "31" });
    qs.append("group_by[]", "model");
    qs.append("group_by[]", "workspace_id");
    if (page) qs.set("page", page);
    const res = await fetch(`https://api.anthropic.com/v1/organizations/usage_report/messages?${qs}`, {
      headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
    });
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
        const cost = ((uncached * p.in + cacheRead * p.in * 0.1 + cacheCreate * p.in * 1.25 + output * p.out) / 1e6) * batch;
        const wsId = r.workspace_id ?? "default";
        rows.push({
          date, teamId: wsId, teamName: r.workspace_id ? `Workspace ${String(wsId).slice(-6)}` : "Default workspace",
          modelId: model, inputTokens: uncached + cacheRead + cacheCreate, outputTokens: output,
          cachedTokens: cacheRead, requests: 0, errors: 0, cost,
        });
      }
    }
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return rows;
}

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
          date, teamId: projId, teamName: r.project_id ? `Project ${String(projId).slice(-6)}` : "Default project",
          modelId: model, inputTokens: input, outputTokens: output, cachedTokens: cached,
          requests: r.num_model_requests ?? 0, errors: 0, cost,
        });
      }
    }
    if (!json.has_more || !json.next_page) break;
    page = json.next_page;
  }
  return rows;
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

// ── encrypted credential storage (in the project's Cloud DB) ───────────────────
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const ub64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(): Promise<CryptoKey> {
  // Derive from the service-role key (always present in the function env) so no
  // extra secret is required; the credential is defense-in-depth on top of the
  // private, service-role-only table.
  const secret = Deno.env.get("USAGE_ENCRYPTION_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "insecure-dev-key";
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

function supa() {
  const url = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && svc ? createClient(url, svc) : null;
}

async function saveCredential(provider: Provider, adminKey: string): Promise<void> {
  const db = supa();
  if (!db) throw new Error("cloud_not_active");
  const { ct, iv } = await encrypt(adminKey);
  const { error } = await db.from(TABLE).upsert({ id: "default", provider, key_encrypted: ct, key_iv: iv, updated_at: new Date().toISOString() });
  if (error) throw new Error(`store failed: ${error.message}`);
}
async function loadCredential(): Promise<{ provider: Provider; adminKey: string } | null> {
  const db = supa();
  if (!db) return null;
  const { data, error } = await db.from(TABLE).select("provider,key_encrypted,key_iv").eq("id", "default").maybeSingle();
  if (error || !data) return null;
  return { provider: data.provider as Provider, adminKey: await decrypt(data.key_encrypted, data.key_iv) };
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } });
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

    // fetch: stored credential → body key → env secret
    const days = Math.min(Math.max(Number(body.days) || 90, 1), 180);
    let cred = await loadCredential();
    if (!cred) {
      const bodyKey = body.adminKey && String(body.adminKey).trim();
      if (bodyKey) cred = { provider: body.provider === "openai" ? "openai" : "anthropic", adminKey: bodyKey };
      else if (Deno.env.get("ANTHROPIC_ADMIN_KEY")) cred = { provider: "anthropic", adminKey: Deno.env.get("ANTHROPIC_ADMIN_KEY")! };
      else if (Deno.env.get("OPENAI_ADMIN_KEY")) cred = { provider: "openai", adminKey: Deno.env.get("OPENAI_ADMIN_KEY")! };
    }
    if (!cred) return json({ needsKey: true }, 200);

    const rows = cred.provider === "anthropic" ? await fetchAnthropic(cred.adminKey, days) : await fetchOpenAI(cred.adminKey, days);
    if (rows.length === 0) return json({ error: "No usage found for this org/time range" }, 404);
    return json(buildDataset(cred.provider, rows, days), 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json({ error: msg }, msg === "cloud_not_active" ? 409 : 502);
  }
});
