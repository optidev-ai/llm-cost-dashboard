import { FileCheck2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { CapsLabel, DeltaBadge, SectionCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reconcile } from "@/lib/analytics";
import { useDashboard } from "@/lib/datasource";
import { fmtCurrencyFull, fmtDayShort } from "@/lib/format";

/**
 * Invoice reconciliation — the finance-grade differentiator. Our per-row cost is
 * list-price (tokens × published rate); the Cost API returns what the org was
 * actually billed. This card shows the gap and explains it, and lets the user
 * enter their real invoice total for the last-mile check (taxes / minimums /
 * credits the Cost API omits).
 */
export function ReconcileCard() {
  const { dataset } = useDashboard();
  const [invoiceInput, setInvoiceInput] = useState("");
  const [applied, setApplied] = useState<number | undefined>(undefined);

  const rec = useMemo(() => reconcile(dataset, applied), [dataset, applied]);
  const providerName = useMemo(() => new Map(dataset.providers.map((p) => [p.id, p.name])), [dataset.providers]);

  // No billing truth to reconcile against (e.g. live mode before the Cost API
  // is reachable). Explain rather than render an empty box.
  if (!rec) {
    return (
      <SectionCard title="Invoice reconciliation" subtitle="List-price estimate vs. what you were actually billed">
        <p className="text-sm text-muted-foreground">
          Connect a provider admin key to reconcile your list-price estimate against your actual billed cost — the
          number finance can defend against the invoice.
        </p>
      </SectionCard>
    );
  }

  const savedAbs = Math.abs(rec.delta);
  const applyInvoice = (): void => {
    const n = Number(invoiceInput.replace(/[$,\s]/g, ""));
    setApplied(Number.isFinite(n) && n > 0 ? n : undefined);
  };
  const resetToApi = (): void => {
    setApplied(undefined);
    setInvoiceInput("");
  };

  return (
    <SectionCard
      title="Invoice reconciliation"
      subtitle={`List price vs. actual bill · ${fmtDayShort(rec.from)} – ${fmtDayShort(rec.to)}`}
      action={
        <span className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
          <FileCheck2 className="h-3 w-3" strokeWidth={2} />
          {rec.source === "invoice" ? "Your invoice" : "Provider Cost API"}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr_1.2fr]">
        {/* actual billed */}
        <div>
          <CapsLabel>Actual billed</CapsLabel>
          <div className="tnum mt-1 text-2xl font-semibold text-foreground">{fmtCurrencyFull(rec.billed)}</div>
          <p className="mt-1 text-xs text-muted-foreground">what you were charged</p>
        </div>

        {/* list-price estimate */}
        <div>
          <CapsLabel>List-price estimate</CapsLabel>
          <div className="tnum mt-1 text-2xl font-semibold text-muted-foreground">{fmtCurrencyFull(rec.estimated)}</div>
          <p className="mt-1 text-xs text-muted-foreground">tokens × published rate</p>
        </div>

        {/* the gap, explained */}
        <div className="lg:border-l lg:border-border/60 lg:pl-5">
          <div className="flex items-center gap-2">
            <CapsLabel>{rec.underList ? "Under list price" : "Over list price"}</CapsLabel>
            <DeltaBadge value={rec.deltaPct} goodDirection="down" />
          </div>
          <div
            className="tnum mt-1 text-2xl font-semibold"
            style={{ color: rec.underList ? "var(--status-good)" : "var(--status-critical)" }}
          >
            {rec.underList ? "−" : "+"}
            {fmtCurrencyFull(savedAbs)}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {rec.underList
              ? "below list — committed-use, batch & cache discounts your token math can't see."
              : "above list — minimums, negotiated premium, or usage outside the API window."}
          </p>
        </div>
      </div>

      {/* per-provider breakdown */}
      {rec.byProvider.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
          {rec.byProvider.map((p) => {
            const d = p.estimated ? (p.billed - p.estimated) / p.estimated : 0;
            return (
              <span
                key={p.provider}
                className="tnum inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
              >
                <span className="text-foreground">{providerName.get(p.provider) ?? p.provider}</span>
                {fmtCurrencyFull(p.billed)}
                <span style={{ color: d < 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                  {d < 0 ? "" : "+"}
                  {(d * 100).toFixed(1)}%
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* last-mile: reconcile against the real invoice total */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <span className="text-xs text-muted-foreground">Reconcile against your invoice:</span>
        <Input
          value={invoiceInput}
          onChange={(e) => setInvoiceInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyInvoice()}
          placeholder="e.g. 41230"
          className="tnum h-8 w-[130px]"
          inputMode="decimal"
        />
        <Button variant="outline" size="sm" onClick={applyInvoice} className="h-8">
          Apply
        </Button>
        {rec.source === "invoice" && (
          <>
            <span className="text-xs text-muted-foreground">
              vs. Cost API — {fmtCurrencyFull(dataset.billing?.billedCost ?? 0)} · a{" "}
              {fmtCurrencyFull(Math.abs(rec.billed - (dataset.billing?.billedCost ?? 0)))} gap (taxes · minimums ·
              credits).
            </span>
            <Button variant="ghost" size="sm" onClick={resetToApi} className="h-8 gap-1.5">
              <RotateCcw className="h-3 w-3" /> Reset
            </Button>
          </>
        )}
      </div>
    </SectionCard>
  );
}
