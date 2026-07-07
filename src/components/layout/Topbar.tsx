import { KeyRound, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ConnectKeyDialog } from "@/components/dashboard/ConnectKeyDialog";
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
  const { ranges, range, setRange, dataset, mode, connectLive, isRefreshing, refresh } = useDashboard();
  const [connectOpen, setConnectOpen] = useState(false);
  const t = TITLES[view];
  const isLive = mode !== "demo";

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
        {/* data-mode badge (+ refresh when live) */}
        <span
          className={cn(
            "hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium md:inline-flex",
            isLive ? "border-status-good/30 text-status-good" : "border-primary/30 bg-primary/10 text-primary",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full bg-current", isRefreshing && "animate-pulse")} />
          {isLive
            ? isRefreshing
              ? "Live · updating…"
              : "Live"
            : isRefreshing
              ? "Checking for live data…"
              : "Demo data"}
          {isLive && (
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              title="Refresh live data"
              className="ml-0.5 text-status-good/80 transition-colors hover:text-status-good disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} strokeWidth={2.25} />
            </button>
          )}
        </span>

        {/* range segmented control */}
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          {ranges.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium tnum transition-colors",
                r.label === range.label
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
          Connect your key
        </button>
      </div>

      <ConnectKeyDialog open={connectOpen} onOpenChange={setConnectOpen} onConnected={(ds) => connectLive(ds, "key")} />
    </header>
  );
}
