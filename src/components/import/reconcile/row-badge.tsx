"use client";

/**
 * RowBadge — small status pill rendered next to each staged row in the
 * FilePane (right pane of the /import/pending two-pane UI, FINLYNQ-56).
 *
 * Mirrors the four reconcile_state values (unmatched / auto_suggested /
 * linked / skipped_duplicate) plus a synthetic "duplicate" badge for the
 * pre-existing dedup marker. The badge is purely visual — actions live on
 * the parent row's button group, not here.
 */

import { Badge } from "@/components/ui/badge";

export type ReconcileState =
  | "unmatched"
  | "auto_suggested"
  | "linked"
  | "skipped_duplicate";

export function RowBadge({
  state,
  linkedTransactionId,
}: {
  state: ReconcileState;
  linkedTransactionId?: number | null;
}) {
  switch (state) {
    case "linked":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-pos/10 text-pos border-pos/30"
          title={
            linkedTransactionId != null
              ? `Linked to tx #${linkedTransactionId}`
              : "Linked"
          }
        >
          linked
        </Badge>
      );
    case "auto_suggested":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-info/10 text-info border-info/30"
        >
          suggested
        </Badge>
      );
    case "skipped_duplicate":
      return (
        <Badge
          variant="outline"
          className="text-[10px] bg-warning/10 text-warning border-warning/30"
        >
          already imported
        </Badge>
      );
    case "unmatched":
    default:
      return null;
  }
}
