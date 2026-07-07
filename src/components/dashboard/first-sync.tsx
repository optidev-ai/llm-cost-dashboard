import { Check } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * First-sync state — shown while the FIRST live pull runs after a connect.
 * Provider usage APIs are slow (10–40s), so instead of a frozen modal we close
 * the dialog fast and show this honest, stepped progress on the dashboard. The
 * steps auto-advance on a demo timeline; the pull finishing swaps this for data.
 */
export function FirstSync() {
  const [stage, setStage] = useState(0); // 0: 30d, 1: 90d

  useEffect(() => {
    const t = setTimeout(() => setStage(1), 2600);
    return () => clearTimeout(t);
  }, []);

  const steps = [
    { label: "Key stored & verified", done: true },
    { label: "Fetching the last 30 days…", done: stage > 0 },
    { label: "Loading full 90-day history", done: false },
  ];
  const activeIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-[460px] rounded-xl border border-border bg-card p-7 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-muted-foreground motion-reduce:animate-none" />
        <h3 className="mt-4 text-[15px] font-semibold text-foreground">Syncing your usage…</h3>
        <p className="mx-auto mt-1 max-w-[42ch] text-sm text-muted-foreground">
          Pulling your organization's spend from the provider. The first sync can take up to a minute — provider usage
          APIs are slow.
        </p>

        <ul className="mt-5 flex flex-col gap-2.5 text-left">
          {steps.map((s, i) => (
            <li
              key={s.label}
              className={`flex items-center gap-3 text-sm ${s.done || i === activeIdx ? "text-foreground" : "text-muted-foreground"}`}
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                {s.done ? (
                  <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-status-good">
                    <Check className="h-2.5 w-2.5 text-background" strokeWidth={3.5} />
                  </span>
                ) : i === activeIdx ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-foreground motion-reduce:animate-none" />
                ) : (
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-border" />
                )}
              </span>
              {s.label}
            </li>
          ))}
        </ul>

        <p className="mt-5 border-t border-border pt-3.5 text-xs text-muted-foreground">
          <span className="font-medium">Cached after the first load</span> — reopening is instant; we refresh in the
          background.
        </p>
      </div>
    </div>
  );
}
