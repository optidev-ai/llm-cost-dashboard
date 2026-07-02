import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fmtPctDelta } from "@/lib/format";

export function CapsLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("label-caps", className)}>{children}</div>;
}

/** Signed delta chip. For cost metrics, up is bad → pass goodDirection="down". */
export function DeltaBadge({
  value,
  goodDirection = "up",
  className,
}: {
  value: number; // fraction, e.g. 0.124
  goodDirection?: "up" | "down";
  className?: string;
}) {
  const pct = value * 100;
  const flat = Math.abs(pct) < 0.05;
  const isGood = flat ? true : value > 0 === (goodDirection === "up");
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tnum",
        flat
          ? "bg-muted text-muted-foreground"
          : isGood
            ? "bg-status-good/12 text-status-good"
            : "bg-status-critical/12 text-status-critical",
        className,
      )}
      style={
        flat
          ? undefined
          : {
              backgroundColor: isGood ? "color-mix(in oklab, var(--status-good) 14%, transparent)" : "color-mix(in oklab, var(--status-critical) 16%, transparent)",
              color: isGood ? "var(--status-good)" : "var(--status-critical)",
            }
      }
    >
      {!flat && <Icon className="h-3 w-3" strokeWidth={2.5} />}
      {fmtPctDelta(pct)}
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  deltaGoodDir = "up",
  sub,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaGoodDir?: "up" | "down";
  sub?: ReactNode;
  icon?: LucideIcon;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-4 transition-colors",
        accent ? "border-primary/40" : "hover:border-border/80",
      )}
    >
      {accent && (
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      )}
      <div className="flex items-center justify-between">
        <CapsLabel>{label}</CapsLabel>
        {Icon && <Icon className={cn("h-4 w-4", accent ? "text-primary" : "text-muted-foreground")} strokeWidth={1.75} />}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className="tnum text-[28px] font-semibold leading-none tracking-tight text-foreground">{value}</div>
        {delta !== undefined && <DeltaBadge value={delta} goodDirection={deltaGoodDir} className="mb-0.5" />}
      </div>
      {sub && <div className="mt-2 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-3.5">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatusDot({ tone }: { tone: "good" | "warning" | "serious" | "critical" }) {
  const map = {
    good: "var(--status-good)",
    warning: "var(--status-warning)",
    serious: "var(--status-serious)",
    critical: "var(--status-critical)",
  } as const;
  return <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: map[tone] }} />;
}
