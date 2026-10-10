"use client";

import React from "react";
import { SplitRows, type SplitRowsProps } from "@/components/transactions/split-rows";

export type SplitSectionProps = Omit<SplitRowsProps, "idPrefix" | "showCount" | "variant">;

/**
 * New-entry split editor (plan S-4): the shared SplitRows, variant "entry", with the "txnew-split" ids.
 * The parent page owns count, rows, the numpad target and the CategorySelector.
 * Not rendered for Transfer (the page hides it).
 */
export function SplitSection(props: SplitSectionProps) {
  return <SplitRows {...props} idPrefix="txnew-split" variant="entry" />;
}
