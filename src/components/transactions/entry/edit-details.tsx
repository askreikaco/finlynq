"use client";

import { SectionCard } from "@/components/mobile/section-card";
import { DetailList } from "@/components/mobile/detail-list";
import type { DetailItem } from "@/components/ui/overlay";
import type { DialogTransaction } from "@/components/transactions/transaction-dialog";

/**
 * Edit page: the read-only facts about the row that no field shows (they used to sit in the list's row sheet):
 * the operation Kind, the Investment and Quantity, and how many splits it has. Source, Created and Updated are the
 * EditMetaLine above. Nothing to show = nothing rendered. Pure; the caller passes the split count it already loaded.
 */
export function editDetailItems(
  tx: Pick<DialogTransaction, "portfolioHolding" | "quantity" | "kind">,
  splitCount: number | null | undefined,
): DetailItem[] {
  const items: DetailItem[] = [];
  if (tx.kind) items.push({ label: "Kind", value: tx.kind });
  if (tx.portfolioHolding) {
    items.push({ label: "Investment", value: tx.portfolioHolding });
    if (tx.quantity != null && tx.quantity !== 0) items.push({ label: "Quantity", value: String(tx.quantity) });
  }
  if (splitCount && splitCount > 0) items.push({ label: "Splits", value: `${splitCount} split${splitCount === 1 ? "" : "s"}` });
  return items;
}

export function EditDetails({
  tx,
  splitCount,
}: {
  tx: Pick<DialogTransaction, "portfolioHolding" | "quantity" | "kind">;
  splitCount?: number | null;
}) {
  const items = editDetailItems(tx, splitCount);
  if (items.length === 0) return null;
  return (
    <SectionCard
      label="Details"
      info="Read-only facts about this transaction. Kind is the investment operation that created it; the split count is how many categories its amount is divided between."
      infoLabel="About details"
      data-testid="tx-edit-details"
      className="py-0"
    >
      <DetailList items={items} />
    </SectionCard>
  );
}
