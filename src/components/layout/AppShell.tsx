import { useState } from "react";
import { Cpu, ScrollText, Users } from "lucide-react";
import type { PersonaView } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ExecutiveView } from "@/views/ExecutiveView";
import { ComingSoon } from "@/views/ComingSoon";

export function AppShell() {
  const [view, setView] = useState<PersonaView>("executive");

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar active={view} onNavigate={setView} />
      <main className="bg-grid flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar view={view} />
        {view === "executive" && <ExecutiveView />}
        {view === "platform" && (
          <ComingSoon
            icon={Cpu}
            title="Platform & Reliability"
            points={[
              "Model & provider mix, cost per request, cache-hit rate",
              "Latency p50/p95 and error rate by provider",
              "Budget-headroom gauges and allowed-model policy compliance",
            ]}
          />
        )}
        {view === "team" && (
          <ComingSoon
            icon={Users}
            title="Team Detail"
            points={[
              "A single team's spend vs. budget and trend",
              "Top projects and top users within the team",
              "Their model mix and week-over-week movement",
            ]}
          />
        )}
        {view === "audit" && (
          <ComingSoon
            icon={ScrollText}
            title="Audit & Alerts"
            points={[
              "Request-level log with team / model / date filters + export",
              "Multi-threshold budget alerts (50 / 75 / 90 / 100%)",
              "Spend-spike anomaly detection",
            ]}
          />
        )}
      </main>
    </div>
  );
}
