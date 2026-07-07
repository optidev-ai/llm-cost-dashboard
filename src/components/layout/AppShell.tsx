import { useState } from "react";
import { FirstSync } from "@/components/dashboard/first-sync";
import { useDashboard } from "@/lib/datasource";
import type { PersonaView } from "@/lib/types";
import { AuditView } from "@/views/AuditView";
import { ExecutiveView } from "@/views/ExecutiveView";
import { PlatformView } from "@/views/PlatformView";
import { TeamsView } from "@/views/TeamsView";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const [view, setView] = useState<PersonaView>("executive");
  const { isSyncing } = useDashboard();

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar active={view} onNavigate={setView} />
      <main className="bg-grid flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar view={view} />
        {isSyncing ? (
          <FirstSync />
        ) : (
          <>
            {view === "executive" && <ExecutiveView />}
            {view === "platform" && <PlatformView />}
            {view === "team" && <TeamsView />}
            {view === "audit" && <AuditView />}
          </>
        )}
      </main>
    </div>
  );
}
