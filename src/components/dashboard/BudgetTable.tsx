import type { BudgetStatus, TeamBudget } from "@/lib/analytics";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { MiniBarMeter } from "./charts";
import { CapsLabel, StatusDot } from "./primitives";

const TONE: Record<BudgetStatus, { dot: "good" | "warning" | "critical"; bar: string }> = {
  under: { dot: "good", bar: "var(--status-good)" },
  watch: { dot: "warning", bar: "var(--status-warning)" },
  over: { dot: "critical", bar: "var(--status-critical)" },
};

const LABEL: Record<BudgetStatus, string> = { under: "On track", watch: "At risk", over: "Over" };

export function BudgetTable({ rows }: { rows: TeamBudget[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="[&>th]:pb-2 [&>th]:text-left">
            <th className="w-[38%]">
              <CapsLabel>Team</CapsLabel>
            </th>
            <th>
              <CapsLabel className="text-right">Forecast / Budget</CapsLabel>
            </th>
            <th className="w-[26%]">
              <CapsLabel>Utilization</CapsLabel>
            </th>
            <th>
              <CapsLabel className="text-right">Status</CapsLabel>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = TONE[r.status];
            return (
              <tr key={r.teamId} className="border-t border-border/60 transition-colors hover:bg-accent/40">
                <td className="py-2.5">
                  <div className="font-medium text-foreground">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.department}</div>
                </td>
                <td className="py-2.5 text-right">
                  <span className="tnum text-foreground">{fmtCurrency(r.forecast)}</span>
                  <span className="tnum text-muted-foreground"> / {fmtCurrency(r.budget)}</span>
                </td>
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <MiniBarMeter value={r.util} tone={tone.bar} />
                    <span className="tnum w-11 shrink-0 text-right text-xs text-foreground">{fmtPct(r.util * 100, 0)}</span>
                  </div>
                </td>
                <td className="py-2.5">
                  <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                    <StatusDot tone={tone.dot} />
                    {LABEL[r.status]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
