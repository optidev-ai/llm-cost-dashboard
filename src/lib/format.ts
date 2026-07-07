/** Formatting helpers — money, tokens, percentages, dates. */

/** Compact currency: $0.42 · $842 · $12.3k · $1.24M */
export function fmtCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(2)}k`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

/** Full currency with separators: $1,234,567 */
export function fmtCurrencyFull(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Compact count: 842 · 12.3k · 1.2M · 3.4B */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

/** Signed percentage: +12.4% · −3.1% · 0% */
export function fmtPctDelta(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(1)}%`;
}

/** Plain percentage: 42.0% */
export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

/** "Jun 12" */
export function fmtDayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtMs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}
