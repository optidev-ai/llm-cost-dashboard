/**
 * Client-side cache for live (Mode ②) data.
 *
 * The provider Usage/Cost APIs are slow (several seconds), so without a cache
 * every page reload starts on demo data and silently re-fetches from scratch —
 * which reads as "it reset to demo / I have to reconnect." We persist the last
 * fetched Dataset to localStorage and hydrate from it synchronously on load, so
 * live data shows instantly; a background revalidate then refreshes it
 * (stale-while-revalidate). Purely the user's own already-displayed data.
 */
import type { Dataset } from "./types";

const KEY = "llm_ledger_live_v1";
// Hard cap: never hydrate from a cache older than this (data would be too stale
// to trust). The background revalidate refreshes well within this window.
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

interface Cached {
  fetchedAt: number;
  dataset: Dataset;
}

/** The cached live Dataset if present and not past the hard age cap, else null. */
export function readLiveCache(): Dataset | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (!c?.dataset || typeof c.fetchedAt !== "number") return null;
    if (Date.now() - c.fetchedAt > MAX_AGE_MS) return null;
    return c.dataset;
  } catch {
    return null;
  }
}

export function writeLiveCache(dataset: Dataset): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ fetchedAt: Date.now(), dataset } satisfies Cached));
  } catch {
    // quota exceeded / storage disabled → skip caching, not fatal
  }
}

export function clearLiveCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
