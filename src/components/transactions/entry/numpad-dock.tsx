"use client";

import React from "react";

import { cn } from "@/lib/utils";
import { evaluateAmountExpression } from "@/lib/transactions/amount-expression";
import { Numpad, hasBinaryOperator } from "./numpad";

/** Height of the currency chip row (py-1.5 + 44px chips). Shown above the keypad when chips are passed. */
export const CURRENCY_CHIP_ROW_PX = 56;
/** Most chips the row shows. */
export const MAX_CURRENCY_CHIPS = 6;

// Symbols where Intl's English symbol is not the one the keypad shows.
const SYMBOL_OVERRIDES: Record<string, string> = { USD: "US$", JPY: "JP¥", THB: "฿" };

/** Short symbol for a currency chip (₫, €, £, US$ ...). Falls back to the code when there is none. */
export function currencyChipSymbol(code: string): string {
  const override = SYMBOL_OVERRIDES[code];
  if (override) return override;
  try {
    const part = new Intl.NumberFormat("en", { style: "currency", currency: code })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    const symbol = part?.value;
    if (!symbol || /^[A-Za-z]+$/.test(symbol)) return code;
    return symbol;
  } catch {
    return code;
  }
}

/**
 * Chip list for the keypad: the entered currency first, then the account's currency, then the
 * offered list (the currency sheet's list), de-duplicated and capped at MAX_CURRENCY_CHIPS.
 */
export function buildCurrencyChips(
  entered: string,
  accountCurrency: string | undefined,
  offered: readonly string[],
  max: number = MAX_CURRENCY_CHIPS,
): string[] {
  const out: string[] = [];
  for (const code of [entered, accountCurrency ?? "", ...offered]) {
    if (!code || out.includes(code)) continue;
    out.push(code);
    if (out.length >= max) break;
  }
  return out;
}

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
  /** Chip codes for the currency row. Omit (or pass none) to hide the row, e.g. for split rows. */
  currencies?: string[];
  /** Entered currency: the active chip. */
  currency?: string;
  /** Tapping a chip. Same handler as the currency sheet; the keypad stays open. */
  onCurrencyChange?: (code: string) => void;
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
  currencies,
  currency,
  onCurrencyChange,
  className,
}: NumpadDockProps) {
  if (!visible || activeId === null) return null;

  const id = activeId;
  const chips = currency && onCurrencyChange && currencies ? currencies : [];
  return (
    <div
      data-testid="numpad-dock"
      className={cn(
        "fixed inset-x-0 bottom-[var(--sab,0px)] regular:left-[calc(5rem+var(--sal))] z-[60] hidden bg-background pointer-coarse:block animate-in slide-in-from-bottom duration-200",
        className,
      )}
    >
      {chips.length > 0 && (
        <div
          role="group"
          aria-label="Currency"
          className="flex gap-1.5 overflow-x-auto px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map((code) => {
            const active = code === currency;
            return (
              <button
                key={code}
                type="button"
                aria-label={code}
                aria-pressed={active}
                onClick={() => onCurrencyChange?.(code)}
                className={cn(
                  "flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-4 text-base font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground active:bg-muted/70",
                )}
              >
                {currencyChipSymbol(code)}
              </button>
            );
          })}
        </div>
      )}
      <Numpad
        key={id}
        value={activeValue}
        onChange={(next) => onChange(id, settleCommit(activeValue, next, decimals))}
        onConfirm={onDone}
      />
    </div>
  );
}
