<h1><a href="https://app.optidev.ai/dashboard/apps?remix=8f370f4f-7dac-4480-a1f6-d6cb7c5980ac"><img src=".github/customize-button.svg" alt="Customize the app" height="40" align="right"></a>LLM Ledger</h1>

A cost and usage governance dashboard for LLM spend. It answers the question observability and gateway tools leave open: who is spending what, across which teams, models, and providers — and is it under control.

![LLM Ledger dashboard](https://assets.optidev.ai/app-thumbnails/llm-dashboard.png)

Opens the dashboard on seeded demo data with no local setup. Customize it by chatting, and connect a provider admin key to see your real spend.

<a href="https://app.optidev.ai/dashboard/apps?remix=8f370f4f-7dac-4480-a1f6-d6cb7c5980ac"><img src=".github/customize-button-sm.svg" alt="Customize the app" height="40"></a>

## Overview

Observability platforms (Langfuse, Helicone) surface traces; gateways (LiteLLM, Cloudflare AI Gateway) surface raw analytics. LLM Ledger sits above both as the FinOps layer — cost allocation, budgets, forecasting, and chargeback — the views a finance lead, a platform owner, and a team lead each need.

## Features

- **Executive overview** — total spend, month-end forecast, budget utilization, spend by team, model, and provider, biggest week-over-week movers, and unit economics.
- **Chargeback and showback** — showback attributes each team's direct spend and leaves the shared/platform pool explicit; chargeback distributes that pool across teams by usage, headcount, or an even split, so every dollar lands on a team and the totals reconcile. Exports a per-team statement.
- **Invoice reconciliation** — compares the list-price estimate against actual billed cost from the provider Cost API, and accepts your real invoice total for a final check.
- **Budgets** — forecasts each team to month-end against its budget, flagged on-track, at-risk, or over.
- **Audit** — request log with filters and CSV export, budget alerts, and spend-spike anomaly detection.

## Data sources

| Mode | Setup | Shows |
|---|---|---|
| Demo | None (default) | Seeded synthetic organization — teams, models, and providers over 90 days |
| Connect a key | Paste a provider admin key | Your real spend from the provider Usage and Cost APIs |
| Gateway | Point at LiteLLM / Cloudflare AI Gateway | Per-request attribution (planned) |

Provider Usage and Cost APIs require an organization admin key and cannot be called from the browser, so live mode runs through a small server-side function that holds the key as a secret. On OptiDev this is built in. Self-hosted, deploy the function in `supabase/functions/usage` and set `VITE_USAGE_PROXY_URL`.

## Getting started

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # production build to dist/
```

## Project structure

```
src/
  data/seed.ts            Deterministic demo-data generator
  lib/
    types.ts              Domain model (gateway-friendly usage rows)
    analytics.ts          Pure selectors; every view reads through these
    datasource.tsx        Data context for demo and live modes
    palette.ts            Chart color assignment (colorblind-safe)
    format.ts             Currency, token, and percent formatting
  components/             Stat tiles, charts, tables, and layout
  views/                  Executive, Platform, Teams, Audit
supabase/functions/usage  Server-side proxy for provider Usage and Cost APIs
```

## Tech stack

React 19, Vite 7, TypeScript (strict mode), Tailwind CSS, shadcn/ui, Recharts, and React Router 7. Package manager: pnpm.

## License

MIT
