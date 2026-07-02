# Edge functions — Mode ② backend

## `usage` — read your org's real LLM spend

Holds a provider **admin key** server-side and calls the provider Usage API
(browsers can't — CORS + key exposure), returning the app's `Dataset` shape.

`POST /usage` body: `{ "provider": "anthropic" | "openai", "adminKey"?: string, "days"?: number }`

The admin key can come from the request body (what the Connect dialog sends) **or**
from a secret env var — the more secure setup, where the key never touches the browser:

- `ANTHROPIC_ADMIN_KEY` (`sk-ant-admin…`, Team/Enterprise org)
- `OPENAI_ADMIN_KEY` (`sk-…` admin key)

### Deploy (OptiDev Cloud / Supabase)

```bash
# public endpoint (no Supabase JWT needed — the admin key is the credential)
supabase functions deploy usage --no-verify-jwt

# optional: store the key as a secret so the browser never sends it
supabase secrets set ANTHROPIC_ADMIN_KEY=sk-ant-admin...
```

On **OptiDev**, activate OptiDev Cloud and ask the agent to "deploy the usage
function and add my admin key as a secret" — it wires this for you.

### Point the app at it

Set the proxy base URL in the web app (`.env.local`, or OptiDev runtime env):

```
VITE_USAGE_PROXY_URL=https://<your-project>.supabase.co/functions/v1
```

The Connect dialog then POSTs to `${VITE_USAGE_PROXY_URL}/usage`. Unset → the app
stays in demo mode and the dialog routes to the "build on OptiDev" CTA.

### What it can and can't populate

From the billing API: **spend, tokens, model & workspace/project attribution,
cache-hit rate**. Not available: **latency, error rates**, and (Anthropic) **request
counts** — those live in the request path, i.e. a gateway (Mode ③). Cost is
`tokens × price` with cached/batch adjustment; edit the price table in
`usage/index.ts` for negotiated rates.

### Local dev

```bash
supabase functions serve usage --no-verify-jwt
# then set VITE_USAGE_PROXY_URL=http://localhost:54321/functions/v1
```
