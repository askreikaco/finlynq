"use client";

/**
 * InvestmentOpPreviewDialog (FINLYNQ-208) — preview-before-record for an
 * investment bank row that a `record_investment_op` rule matched.
 *
 * Mirrors normal bank reconciliation: clicking "Create" on a reconcile row
 * shows what WILL be recorded and waits for an explicit confirm — it never
 * auto-records. The preview is built from the captured row data + the matched
 * op (the rule's default bindings read qty/amount straight off the row, which
 * is what the executor records).
 *
 * Neutral (non-destructive) styling — recording a transaction isn't a delete,
 * so this intentionally does NOT reuse the destructive ConfirmDialog.
 */

import { Overlay } from "@/components/ui/overlay";
import { formatCurrency } from "@/lib/currency";

export interface InvestmentOpPreview {
  /** Op the matched rule will record (buy/sell/dividend/interest/fee/…). */
  op: string;
  ticker: string | null;
  securityName: string | null;
  /** Captured share/unit quantity (signed). */
  quantity: number | null;
  /** Bank row signed amount. */
  amount: number;
  currency: string;
  /** Display name of the investment account the op books into. */
  accountName: string;
}

function fmtQty(q: number | null): string {
  if (q == null || !Number.isFinite(q)) return "—";
  return String(Number(Math.abs(q).toFixed(6)));
}

export function InvestmentOpPreviewDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: InvestmentOpPreview | null;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!preview) return null;
  const op = preview.op;
  const isTrade = op === "buy" || op === "sell";
  // Income settled as shares (DRIP) — the suggestion label carries "(shares)".
  const isShares = /\(shares\)\s*$/.test(op);
  const showSecurityQty = isTrade || isShares;
  const security = preview.ticker || preview.securityName || "—";
  const amountAbs = formatCurrency(Math.abs(preview.amount), preview.currency || "CAD");

  return (
    <Overlay
      variant="confirm"
      destructive={false}
      size="md"
      open={open}
      busy={busy}
      onClose={() => onOpenChange(false)}
      title="Record investment transaction"
      confirmLabel={`Record ${op}`}
      busyLabel="Recording…"
      onConfirm={onConfirm}
    >
        <div className="text-sm space-y-3">
          <p className="text-muted-foreground">
            A matching rule will record this bank row as the operation below.
            Review it before recording — nothing is written until you confirm.
          </p>
          <dl className="rounded-md border bg-muted/20 p-3 grid grid-cols-[7rem_1fr] gap-y-1.5 gap-x-3">
            <dt className="text-muted-foreground">Operation</dt>
            <dd className="font-semibold uppercase tracking-wide">{op}</dd>
            {showSecurityQty && (
              <>
                <dt className="text-muted-foreground">Security</dt>
                <dd className="font-mono">{security}</dd>
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="tabular-nums">{fmtQty(preview.quantity)}</dd>
              </>
            )}
            {!showSecurityQty && security !== "—" && (
              <>
                <dt className="text-muted-foreground">Security</dt>
                <dd className="font-mono">{security}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="tabular-nums">{amountAbs}</dd>
            <dt className="text-muted-foreground">Account</dt>
            <dd>{preview.accountName}</dd>
          </dl>
          <p className="text-xs text-muted-foreground italic">
            {isTrade
              ? "Lots are matched FIFO automatically. The cash sleeve is adjusted and the bank row is linked."
              : isShares
                ? "Records the income AS SHARES on the holding (a lot opens at value ÷ quantity). No cash sleeve is touched; the bank row is linked."
                : "Records the cash entry on the account's sleeve and links the bank row."}
          </p>
        </div>
    </Overlay>
  );
}
