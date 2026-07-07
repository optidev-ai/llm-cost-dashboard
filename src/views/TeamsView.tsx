import { CircleDollarSign, TrendingUp, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { MixDonut, SpendAreaChart } from "@/components/dashboard/charts";
import { DeltaBadge, SectionCard, StatTile } from "@/components/dashboard/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { budgetByTeam, dailySpend, kpis, rowsInRange, spendByModel, spendByTeam } from "@/lib/analytics";
import { useDashboard } from "@/lib/datasource";
import { fmtCompact, fmtCurrency, fmtPct } from "@/lib/format";
import { modelColor } from "@/lib/palette";

export function TeamsView() {
  const { dataset, range } = useDashboard();
  const rows = useMemo(() => rowsInRange(dataset, range), [dataset, range]);
  const ranked = useMemo(() => spendByTeam(dataset, rows), [dataset, rows]);

  const [picked, setPicked] = useState<string>("");
  const teamId = ranked.some((t) => t.key === picked) ? picked : ranked[0]?.key;

  const teamRows = useMemo(() => rows.filter((r) => r.teamId === teamId), [rows, teamId]);
  const k = useMemo(() => kpis(teamRows), [teamRows]);
  const budget = useMemo(() => budgetByTeam(dataset).find((b) => b.teamId === teamId), [dataset, teamId]);
  const models = useMemo(() => spendByModel(dataset, teamRows), [dataset, teamRows]);
  const daily = useMemo(() => dailySpend(teamRows).map((d) => ({ date: d.date, Spend: d.cost })), [teamRows]);
  const rank = ranked.findIndex((t) => t.key === teamId) + 1;
  const team = dataset.teams.find((t) => t.id === teamId);
  const orgShare = ranked.find((t) => t.key === teamId)?.share ?? 0;

  return (
    <div className="space-y-4 p-6">
      {/* team picker */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={teamId} onValueChange={setPicked}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Select a team" />
          </SelectTrigger>
          <SelectContent>
            {ranked.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.name} · {fmtCurrency(t.cost)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground">
          {team?.department && <span className="mr-3">{team.department}</span>}
          Rank <span className="tnum text-foreground">#{rank}</span> of {ranked.length} · {fmtPct(orgShare * 100)} of
          org spend
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={`Spend · ${range.label}`}
          value={fmtCurrency(k.spend)}
          icon={CircleDollarSign}
          sub={`${fmtCompact(k.tokens)} tokens`}
        />
        <StatTile
          label="Forecast · month-end"
          value={budget ? fmtCurrency(budget.forecast) : "—"}
          icon={TrendingUp}
          accent
          sub={budget ? `${fmtCurrency(budget.mtd)} MTD` : undefined}
        />
        <StatTile
          label="Budget used · forecast"
          value={budget ? fmtPct(budget.util * 100, 0) : "—"}
          icon={Wallet}
          sub={budget ? `of ${fmtCurrency(budget.budget)}/mo` : undefined}
        />
        <StatTile
          label="Requests"
          value={k.requests ? fmtCompact(k.requests) : "—"}
          icon={Users}
          sub={`${fmtPct(k.cacheHitRate * 100)} cache hit`}
        />
      </div>

      {/* trend + model mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="Spend over time" subtitle={`${team?.name ?? "Team"} · daily`}>
          <SpendAreaChart data={daily} keys={["Spend"]} colorFor={() => "var(--series-1)"} />
        </SectionCard>
        <SectionCard title="Model mix" subtitle="This team's models">
          <MixDonut
            data={models}
            colorFor={(key) => modelColor(key, dataset.models)}
            centerLabel="Total"
            centerValue={fmtCurrency(k.spend)}
          />
        </SectionCard>
      </div>

      {/* budget bar */}
      {budget && (
        <SectionCard title="Budget vs. actual" subtitle="Forecast-to-month-end against this team's monthly budget">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, budget.util * 100)}%`,
                    backgroundColor:
                      budget.status === "over"
                        ? "var(--status-critical)"
                        : budget.status === "watch"
                          ? "var(--status-warning)"
                          : "var(--status-good)",
                  }}
                />
              </div>
            </div>
            <div className="tnum shrink-0 text-sm">
              <span className="font-semibold text-foreground">{fmtCurrency(budget.forecast)}</span>
              <span className="text-muted-foreground"> / {fmtCurrency(budget.budget)}</span>
            </div>
            <DeltaBadge value={budget.util - 1} goodDirection="down" />
          </div>
        </SectionCard>
      )}
    </div>
  );
}
