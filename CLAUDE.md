Update this file when app purpose, key files, or routes change significantly.

**Current App Description**: LLM Cost & Usage Governance Dashboard — a finance-grade dashboard
for tracking, allocating, and controlling org-wide LLM spend across teams, models, and providers.
Opens on seeded demo data (12 teams · 6 models · 90 days); users can connect a provider *admin*
key to see their real spend. Built on the OptiDev starter stack so it drops into an OptiDev project.
Full concept: `docs/00-concept.md`.

**Data modes**:
- Demo (default) — seeded synthetic org data, zero setup
- Connect key — provider admin/org key → real Usage & Cost API data (via edge-function proxy)
- Gateway (advanced) — LiteLLM / Cloudflare AI Gateway for true per-team attribution

**Personas / views** (planned): Executive/Finance · Platform lead · Team lead · Audit.

**Tech Stack**: React 19 · Vite 7 · TypeScript strict · Tailwind 3 · shadcn/ui (49 components) ·
Recharts · Framer Motion · React Router v7 · TanStack Query · Zod · pnpm.

**Key Files**:
- `src/App.tsx` - Router + providers (QueryClient, Tooltip, Toasters)
- `src/pages/Index.tsx` - Home page (placeholder hero — to become the dashboard)
- `src/components/ui/` - 49 shadcn/ui components
- `src/lib/env.ts` - runtime env helper (Vite build-time → `window.__ENV__` fallback for OptiDev)
- `src/index.css` - Tailwind + CSS variables

**Current Routes**:
- `/` - Home page (Index.tsx)
