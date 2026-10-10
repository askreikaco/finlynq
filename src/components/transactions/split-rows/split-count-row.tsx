"use client";

import * as React from "react";
import { Split } from "lucide-react";

import { FormRow } from "@/components/forms";
import type { CountHint } from "@/lib/transactions/split-math";

export interface SplitCountRowProps {
  /** DOM id of the count input (also the label target). */
  id: string;
  /** Raw count text, digits only (max 2). "" = no split. */
  value: string;
  /** Hint under the row, from parseCount(). */
  hint: CountHint | null;
  onChange: (next: string) => void;
  /** Focus closes the amount numpad (the count uses the OS numeric keyboard). */
  onFocus?: () => void;
}

const HINT_TEXT: Record<CountHint, string> = {
  "enter-two-or-more": "Enter 2 or more to split",
  "up-to-20": "Up to 20 splits",
};

/**
 * The "Splits" count field: FormRow-style row with the Split icon and a right-aligned
 * integer input. Numeric keyboard, no Numpad. Non-digits are stripped and the text is
 * capped at 2 characters; the cap of 20 applies in parseCount, not here.
 */
export function SplitCountRow({ id, value, hint, onChange, onFocus }: SplitCountRowProps) {
  return (
    <FormRow
      variant="custom"
      icon={Split}
      label="Splits"
      htmlFor={id}
      labelWidth="narrow"
      height="tall"
      hint={hint ? HINT_TEXT[hint] : undefined}
    >
      <input
        id={id}
        type="text"
        data-testid="split-count"
        aria-label="Number of splits"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
        onFocus={() => onFocus?.()}
        className="w-full bg-transparent text-right text-base tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
      />
    </FormRow>
  );
}
