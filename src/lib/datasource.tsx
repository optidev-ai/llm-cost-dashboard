/**
 * Dashboard data context. Today it serves Mode ① (the demo dataset); Mode ②
 * (provider admin key → Usage/Cost API via edge function) and Mode ③ (gateway
 * export) will implement the same `Dataset` contract, so nothing downstream
 * changes when we add them.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { getDemoDataset } from "@/data/seed";
import { fetchLiveUsage, getProxyUrl } from "./live-source";
import type { DataMode, Dataset, DateRange } from "./types";

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildRanges(ds: Dataset): DateRange[] {
  const to = ds.endDate;
  return [
    { from: shift(to, 6), to, label: "7D" },
    { from: shift(to, 29), to, label: "30D" },
    { from: ds.startDate, to, label: "90D" },
    { from: `${to.slice(0, 7)}-01`, to, label: "MTD" },
  ];
}

interface DashboardCtx {
  dataset: Dataset;
  mode: DataMode;
  ranges: DateRange[];
  range: DateRange;
  setRange: (r: DateRange) => void;
  /** Swap the demo dataset for live data (Mode ②/③). */
  connectLive: (ds: Dataset, mode?: DataMode) => void;
}

const Ctx = createContext<DashboardCtx | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const demo = useMemo(() => getDemoDataset(), []);
  const [dataset, setDataset] = useState<Dataset>(demo);
  const [mode, setMode] = useState<DataMode>("demo");
  const [rangeLabel, setRangeLabel] = useState("30D"); // default 30D

  const ranges = useMemo(() => buildRanges(dataset), [dataset]);
  const range = ranges.find((r) => r.label === rangeLabel) ?? ranges[1];

  // Auto-load: if a backend proxy is wired (remixed on OptiDev / self-hosted) and
  // an admin key was connected earlier, pull real data on open — no dialog needed.
  // Any failure (no key yet, no proxy, provider error) silently stays on demo.
  useEffect(() => {
    if (!getProxyUrl()) return;
    let cancelled = false;
    fetchLiveUsage({ days: 90 })
      .then((ds) => {
        if (!cancelled) {
          setDataset(ds);
          setMode("key");
        }
      })
      .catch(() => {
        /* NoKeyError / not configured / provider error → stay on demo data */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<DashboardCtx>(
    () => ({
      dataset,
      mode,
      ranges,
      range,
      setRange: (r: DateRange) => setRangeLabel(r.label),
      connectLive: (ds: Dataset, m: DataMode = "key") => {
        setDataset(ds);
        setMode(m);
      },
    }),
    [dataset, mode, ranges, range],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDashboard must be used within DashboardProvider");
  return c;
}
