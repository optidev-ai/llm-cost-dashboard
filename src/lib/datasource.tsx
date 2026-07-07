/**
 * Dashboard data context. Today it serves Mode ① (the demo dataset); Mode ②
 * (provider admin key → Usage/Cost API via edge function) and Mode ③ (gateway
 * export) will implement the same `Dataset` contract, so nothing downstream
 * changes when we add them.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  /** True while a live fetch is in flight (initial load, refresh, or first sync). */
  isRefreshing: boolean;
  /** True while pulling the FIRST live data after a connect (drives the sync UI). */
  isSyncing: boolean;
  /** Pull / revalidate live data. `force` bypasses the server cache. */
  reload: (force?: boolean) => void;
  /** Called by the provider manager after a connect/disconnect changes the set. */
  onConnectionsChanged: () => void;
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
  const [justConnected, setJustConnected] = useState(false);
  const [rangeLabel, setRangeLabel] = useState("30D"); // default 30D
  // Whether live data is currently shown — gates progressive loading at call time
  // (avoids a stale closure over the mount-time cache value).
  const hasLive = useRef(Boolean(cached));

  const ranges = useMemo(() => buildRanges(dataset), [dataset]);
  const range = ranges.find((r) => r.label === rangeLabel) ?? ranges[1];

  // Fetch live data through the proxy and reconcile UI + cache.
  const loadLive = useCallback(
    async (force: boolean, signal?: { cancelled: boolean }) => {
      if (!getProxyUrl()) return;
      setIsRefreshing(true);
      const applied = (ds: Dataset) => {
        setDataset(ds);
        setMode("key");
        writeLiveCache(ds);
        hasLive.current = true;
        setJustConnected(false);
      };
      try {
        // Progressive first paint only when we don't already show live data: a quick
        // 30-day window fills the default 30D view in one request, then the full
        // 90-day history backfills. A refresh (force) skips it to avoid a shrink.
        if (!hasLive.current && !force) {
          const quick = await fetchLiveUsage({ days: 30 });
          if (signal?.cancelled) return;
          applied(quick);
        }
        const full = await fetchLiveUsage({ days: 90, refresh: force });
        if (signal?.cancelled) return;
        applied(full);
      } catch (e: unknown) {
        if (signal?.cancelled) return;
        // No key connected → fall back to demo and drop any stale cache.
        if (e instanceof NoKeyError) {
          clearLiveCache();
          hasLive.current = false;
          setDataset(demo);
          setMode("demo");
          setJustConnected(false);
        }
        // Transient / provider error → keep whatever we're showing (cache or demo).
      } finally {
        if (!signal?.cancelled) setIsRefreshing(false);
      }
    },
    [demo],
  );

  // Auto-load on open: revalidate (warm cache → background) or upgrade demo → live.
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
      isSyncing: isRefreshing && mode !== "key" && justConnected,
      setRange: (r: DateRange) => setRangeLabel(r.label),
      reload: (force = false) => loadLive(force),
      onConnectionsChanged: () => {
        // The connected set changed — drop the (now-wrong) cache and re-pull,
        // showing the first-sync state while the first window loads.
        clearLiveCache();
        hasLive.current = false;
        setJustConnected(true);
        loadLive(false);
      },
    }),
    [dataset, mode, ranges, range, isRefreshing, justConnected, loadLive],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDashboard must be used within DashboardProvider");
  return c;
}
