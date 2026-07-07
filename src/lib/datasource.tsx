/**
 * Dashboard data context. Today it serves Mode ① (the demo dataset); Mode ②
 * (provider admin key → Usage/Cost API via edge function) and Mode ③ (gateway
 * export) will implement the same `Dataset` contract, so nothing downstream
 * changes when we add them.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getDemoDataset } from "@/data/seed";
import { clearLiveCache, readLiveCache, writeLiveCache } from "./live-cache";
import { fetchLiveUsage, getProxyUrl, NoKeyError } from "./live-source";
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
  /** True while a live fetch is in flight (initial load or a manual refresh). */
  isRefreshing: boolean;
  /** Force a fresh pull from the provider APIs (bypasses server cache). */
  refresh: () => void;
}

const Ctx = createContext<DashboardCtx | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const demo = useMemo(() => getDemoDataset(), []);
  // Hydrate synchronously from the client cache so a reload shows live data
  // instantly instead of flashing demo while the slow provider fetch runs.
  const cached = useMemo(() => readLiveCache(), []);
  const [dataset, setDataset] = useState<Dataset>(cached ?? demo);
  const [mode, setMode] = useState<DataMode>(cached ? "key" : "demo");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [rangeLabel, setRangeLabel] = useState("30D"); // default 30D

  const ranges = useMemo(() => buildRanges(dataset), [dataset]);
  const range = ranges.find((r) => r.label === rangeLabel) ?? ranges[1];

  // Fetch live data through the proxy and reconcile UI + cache. Shared by the
  // on-open auto-load and the manual refresh. `force` bypasses the server cache.
  const loadLive = useCallback(
    (force: boolean, signal?: { cancelled: boolean }) => {
      if (!getProxyUrl()) return;
      setIsRefreshing(true);
      fetchLiveUsage({ days: 90, refresh: force })
        .then((ds) => {
          if (signal?.cancelled) return;
          setDataset(ds);
          setMode("key");
          writeLiveCache(ds);
        })
        .catch((e: unknown) => {
          if (signal?.cancelled) return;
          // Key removed server-side → drop the stale cache and fall back to demo.
          if (e instanceof NoKeyError) {
            clearLiveCache();
            setDataset(demo);
            setMode("demo");
          }
          // Transient / provider error → keep whatever we're showing (cache or demo).
        })
        .finally(() => {
          if (!signal?.cancelled) setIsRefreshing(false);
        });
    },
    [demo],
  );

  // Auto-load on open: if a proxy is wired and a key was connected earlier, pull
  // (or revalidate) real data. With a warm client cache this is a background
  // stale-while-revalidate; with none it upgrades demo → live once it resolves.
  useEffect(() => {
    const signal = { cancelled: false };
    loadLive(false, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadLive]);

  const value = useMemo<DashboardCtx>(
    () => ({
      dataset,
      mode,
      ranges,
      range,
      isRefreshing,
      setRange: (r: DateRange) => setRangeLabel(r.label),
      connectLive: (ds: Dataset, m: DataMode = "key") => {
        setDataset(ds);
        setMode(m);
        if (m === "key") writeLiveCache(ds);
      },
      refresh: () => loadLive(true),
    }),
    [dataset, mode, ranges, range, isRefreshing, loadLive],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDashboard must be used within DashboardProvider");
  return c;
}
