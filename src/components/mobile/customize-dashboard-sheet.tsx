"use client";

import { DASHBOARD_CARDS, type DashboardLayout } from "@/lib/dashboard-layout";
import { CustomizeCardsSheet } from "./customize-cards-sheet";

export type DashboardCard = (typeof DASHBOARD_CARDS)[number];

/** Dashboard wrapper over the generic CustomizeCardsSheet (title "Customize home"). `availableIds` limits the listed cards. */
export function CustomizeDashboardSheet({
  open,
  onOpenChange,
  layout,
  availableIds,
  onSave,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DashboardLayout;
  availableIds?: readonly string[];
  onSave: (layout: DashboardLayout) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const avail = new Set(availableIds ?? DASHBOARD_CARDS.map((c) => c.id));
  return (
    <CustomizeCardsSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customize home"
      description="Show, hide and reorder the cards on your dashboard."
      cards={DASHBOARD_CARDS.filter((c) => avail.has(c.id))}
      layout={layout}
      onSave={onSave}
      onReset={onReset}
    />
  );
}
