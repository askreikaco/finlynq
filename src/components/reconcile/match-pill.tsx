"use client";

/**
 * MatchPill — small status badge for the /reconcile two-pane UI.
 *
 * Extends the vocabulary of `pf-app/src/components/import/reconcile/row-badge.tsx`
 * (which is staged-row-bound) with reconcile-specific variants:
 *
 *   - linked_primary  — emerald — `transaction_bank_links.link_type='primary'`
 *                       AND `transactions.bank_transaction_id` mirrors it
 *   - linked_extra    — teal    — N:1 or 1:N additional link (FK stays on
 *                                 whoever was the primary)
 *   - suggested_exact — sky     — `tx.import_hash = bank.import_hash`
 *                                 (score 1.0; not yet accepted)
 *   - suggested_fuzzy — amber   — score ≥ threshold (not yet accepted)
 *   - bank_only       — rose    — bank row with no linked tx, no suggestion
 *   - tx_only         — rose    — tx with no linked bank, no suggestion
 *
 * Visual style mirrors `row-badge.tsx`'s outlined-pill pattern so the two
 * surfaces feel of-a-piece.
 */

import { Badge } from "@/components/ui/badge";

export type ReconcileBadgeVariant =
  | "linked_primary"
  | "linked_extra"
  | "suggested_exact"
  | "suggested_fuzzy"
  | "bank_only"
  | "tx_only";

const VARIANT_LABEL: Record<ReconcileBadgeVariant, string> = {
  linked_primary: "linked",
  linked_extra: "extra link",
  suggested_exact: "suggested (exact)",
  suggested_fuzzy: "suggested (fuzzy)",
  bank_only: "bank-only",
  tx_only: "tx-only",
};

const VARIANT_CLASS: Record<ReconcileBadgeVariant, string> = {
  linked_primary: "bg-pos/10 text-pos border-pos/30",
  linked_extra: "bg-pos/10 text-pos border-pos/30",
  suggested_exact: "bg-info/10 text-info border-info/30",
  suggested_fuzzy: "bg-warning/10 text-warning border-warning/30",
  bank_only: "bg-destructive/10 text-destructive border-destructive/30",
  tx_only: "bg-destructive/10 text-destructive border-destructive/30",
};

export function MatchPill({
  variant,
  title,
}: {
  variant: ReconcileBadgeVariant;
  title?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={`text-xs ${VARIANT_CLASS[variant]}`}
      title={title}
    >
      {VARIANT_LABEL[variant]}
    </Badge>
  );
}
