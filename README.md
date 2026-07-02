# LLM Ledger — Cost & Usage Governance Dashboard

**See, allocate, and control your org's LLM spend across every team, model, and provider.** A finance-grade dashboard for the question observability tools can't answer: *who is spending what, and is it under control?*

![LLM Ledger dashboard](docs/preview.png)

Observability tools (Langfuse, Helicone) give you traces. Gateways (LiteLLM, Cloudflare AI Gateway) give you raw analytics. **LLM Ledger gives you the FinOps layer on top** — cost allocation, budget-vs-actual, forecasting, and chargeback — the views a CFO, a platform lead, and a team lead each actually need.

> 🚀 **[Build your own on OptiDev →](https://app.optidev.ai)** — fork this dashboard and customize it by chatting: add Slack budget alerts, a board-report export, your own metrics. No setup.

## Highlights

- 📊 **Executive view** — total spend, forecast-to-month-end, budget-used %, cost allocation by department, budget-vs-actual per team, biggest week-over-week movers, unit economics.
- 🏷️ **Cost allocation & chargeback** — showback ↔ chargeback toggle; attribute every dollar to a team and department.
- 🎯 **Budget vs. actual** — forecast each team to month-end against its monthly budget, with on-track / at-risk / over status.
- 💡 **Zero setup** — opens on realistic seeded data (12 teams · 6 models · 3 providers · 90 days). Nothing to configure to explore it.
- 🎨 **Polished, dark-first cockpit UI** — built on React 19 + Tailwind + shadcn/ui + Recharts, with a colorblind-safe chart palette.

## Data modes

| Mode | What you do | What you see |
|---|---|---|
| **① Demo** (default) | nothing | Full dashboard on seeded synthetic org data |
| **② Connect key** *(roadmap)* | paste a provider **admin** key | your real spend via the provider Usage/Cost API |
| **③ Gateway** *(roadmap)* | point at LiteLLM / Cloudflare AI Gateway | true per-team attribution from gateway metadata |

> Provider usage APIs need an **admin/org key** and can't be called safely from the browser, so Mode ② runs through a small edge-function proxy (holds the key as a secret). On OptiDev that's built in; self-hosted, it's a local function + `.env`.

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # production build → dist/
```

## Tech stack

React 19 · Vite 7 · TypeScript (strict) · Tailwind CSS 3 · shadcn/ui · Recharts · Framer Motion · React Router v7 · pnpm.

```
src/
  data/seed.ts        deterministic synthetic-org generator (Mode ①)
  lib/
    types.ts          domain model (gateway-friendly UsageRow)
    analytics.ts      pure selectors — all views read through these
    datasource.tsx    data context (Mode ①; ②/③ implement the same contract)
    palette.ts        chart color assignment (fixed-order, CVD-safe)
    format.ts         money / token / percent formatters
  components/dashboard/  stat tiles, charts, budget table
  components/layout/     sidebar · topbar · shell
  views/                 ExecutiveView (+ Platform / Team / Audit next)
```

## Roadmap

- [x] Executive / Finance view
- [ ] Platform view — model mix, latency p50/p95, cache-hit, budget-headroom gauges, policy compliance
- [ ] Team view — per-team detail, top projects/users
- [ ] Audit view — request log + filters + export, multi-threshold alerts, anomaly detection
- [ ] Mode ② — provider Usage/Cost API via edge function
- [ ] Mode ③ — LiteLLM / Cloudflare AI Gateway ingestion

## License

MIT
