import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, points }: { icon: LucideIcon; title: string; points: string[] }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/25">
          <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">This view is next on the build. It will show:</p>
        <ul className="mt-4 space-y-2 text-left text-sm">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
