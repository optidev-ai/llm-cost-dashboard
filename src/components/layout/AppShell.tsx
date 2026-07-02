import { useState } from "react";
import type { PersonaView } from "@/lib/types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ExecutiveView } from "@/views/ExecutiveView";
import { PlatformView } from "@/views/PlatformView";
import { TeamsView } from "@/views/TeamsView";
import { AuditView } from "@/views/AuditView";

export function AppShell() {
  const [view, setView] = useState<PersonaView>("executive");

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar active={view} onNavigate={setView} />
      <main className="bg-grid flex min-w-0 flex-1 flex-col overflow-y-auto">
        <Topbar view={view} />
        {view === "executive" && <ExecutiveView />}
        {view === "platform" && <PlatformView />}
        {view === "team" && <TeamsView />}
        {view === "audit" && <AuditView />}
      </main>
    </div>
  );
}
