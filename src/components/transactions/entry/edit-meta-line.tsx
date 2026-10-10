"use client";

import { Badge } from "@/components/ui/badge";
import { labelForSource } from "@/lib/tx-source";
import type { DialogTransaction } from "@/components/transactions/transaction-dialog";

/** Edit mode: the muted "Created …, Updated …" line with the source badge (same data the old Edit page showed). */
export function EditMetaLine({ tx }: { tx: Pick<DialogTransaction, "createdAt" | "updatedAt" | "source"> }) {
  const created = tx.createdAt ? new Date(tx.createdAt).toLocaleString() : null;
  const updated = tx.updatedAt ? new Date(tx.updatedAt).toLocaleString() : null;
  const sourceLabel = tx.source ? labelForSource(tx.source) : null;
  if (!created && !updated && !sourceLabel) return null;
  return (
    <div
      data-testid="txnew-edit-meta"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
    >
      {created && <span>Created {created}</span>}
      {updated && <span>· Updated {updated}</span>}
      {sourceLabel && (
        <Badge variant="outline" className="text-xs py-0 px-1.5">
          {sourceLabel}
        </Badge>
      )}
    </div>
  );
}
