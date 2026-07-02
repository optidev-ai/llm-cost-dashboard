/**
 * Dashboard data context. Today it serves Mode ① (the demo dataset); Mode ②
 * (provider admin key → Usage/Cost API via edge function) and Mode ③ (gateway
 * export) will implement the same `Dataset` contract, so nothing downstream
 * changes when we add them.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { getDemoDataset } from "@/data/seed";
import type { Dataset, DataMode, DateRange } from "./types";

function shift(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function buildRanges(ds: Dataset): DateRange[] {
  const to = ds.endDate;
  return [
    { from: shift(to, 6), to, label: "7D" },
    { from: shift(to, 29), to, label: "30D" },
    { from: ds.startDate, to, label: "90D" },
    { from: to.slice(0, 7) + "-01", to, label: "MTD" },
  ];
}

interface DashboardCtx {
  dataset: Dataset;
  mode: DataMode;
  ranges: DateRange[];
  range: DateRange;
  setRange: (r: DateRange) => void;
}

const Ctx = createContext<DashboardCtx | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const dataset = useMemo(() => getDemoDataset(), []);
  const ranges = useMemo(() => buildRanges(dataset), [dataset]);
  const [range, setRange] = useState<DateRange>(ranges[1]); // default 30D

  const value = useMemo<DashboardCtx>(
    () => ({ dataset, mode: "demo", ranges, range, setRange }),
    [dataset, ranges, range],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboard(): DashboardCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDashboard must be used within DashboardProvider");
  return c;
}
