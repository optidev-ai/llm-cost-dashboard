/**
 * Chart color assignment. Per the dataviz non-negotiables:
 *  - categorical hues are assigned in FIXED order, never cycled;
 *  - color follows the entity, never its rank (a filter that drops series
 *    must not repaint the survivors);
 *  - a 9th+ category folds into "Other" rather than minting a new hue.
 * Colors are CSS vars so light/dark swap in one place (see index.css).
 */
import type { Model, ProviderId } from "./types";

export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

export const OTHER_COLOR = "var(--viz-axis)";

// Departments — fixed canonical order.
export const DEPARTMENTS = ["Engineering", "Customer", "Growth", "Operations"] as const;
export function deptColor(dept: string): string {
  const i = DEPARTMENTS.indexOf(dept as (typeof DEPARTMENTS)[number]);
  return i >= 0 ? SERIES[i] : OTHER_COLOR;
}

// Providers — fixed order.
const PROVIDER_ORDER: ProviderId[] = ["openai", "anthropic", "google"];
export function providerColor(id: ProviderId): string {
  const i = PROVIDER_ORDER.indexOf(id);
  return i >= 0 ? SERIES[i] : OTHER_COLOR;
}

// Models — color by catalog index (stable identity).
export function modelColor(modelId: string, models: Model[]): string {
  const i = models.findIndex((m) => m.id === modelId);
  return i >= 0 && i < SERIES.length ? SERIES[i] : OTHER_COLOR;
}

export const STATUS = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
} as const;
