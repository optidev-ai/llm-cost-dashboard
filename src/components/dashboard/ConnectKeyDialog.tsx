import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CONNECTABLE_PROVIDERS, connectKey, fetchLiveUsage, ProxyNotConfiguredError } from "@/lib/live-source";
import type { Dataset, ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";

type Phase = "form" | "submitting" | "needs-backend" | "error";

export function ConnectKeyDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConnected?: (ds: Dataset) => void;
}) {
  const [provider, setProvider] = useState<ProviderId>("anthropic");
  const [key, setKey] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [errorMsg, setErrorMsg] = useState("");

  const meta = CONNECTABLE_PROVIDERS.find((p) => p.id === provider)!;

  function reset() {
    setPhase("form");
    setErrorMsg("");
    setKey("");
  }

  async function handleConnect() {
    setPhase("submitting");
    try {
      await connectKey(provider, key.trim()); // persist server-side, once
      const ds = await fetchLiveUsage({ days: 90 }); // now uses the stored key
      onConnected?.(ds);
      onOpenChange(false);
      reset();
    } catch (e) {
      if (e instanceof ProxyNotConfiguredError) setPhase("needs-backend");
      else {
        setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
        setPhase("error");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" strokeWidth={2} />
            Connect your data
          </DialogTitle>
          <DialogDescription>Swap the demo for your organization's real LLM spend.</DialogDescription>
        </DialogHeader>

        {(phase === "form" || phase === "submitting" || phase === "error") && (
          <div className="space-y-4">
            {/* provider toggle */}
            <div>
              <div className="label-caps mb-1.5">Provider</div>
              <div className="grid grid-cols-2 gap-2">
                {CONNECTABLE_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      p.id === provider
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* key input */}
            <div>
              <div className="label-caps mb-1.5">{meta.keyLabel}</div>
              <Input
                type="password"
                autoComplete="off"
                placeholder={`${meta.keyPrefix}…`}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="tnum"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">{meta.note}</p>
            </div>

            {/* how it works */}
            <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-good" strokeWidth={1.75} />
              <span>
                Your admin key is read <span className="text-foreground">server-side</span> by an edge function and
                never touches the browser. It pulls the provider Usage &amp; Cost API and returns aggregated spend.
              </span>
            </div>

            {phase === "error" && (
              <p
                className="rounded-md bg-status-critical/10 px-3 py-2 text-xs"
                style={{ color: "var(--status-critical)" }}
              >
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={phase === "submitting"}>
                Cancel
              </Button>
              <Button
                onClick={handleConnect}
                disabled={phase === "submitting" || key.trim().length < 8}
                className="gap-1.5"
              >
                {phase === "submitting" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" strokeWidth={2} /> Connect
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {phase === "needs-backend" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-4">
              <p className="text-sm font-medium text-foreground">Real data isn't wired up yet</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                Reading your org's usage needs the{" "}
                <code className="rounded bg-secondary px-1 py-0.5 text-foreground">usage</code> function deployed — it
                holds your admin key server-side and calls the provider API (a browser can't: CORS + key exposure). Set
                it up one of two ways:
              </p>
            </div>
            <div className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="mb-1 font-medium text-foreground">On OptiDev</p>
                Ask the agent to{" "}
                <span className="text-foreground">activate OptiDev Cloud and deploy the usage function</span>, then
                reopen this dialog and connect your key.
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="mb-1 font-medium text-foreground">Self-hosted</p>
                Deploy{" "}
                <code className="rounded bg-secondary px-1 py-0.5 text-foreground">supabase/functions/usage</code> and
                set <code className="rounded bg-secondary px-1 py-0.5 text-foreground">VITE_USAGE_PROXY_URL</code> to
                its URL, then reconnect.
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
