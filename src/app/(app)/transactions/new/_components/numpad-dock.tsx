"use client";

import React from "react";

import { cn } from "@/lib/utils";
import { evaluateAmountExpression } from "@/lib/transactions/amount-expression";
import { Numpad, hasBinaryOperator } from "./numpad";

export interface NumpadDockProps {
  /** Id of the amount field the keypad writes to. null = no field active, nothing rendered. */
  activeId: string | null;
  /** Current value of the active field. */
  activeValue: string;
  /** Commit callback, called with the field id it belongs to. */
  onChange: (id: string, value: string) => void;
  /** Done / Escape with no pending operator, or the page closing the dock. */
  onDone: () => void;
  /** Currency decimals applied to an evaluated expression result (0 for VND/JPY, 2 otherwise). */
  decimals: number;
  /** False hides the dock (unmounting it commits any pending expression). Defaults to true. */
  visible?: boolean;
  className?: string;
}

/**
 * Result of a commit from the keypad. The evaluator always rounds to 2 decimals, so when the
 * incoming value is exactly the evaluation of the pending expression, round it to the currency's
 * decimals. Typed input is never rounded: typing "1." or "4.5" at 0 decimals must stay as typed.
 */
function settleCommit(pending: string, next: string, decimals: number): string {
  if (!hasBinaryOperator(pending) || /[+\-*/]$/.test(pending)) return next;
  if (evaluateAmountExpression(pending) !== next) return next;
  const n = Number(next);
  if (!Number.isFinite(n)) return next;
  const d = Math.max(0, Math.min(20, Math.trunc(decimals)));
  const fixed = n.toFixed(d);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/**
 * One shared keypad for a screen with several amount fields. It follows the active field.
 * Switching the active field remounts the Numpad via `key`; the old instance's unmount cleanup
 * commits its pending expression to the previous field's onChange before the new one mounts.
 * Touch only (pointer-coarse): a desktop never shows it.
 */
export function NumpadDock({
  activeId,
  activeValue,
  onChange,
  onDone,
  decimals,
  visible = true,
  className,
}: NumpadDockProps) {
  if (!visible || activeId === null) return null;

  const id = activeId;
  return (
    <div
      data-testid="numpad-dock"
      className={cn(
        "fixed inset-x-0 bottom-[var(--sab,0px)] regular:left-[calc(5rem+var(--sal))] z-[60] hidden bg-background pointer-coarse:block animate-in slide-in-from-bottom duration-200",
        className,
      )}
    >
      <Numpad
        key={id}
        value={activeValue}
        onChange={(next) => onChange(id, settleCommit(activeValue, next, decimals))}
        onConfirm={onDone}
      />
    </div>
  );
}
