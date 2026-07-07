import { Check, KeyRound, Loader2, Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { ProviderLogo, ProviderTile } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDashboard } from "@/lib/datasource";
import { CONNECTABLE_PROVIDERS, connectKey, disconnectProvider, getProxyUrl, listProviders } from "@/lib/live-source";
import type { ProviderId } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Provider manager — connect one or several providers to see combined spend.
 * Connect stores + validates the key fast (~1s); the slow usage pull happens on
 * the dashboard afterward (see the first-sync state). One row per provider.
 */
export function ProviderManager({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { onConnectionsChanged } = useDashboard();

  const [connected, setConnected] = useState<ProviderId[]>([]);
  const [expanded, setExpanded] = useState<ProviderId | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backendReady = Boolean(getProxyUrl());

  useEffect(() => {
    if (!open || !backendReady) return;
    let cancelled = false;
    listProviders()
      .then((p) => !cancelled && setConnected(p))
      .catch(() => {
        /* not configured yet → treat as none connected */
      });
    return () => {
      cancelled = true;
    };
  }, [open, backendReady]);

  function startConnect(id: ProviderId) {
    setExpanded(id);
    setKeyInput("");
    setError(null);
  }

  async function saveKey(id: ProviderId) {
    setBusy(id);
    setError(null);
    try {
      await connectKey(id, keyInput.trim());
      setConnected((c) => (c.includes(id) ? c : [...c, id]));
      setExpanded(null);
      setKeyInput("");
      onConnectionsChanged(); // dashboard pulls the newly-connected data
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't connect that key.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: ProviderId) {
    setBusy(id);
    try {
      const remaining = await disconnectProvider(id);
      setConnected(remaining);
      onConnectionsChanged();
    } catch {
      /* leave state as-is on failure */
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Data sources</DialogTitle>
          <DialogDescription>
            Connect your providers to see combined spend across every model and org.
          </DialogDescription>
        </DialogHeader>

        {!backendReady ? (
          <div className="rounded-lg border border-primary/25 bg-gradient-to-br from-primary/10 to-transparent p-4 text-sm">
            <p className="font-medium text-foreground">Live data isn't wired up yet</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              On OptiDev, ask the agent to activate OptiDev Cloud and deploy the{" "}
              <code className="rounded bg-secondary px-1 py-0.5 text-foreground">usage</code> function, then reopen this
              dialog. Self-hosting? Set{" "}
              <code className="rounded bg-secondary px-1 py-0.5 text-foreground">VITE_USAGE_PROXY_URL</code>.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {CONNECTABLE_PROVIDERS.map((p) => {
              const isConnected = connected.includes(p.id);
              const isExpanded = expanded === p.id;
              const isBusy = busy === p.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-lg border bg-card p-3 transition-colors",
                    isConnected ? "border-status-good/30" : "border-border",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <ProviderTile provider={p.id} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {isConnected ? "Reading your org Usage & Cost API" : p.note}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isConnected ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-status-good">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} /> Connected
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() => remove(p.id)}
                            disabled={isBusy}
                          >
                            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
                          </Button>
                        </>
                      ) : (
                        !isExpanded && (
                          <Button size="sm" className="h-7" onClick={() => startConnect(p.id)}>
                            Connect
                          </Button>
                        )
                      )}
                    </div>
                  </div>

                  {isExpanded && !isConnected && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-border pt-3">
                      <div className="label-caps">{p.keyLabel}</div>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          autoComplete="off"
                          placeholder={`${p.keyPrefix}…`}
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && keyInput.trim().length >= 8 && saveKey(p.id)}
                          className="tnum"
                        />
                        <Button size="sm" onClick={() => saveKey(p.id)} disabled={isBusy || keyInput.trim().length < 8}>
                          {isBusy ? (
                            <>
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Validating…
                            </>
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setExpanded(null)} disabled={isBusy}>
                          Cancel
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{p.note} Stored encrypted server-side.</p>
                      {error && (
                        <p className="text-xs" style={{ color: "var(--status-serious)" }}>
                          {error}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Google / Gemini — not yet connectable (billing lives in Google Cloud) */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 opacity-60">
              <ProviderTile provider="google" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">Google · Gemini</div>
                <div className="truncate text-xs text-muted-foreground">
                  Billing lives in Google Cloud — coming soon
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">Coming soon</span>
            </div>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" strokeWidth={2} /> Keys encrypted server-side
          </span>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Small trigger used in the topbar when nothing is connected yet. */
export function ConnectProviderButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
      Connect a provider
    </button>
  );
}

/** Chips showing connected providers; the whole control opens the manager. */
export function ProviderChips({ providers, onClick }: { providers: ProviderId[]; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Manage data sources"
      className="inline-flex items-center gap-2 rounded-md border border-status-good/30 px-2.5 py-1.5 text-xs font-medium text-status-good transition-colors hover:border-status-good/50"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      Live
      <span className="flex items-center gap-1.5 text-foreground">
        {providers.map((p) => (
          <ProviderLogo key={p} provider={p} className="h-3.5 w-3.5" />
        ))}
      </span>
    </button>
  );
}
