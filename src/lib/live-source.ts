/**
 * Mode ② — "Connect your key". Reads an organization's REAL spend from the
 * provider Usage & Cost APIs.
 *
 * These APIs need a provider **admin/org** key (not a normal completion key) and
 * CANNOT be called from the browser: CORS blocks them, and exposing an admin key
 * client-side is unsafe. So the request goes through a small backend proxy (an
 * OptiDev Cloud edge function, or a local function when self-hosting) that holds
 * the key as a secret and returns the same `Dataset` shape the demo produces.
 *
 * Verified endpoints (2026-07):
 *  - Anthropic: POST-style GET /v1/organizations/usage_report/messages
 *               + /v1/organizations/cost_report  (x-api-key: sk-ant-admin…)
 *  - OpenAI:    GET /v1/organization/usage/*  +  /v1/organization/costs
 *               (Authorization: Bearer sk-…admin;  group_by project_id|api_key_id)
 *
 * Both attribute by api-key / workspace / project — NOT by "team". True per-team
 * chargeback needs a gateway (Mode ③). That's the market gap we lean into.
 */
import { getEnv } from "./env";
import { signedFetch } from "./gateway-fetch";
import type { Dataset, ProviderId } from "./types";

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  keyLabel: string;
  keyPrefix: string;
  usageEndpoint: string;
  costEndpoint: string;
  note: string;
  docs: string;
}

export const CONNECTABLE_PROVIDERS: ProviderMeta[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    keyLabel: "Admin API key",
    keyPrefix: "sk-ant-admin",
    usageEndpoint: "/v1/organizations/usage_report/messages",
    costEndpoint: "/v1/organizations/cost_report",
    note: "Requires a Team or Enterprise org. Create an Admin key in Console → Settings → Admin keys.",
    docs: "https://platform.claude.com/docs/en/manage-claude/usage-cost-api",
  },
  {
    id: "openai",
    name: "OpenAI",
    keyLabel: "Admin key",
    keyPrefix: "sk-",
    usageEndpoint: "/v1/organization/usage",
    costEndpoint: "/v1/organization/costs",
    note: "Create an Admin key at platform.openai.com → Settings → Admin keys.",
    docs: "https://platform.openai.com/docs/api-reference/usage",
  },
];

/** Thrown when no backend proxy is wired (the static repo demo). */
export class ProxyNotConfiguredError extends Error {
  constructor() {
    super("No usage proxy configured");
    this.name = "ProxyNotConfiguredError";
  }
}

/** Thrown when the backend is reachable but no admin key has been connected yet. */
export class NoKeyError extends Error {
  constructor() {
    super("No admin key connected");
    this.name = "NoKeyError";
  }
}

/**
 * Base URL of the edge functions. Prefers an explicit VITE_USAGE_PROXY_URL, but
 * otherwise DERIVES it from VITE_SUPABASE_URL — which OptiDev auto-injects into
 * .env.local (and window.__ENV__) the moment OptiDev Cloud is activated. So once
 * Cloud is on and the `usage` function is deployed (both automatic on remix),
 * the app finds the function with zero manual configuration.
 */
export function getProxyUrl(): string | undefined {
  const explicit = getEnv("VITE_USAGE_PROXY_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const supabaseUrl = getEnv("VITE_SUPABASE_URL");
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1`;
  return undefined;
}

async function callProxy(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = getProxyUrl();
  if (!base) throw new ProxyNotConfiguredError();
  const headers: Record<string, string> = { "content-type": "application/json" };
  // Supabase Edge Functions expect the project's publishable/anon key to invoke.
  const key = getEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");
  if (key) {
    headers.authorization = `Bearer ${key}`;
    headers.apikey = key;
  }
  // signedFetch HMAC-signs through the OptiDev gateway (adds x-session-id/x-ts/x-sig
  // on top of these headers); plain fetch for non-gateway URLs. Body is a fixed
  // string so the signed hash matches exactly what's sent.
  const body = JSON.stringify(payload);
  const res = await signedFetch(`${base}/usage`, { method: "POST", headers, body });
  if (!res.ok) {
    // Surface the function's own message (e.g. a friendly "key rejected" string)
    // rather than a raw status dump.
    const text = await res.text().catch(() => "");
    let msg = text.slice(0, 300);
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) msg = parsed.error;
    } catch {
      /* not JSON — keep the raw text */
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Store + validate one provider's admin key. The function encrypts it server-side
 * (never persists in the browser) and does a fast validity check, so this returns
 * in ~1s — the slow usage pull happens afterward on the dashboard. Throws with a
 * friendly message if the key is rejected.
 */
export async function connectKey(provider: ProviderId, adminKey: string): Promise<void> {
  const out = await callProxy({ action: "connect", provider, adminKey });
  if (!out.ok) throw new Error(typeof out.error === "string" ? out.error : "Failed to store key");
}

/** List the providers that currently have a stored key. */
export async function listProviders(): Promise<ProviderId[]> {
  const out = await callProxy({ action: "providers" });
  return Array.isArray(out.providers) ? (out.providers as ProviderId[]) : [];
}

/** Remove one provider's key. Returns the remaining connected providers. */
export async function disconnectProvider(provider: ProviderId): Promise<ProviderId[]> {
  const out = await callProxy({ action: "disconnect", provider });
  return Array.isArray(out.providers) ? (out.providers as ProviderId[]) : [];
}

/**
 * Fetch the org's real usage via the proxy (using the stored key) and return a
 * `Dataset`. Throws NoKeyError if the backend is up but no key is connected yet.
 * `refresh: true` bypasses the edge function's server-side cache to force a fresh
 * pull from the provider APIs.
 */
export async function fetchLiveUsage({
  days = 90,
  refresh = false,
}: {
  days?: number;
  refresh?: boolean;
} = {}): Promise<Dataset> {
  const out = await callProxy({ action: "fetch", days, refresh });
  if (out.needsKey) throw new NoKeyError();
  return out as unknown as Dataset;
}
