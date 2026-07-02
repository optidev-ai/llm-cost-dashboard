import { useMemo } from "react";
import { Activity, Gauge, Layers, Zap } from "lucide-react";
import { useDashboard } from "@/lib/datasource";
import {
  budgetByTeam,
  kpis,
  latency,
  rowsInRange,
  spendByModel,
  spendByProvider,
} from "@/lib/analytics";
import { modelColor, providerColor } from "@/lib/palette";
import { fmtCompact, fmtCurrency, fmtMs, fmtPct } from "@/lib/format";
import { CapsLabel, SectionCard, StatTile, StatusDot } from "@/components/dashboard/primitives";
import { MiniBarMeter, MixDonut } from "@/components/dashboard/charts";

/** Premium models (expensive output) — usage of these is what governance watches. */
const PREMIUM_OUT_PRICE = 40; // USD / 1M output tokens

function ReliabilityPanel({ noPerf, p50, p95, errorRate }: { noPerf: boolean; p50: number; p95: number; errorRate: number }) {
  if (noPerf) {
    return (
      <div className="flex h-full flex-col justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center">
        <Activity className="mx-auto h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
        <p className="text-sm font-medium text-foreground">Latency & errors need a gateway</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The provider billing API doesn't expose latency or error rates. Route traffic through a
          gateway (LiteLLM / Cloudflare AI Gateway) to light these up — that's Mode ③.
        </p>
      </div>
    );
  }
  const max = Math.max(p95, 1);
  return (
    <div className="space-y-4">
      {[
        { label: "p50 latency", v: p50, tone: "var(--series-1)" },
        { label: "p95 latency", v: p95, tone: "var(--series-3)" },
      ].map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-baseline justify-between">
            <CapsLabel>{row.label}</CapsLabel>
            <span className="tnum text-sm font-semibold text-foreground">{fmtMs(row.v)}</span>
          </div>
          <MiniBarMeter value={row.v / max} tone={row.tone} />
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t border-border/60 pt-3">
        <CapsLabel>Error rate</CapsLabel>
        <span className="tnum text-sm font-semibold" style={{ color: errorRate > 0.02 ? "var(--status-critical)" : "var(--foreground)" }}>
          {fmtPct(errorRate * 100, 2)}
        </span>
      </div>
    </div>
  );
}

export function PlatformView() {
  const { dataset, range } = useDashboard();
  const rows = useMemo(() => rowsInRange(dataset, range), [dataset, range]);
  const k = useMemo(() => kpis(rows), [rows]);
  const lat = useMemo(() => latency(rows), [rows]);
  const models = useMemo(() => spendByModel(dataset, rows), [dataset, rows]);
  const providers = useMemo(() => spendByProvider(dataset, rows), [dataset, rows]);
  const budgets = useMemo(() => budgetByTeam(dataset), [dataset]);

  const noPerf = lat.p95 === 0; // live billing-API data has no latency
  const noReq = k.requests === 0;

  // premium-model governance
  const premium = useMemo(() => {
    const priceOut = new Map(dataset.models.map((m) => [m.id, m.priceOut]));
    const premiumModels = new Set(dataset.models.filter((m) => m.priceOut >= PREMIUM_OUT_PRICE).map((m) => m.id));
    const total = rows.reduce((s, r) => s + r.cost, 0) || 1;
    const premiumSpend = rows.filter((r) => premiumModels.has(r.modelId)).reduce((s, r) => s + r.cost, 0);
    const names = dataset.models.filter((m) => premiumModels.has(m.id)).map((m) => m.name);
    return { share: premiumSpend / total, spend: premiumSpend, names, hasPolicy: premiumModels.size > 0, priceOut };
  }, [dataset, rows]);

  const stagger = (i: number) => ({ animationDelay: `${i * 60}ms` });

  return (
    <div className="space-y-4 p-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="animate-slide-up" style={stagger(0)}>
          <StatTile label={`Requests · ${range.label}`} value={noReq ? "—" : fmtCompact(k.requests)} icon={Activity} sub={noReq ? "not reported by this source" : `${fmtCompact(k.tokens)} tokens`} />
        </div>
        <div className="animate-slide-up" style={stagger(1)}>
          <StatTile label="Cost / 1k requests" value={noReq ? "—" : fmtCurrency(k.costPerRequest * 1000)} icon={Zap} sub={noReq ? "needs request counts" : "blended across models"} />
        </div>
        <div className="animate-slide-up" style={stagger(2)}>
          <StatTile label="Cache-hit rate" value={fmtPct(k.cacheHitRate * 100)} icon={Layers} accent sub="of input tokens served from cache" />
        </div>
        <div className="animate-slide-up" style={stagger(3)}>
          <StatTile label="p95 latency" value={noPerf ? "—" : fmtMs(lat.p95)} icon={Gauge} sub={noPerf ? "needs a gateway" : `p50 ${fmtMs(lat.p50)}`} />
        </div>
      </div>

      {/* mix + reliability */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Spend by model" subtitle={`${range.label} · ${dataset.models.length} models`}>
          <MixDonut data={models} colorFor={(key) => modelColor(key, dataset.models)} centerLabel="Total" centerValue={fmtCurrency(k.spend)} />
        </SectionCard>
        <SectionCard title="Reliability" subtitle="Latency & error rate">
          <ReliabilityPanel noPerf={noPerf} p50={lat.p50} p95={lat.p95} errorRate={k.errorRate} />
        </SectionCard>
        <SectionCard title="Spend by provider" subtitle={`${providers.length} provider${providers.length === 1 ? "" : "s"}`}>
          <MixDonut data={providers} colorFor={(key) => providerColor(key as never)} centerLabel="Providers" centerValue={`${providers.length}`} />
        </SectionCard>
      </div>

      {/* headroom + governance */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="Budget headroom" subtitle="Remaining budget by team (forecast vs. monthly budget)">
          <ul className="space-y-3">
            {budgets.slice(0, 8).map((b) => {
              const headroom = Math.max(0, 1 - b.util);
              const tone = b.status === "over" ? "var(--status-critical)" : b.status === "watch" ? "var(--status-warning)" : "var(--status-good)";
              const dot = b.status === "over" ? "critical" : b.status === "watch" ? "warning" : "good";
              return (
                <li key={b.teamId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 truncate text-sm text-foreground">
                    <StatusDot tone={dot as never} />
                    {b.name}
                  </span>
                  <span className="tnum text-sm text-foreground">{fmtPct(headroom * 100, 0)} left</span>
                  <span className="col-span-2">
                    <MiniBarMeter value={b.util} tone={tone} />
                  </span>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard title="Model governance" subtitle={`Premium-model usage (≥ $${PREMIUM_OUT_PRICE}/1M out)`}>
          {premium.hasPolicy ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between">
                  <CapsLabel>Premium share of spend</CapsLabel>
                  <span className="tnum text-2xl font-semibold" style={{ color: premium.share > 0.4 ? "var(--status-warning)" : "var(--foreground)" }}>
                    {fmtPct(premium.share * 100, 0)}
                  </span>
                </div>
                <MiniBarMeter value={premium.share} tone={premium.share > 0.4 ? "var(--status-warning)" : "var(--series-5)"} className="mt-2" />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {fmtCurrency(premium.spend)} on {premium.names.join(", ")}. High premium share is a routing-savings
                opportunity — cheaper models may serve some of this traffic.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No premium models in use this period.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
