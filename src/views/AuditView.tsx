import { AlertTriangle, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { CapsLabel, SectionCard, StatusDot } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { anomalies, budgetAlerts, rowsInRange } from "@/lib/analytics";
import { useDashboard } from "@/lib/datasource";
import { fmtCompact, fmtCurrency, fmtDayShort, fmtPct } from "@/lib/format";

const ROW_CAP = 100;

export function AuditView() {
  const { dataset, range } = useDashboard();
  const rows = useMemo(() => rowsInRange(dataset, range), [dataset, range]);
  const teamName = useMemo(() => new Map(dataset.teams.map((t) => [t.id, t.name])), [dataset]);
  const modelName = useMemo(() => new Map(dataset.models.map((m) => [m.id, m.name])), [dataset]);

  const [teamFilter, setTeamFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");

  const alerts = useMemo(() => budgetAlerts(dataset), [dataset]);
  const spikes = useMemo(() => anomalies(dataset), [dataset]);

  const filtered = useMemo(() => {
    return rows
      .filter(
        (r) =>
          (teamFilter === "all" || r.teamId === teamFilter) && (modelFilter === "all" || r.modelId === modelFilter),
      )
      .sort((a, b) => (a.date === b.date ? b.cost - a.cost : b.date.localeCompare(a.date)));
  }, [rows, teamFilter, modelFilter]);

  function exportCsv() {
    const header = ["date", "team", "model", "requests", "input_tokens", "output_tokens", "cached_tokens", "cost_usd"];
    const lines = filtered.map((r) =>
      [
        r.date,
        teamName.get(r.teamId) ?? r.teamId,
        modelName.get(r.modelId) ?? r.modelId,
        r.requests,
        r.inputTokens,
        r.outputTokens,
        r.cachedTokens,
        r.cost.toFixed(4),
      ]
        .map((v) => (typeof v === "string" && v.includes(",") ? `"${v}"` : v))
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `llm-usage-${range.label.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 px-6 py-6 lg:px-8">
      {/* alerts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Budget alerts"
          subtitle="Teams forecast to cross 90% / 100% of budget"
          action={<span className="tnum text-sm font-semibold text-foreground">{alerts.length}</span>}
        >
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">All teams within budget.</p>
          ) : (
            <ul className="space-y-2.5">
              {alerts.map((a) => (
                <li key={a.teamId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <StatusDot tone={a.level === "critical" ? "critical" : "warning"} />
                    {a.name}
                  </span>
                  <span className="tnum text-muted-foreground">
                    {fmtPct(a.util * 100, 0)} of budget ·{" "}
                    <span
                      style={{ color: a.level === "critical" ? "var(--status-critical)" : "var(--status-warning)" }}
                    >
                      {a.level === "critical" ? "over" : "at risk"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Spend anomalies"
          subtitle="Team-days exceeding 3× trailing-7-day median"
          action={<span className="tnum text-sm font-semibold text-foreground">{spikes.length}</span>}
        >
          {spikes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spikes detected.</p>
          ) : (
            <ul className="space-y-2.5">
              {spikes.map((s) => (
                <li key={`${s.teamId}-${s.date}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--status-serious)" }} strokeWidth={2} />
                    {s.name}
                    <span className="text-muted-foreground">· {fmtDayShort(s.date)}</span>
                  </span>
                  <span className="tnum">
                    <span className="text-foreground">{fmtCurrency(s.cost)}</span>{" "}
                    <span style={{ color: "var(--status-serious)" }}>{s.factor.toFixed(1)}×</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* request log */}
      <SectionCard
        title="Usage log"
        subtitle={`${filtered.length.toLocaleString()} rows · ${range.label}`}
        action={
          <div className="flex items-center gap-2">
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {dataset.teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {dataset.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 gap-1.5">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border [&>th]:px-5 [&>th]:py-2.5 [&>th]:text-left">
                <th>
                  <CapsLabel>Date</CapsLabel>
                </th>
                <th>
                  <CapsLabel>Team</CapsLabel>
                </th>
                <th>
                  <CapsLabel>Model</CapsLabel>
                </th>
                <th>
                  <CapsLabel className="text-right">Requests</CapsLabel>
                </th>
                <th>
                  <CapsLabel className="text-right">Tokens</CapsLabel>
                </th>
                <th>
                  <CapsLabel className="text-right">Cost</CapsLabel>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, ROW_CAP).map((r) => (
                <tr
                  key={`${r.date}-${r.teamId}-${r.modelId}`}
                  className="border-b border-border/50 transition-colors hover:bg-accent/40 [&>td]:px-5 [&>td]:py-2"
                >
                  <td className="tnum whitespace-nowrap text-muted-foreground">{fmtDayShort(r.date)}</td>
                  <td className="text-foreground">{teamName.get(r.teamId) ?? r.teamId}</td>
                  <td>
                    <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-foreground">
                      {modelName.get(r.modelId) ?? r.modelId}
                    </span>
                  </td>
                  <td className="tnum text-right text-muted-foreground">{r.requests ? fmtCompact(r.requests) : "—"}</td>
                  <td className="tnum text-right text-muted-foreground">
                    {fmtCompact(r.inputTokens + r.outputTokens)}
                  </td>
                  <td className="tnum text-right text-foreground">{fmtCurrency(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > ROW_CAP && (
            <p className="px-5 py-3 text-xs text-muted-foreground">
              Showing top {ROW_CAP} of {filtered.length.toLocaleString()} rows — export CSV for the full set.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
