# LLM Ledger — Cost & Usage Governance Dashboard

**See, allocate, and control your org's LLM spend across every team, model, and provider.** A finance-grade dashboard for the question observability tools can't answer: *who is spending what, and is it under control?*

![LLM Ledger dashboard](docs/preview.png)

Observability tools (Langfuse, Helicone) give you traces. Gateways (LiteLLM, Cloudflare AI Gateway) give you raw analytics. **LLM Ledger gives you the FinOps layer on top** — cost allocation, budget-vs-actual, forecasting, and chargeback — the views a CFO, a platform lead, and a team lead each actually need.

<!-- MAINTAINER: swap REMIX_APP_ID for the App Library id (from POST /editor/apps/project/:id/submit).
     Until then the link falls back gracefully to the OptiDev apps gallery — not a dead link. -->
[![Try in OptiDev — no setup](https://img.shields.io/badge/%F0%9F%9A%80_Try_in_OptiDev-no_setup-f2b134?style=for-the-badge)](https://app.optidev.ai/dashboard/apps?remix=REMIX_APP_ID)

> **[🚀 Try it in OptiDev →](https://app.optidev.ai/dashboard/apps?remix=REMIX_APP_ID)** — opens this exact dashboard in [OptiDev](https://app.optidev.ai), pre-built and running on demo data. Then make it yours by chatting — add Slack budget alerts, a board-report export, your own metrics — and connect your provider admin key for live spend. No local setup.

## Highlights

- 📊 **Executive view** — total spend, forecast-to-month-end, budget-used %, cost allocation by team, budget-vs-actual per team, biggest week-over-week movers, unit economics.
- 🧾 **Invoice reconciliation** — the finance-grade differentiator. Reconciles our list-price estimate against your **actual billed cost** (provider Cost API), surfaces the effective discount, and lets you enter your real invoice total for the last-mile check (taxes / minimums / credits). The number finance can defend against the bill.
- 🏷️ **Real chargeback** — not a relabel. Showback shows each team's directly-attributed spend with the shared/platform pool left explicit; chargeback distributes that pool across budget-owned teams by **usage / equal / headcount**, so every dollar lands on a team and totals tie out. Exports a per-team chargeback statement.
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
- [x] Platform view — model mix, latency p50/p95, cache-hit, budget-headroom gauges, premium-model governance
- [x] Team view — per-team detail, spend vs budget, model mix, trend
- [x] Audit view — request log + filters + CSV export, budget alerts, spend-spike anomaly detection
- [x] Mode ② — provider Usage/Cost API via edge function (`supabase/functions/usage`)
- [x] Invoice reconciliation — list-price estimate vs. actual billed cost (Cost API) + invoice last-mile
- [x] Real chargeback — shared-pool distribution (usage / equal / headcount) + per-team statement export
- [ ] Mode ③ — LiteLLM / Cloudflare AI Gateway ingestion (unlocks latency, errors, true per-team & per-feature attribution)

## License

MIT
