import { Cpu, LayoutDashboard, ScrollText, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PersonaView } from "@/lib/types";

interface NavItem {
  id: PersonaView;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { id: "executive", label: "Executive", hint: "Finance & allocation", icon: LayoutDashboard },
  { id: "platform", label: "Platform", hint: "Usage & reliability", icon: Cpu },
  { id: "team", label: "Teams", hint: "Per-team detail", icon: Users },
  { id: "audit", label: "Audit", hint: "Logs & alerts", icon: ScrollText },
];

function LogoMark() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-primary" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M7 14l3.5-4 3 3L21 6" />
      </svg>
    </div>
  );
}

export function Sidebar({ active, onNavigate }: { active: PersonaView; onNavigate: (v: PersonaView) => void }) {
  return (
    <aside className="flex w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">LLM Ledger</div>
          <div className="text-[11px] text-muted-foreground">Cost & Usage Governance</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        <div className="label-caps px-2 pb-1.5 pt-2">Views</div>
        {NAV.map((item) => {
          const on = item.id === active;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                on ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50",
              )}
            >
              {on && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
              <Icon className={cn("h-4 w-4 shrink-0", on ? "text-primary" : "text-muted-foreground")} strokeWidth={1.9} />
              <span className="min-w-0">
                <span className={cn("block text-sm font-medium", on ? "text-sidebar-foreground" : "text-sidebar-foreground/85")}>
                  {item.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="p-3">
        <a
          href="https://app.optidev.ai"
          target="_blank"
          rel="noreferrer"
          className="group flex flex-col gap-2 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-3.5 transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="pulse-dot" />
            Make it yours
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Fork this dashboard on OptiDev and customize it by chatting — add alerts, exports, your own metrics.
          </p>
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary">
            Open in OptiDev
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M7 7h10v10" />
            </svg>
          </span>
        </a>
      </div>
    </aside>
  );
}
