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

/** The edge-function/proxy base URL, injected at build or runtime (window.__ENV__). */
export function getProxyUrl(): string | undefined {
  return getEnv("VITE_USAGE_PROXY_URL");
}

async function callProxy(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const base = getProxyUrl();
  if (!base) throw new ProxyNotConfiguredError();
  const res = await fetch(`${base.replace(/\/$/, "")}/usage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Proxy error ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Save the admin key once — the function encrypts and stores it server-side, so
 * it never persists in the browser and subsequent loads work without re-entry.
 */
export async function connectKey(provider: ProviderId, adminKey: string): Promise<void> {
  const out = await callProxy({ action: "connect", provider, adminKey });
  if (!out.ok) throw new Error(typeof out.error === "string" ? out.error : "Failed to store key");
}

/**
 * Fetch the org's real usage via the proxy (using the stored key) and return a
 * `Dataset`. Throws NoKeyError if the backend is up but no key is connected yet.
 */
export async function fetchLiveUsage({ days = 90 }: { days?: number } = {}): Promise<Dataset> {
  const out = await callProxy({ action: "fetch", days });
  if (out.needsKey) throw new NoKeyError();
  return out as unknown as Dataset;
}
