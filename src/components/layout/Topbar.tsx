import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { ConnectProviderButton, ProviderChips, ProviderManager } from "@/components/dashboard/provider-manager";
import { useDashboard } from "@/lib/datasource";
import type { PersonaView } from "@/lib/types";
import { cn } from "@/lib/utils";

const TITLES: Record<PersonaView, { title: string; sub: string }> = {
  executive: { title: "Executive Overview", sub: "Spend, allocation & budget across the org" },
  platform: { title: "Platform & Reliability", sub: "Model mix, efficiency & health" },
  team: { title: "Teams", sub: "Per-team spend, budgets & usage" },
  audit: { title: "Audit & Alerts", sub: "Request log, filters & anomaly alerts" },
};

export function Topbar({ view }: { view: PersonaView }) {
  const { ranges, range, setRange, dataset, mode, isRefreshing, reload } = useDashboard();
  const [managerOpen, setManagerOpen] = useState(false);
  const t = TITLES[view];
  const isLive = mode !== "demo";
  const connectedProviders = isLive ? dataset.providers.map((p) => p.id) : [];

  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/80 px-6 py-3.5 backdrop-blur">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">{t.title}</h1>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
            {dataset.org}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{t.sub}</p>
      </div>

      <div className="flex items-center gap-2.5">
        {/* data source */}
        {isLive ? (
          <div className="flex items-center gap-1.5">
            <ProviderChips providers={connectedProviders} onClick={() => setManagerOpen(true)} />
            <button
              type="button"
              onClick={() => reload(true)}
              disabled={isRefreshing}
              title="Refresh live data"
              className={cn(
                "grid h-[30px] w-[30px] place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:text-status-good disabled:opacity-60",
                isRefreshing && "text-status-good",
              )}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} strokeWidth={2.25} />
            </button>
          </div>
        ) : (
          <span className="hidden items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary md:inline-flex">
            <span className={cn("h-1.5 w-1.5 rounded-full bg-current", isRefreshing && "animate-pulse")} />
            {isRefreshing ? "Checking for live data…" : "Demo data"}
          </span>
        )}

        {/* range segmented control */}
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          {ranges.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "tnum rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                r.label === range.label
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {!isLive && <ConnectProviderButton onClick={() => setManagerOpen(true)} />}
      </div>

      <ProviderManager open={managerOpen} onOpenChange={setManagerOpen} />
    </header>
  );
}
