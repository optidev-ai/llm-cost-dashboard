/**
 * OptiDev Cloud fronts Supabase with an HMAC gateway: a plain fetch to a function
 * returns 403 "Missing session". You must POST /session for a short-lived
 * {session_id, session_key}, then sign every request — headers
 * x-session-id / x-ts / x-sig, where x-sig = HMAC-SHA256(session_key, canonical),
 * canonical = `${id}\n${ts}\n${METHOD}\n${path}` (+ `\n${sha256(body)}` for writes),
 * all URL-safe base64. This mirrors the gateway client OptiDev injects as
 * supabaseClient.ts, reduced to the one function call we make. `apikey` /
 * `Authorization` (publishable key) are set by the caller — this only adds the
 * signature on top, exactly as supabase-js + gatewayFetch do together.
 *
 * For a non-gateway base (plain Supabase / self-host) signing is skipped.
 */
import { getEnv } from "./env";

function gatewayBase(): string | undefined {
  const url = getEnv("VITE_SUPABASE_GATEWAY_URL") ?? getEnv("VITE_SUPABASE_URL");
  return url ? url.replace(/\/$/, "") : undefined;
}

export function isGatewayUrl(url: string): boolean {
  return url.includes(".sb-") || url.includes(".sb.");
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256(msg: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg))));
}
async function hmac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg))));
}

interface Session { id: string; key: string; expiresAt: number }
let session: Session | null = null;
let inflight: Promise<void> | null = null;

async function ensureSession(base: string): Promise<void> {
  const now = Date.now() / 1000;
  if (session && now < session.expiresAt - 30) return;
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch(`${base}/session`, { method: "POST" });
        if (!res.ok) throw new Error("Failed to create gateway session");
        const d = await res.json();
        session = { id: d.session_id, key: d.session_key, expiresAt: d.expires_at };
      } finally {
        inflight = null;
      }
    })();
  }
  await inflight;
}

async function signHeaders(method: string, path: string, body: string | undefined): Promise<Record<string, string>> {
  const ts = Math.floor(Date.now() / 1000);
  let canonical = `${session!.id}\n${ts}\n${method}\n${path}`;
  if (body && ["POST", "PUT", "PATCH"].includes(method)) canonical += `\n${await sha256(body)}`;
  return { "x-session-id": session!.id, "x-ts": String(ts), "x-sig": await hmac(session!.key, canonical) };
}

/**
 * HMAC-signs the request through the OptiDev gateway when the URL is a gateway
 * URL; otherwise a plain fetch. Retries once on a gateway 401/403 (stale session).
 */
export async function signedFetch(url: string, init: RequestInit & { body?: string } = {}): Promise<Response> {
  if (!isGatewayUrl(url)) return fetch(url, init);
  const base = gatewayBase();
  if (!base) return fetch(url, init);

  const method = init.method ?? "GET";
  const path = new URL(url).pathname;
  await ensureSession(base);

  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(await signHeaders(method, path, init.body))) headers.set(k, v);
  let res = await fetch(url, { ...init, headers });

  if ((res.status === 401 || res.status === 403) && res.headers.get("x-gateway-error")) {
    session = null;
    await ensureSession(base);
    for (const [k, v] of Object.entries(await signHeaders(method, path, init.body))) headers.set(k, v);
    res = await fetch(url, { ...init, headers });
  }
  return res;
}
