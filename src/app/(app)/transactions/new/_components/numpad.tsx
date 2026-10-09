"use client";

import React, { useEffect, useRef } from "react";
import { Delete } from "lucide-react";
import { evaluateAmountExpression } from "@/lib/transactions/amount-expression";

// Total rendered height: 4 rows of 44px keys, 3 gaps of 6px (gap-1.5), pt-1.5 + pb-2, 1px top border.
// The page reserves this much bottom padding in the field region while the numpad is open.
export const NUMPAD_HEIGHT_PX = 209;

const LONG_PRESS_MS = 500;
const MAX_INPUT_LENGTH = 32;
const OPERATORS = ["+", "-", "*", "/"];

interface NumpadProps {
  value: string;
  onChange: (val: string) => void;
  onConfirm: () => void;
}

/** True when the expression has a binary operator (a "-" at the start is a sign, not an operator). */
export function hasBinaryOperator(expr: string): boolean {
  return /\d\.?\s*[+\-*/]/.test(expr);
}

export function Numpad({ value, onChange, onConfirm }: NumpadProps) {
  // Latest props for document listeners and the unmount cleanup (synced after each commit).
  const latest = useRef({ value, onChange, onConfirm });
  useEffect(() => {
    latest.current = { value, onChange, onConfirm };
  });

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  // Evaluate a pending expression. A malformed expression is left as typed.
  const commitExpression = () => {
    const { value: current, onChange: setValue } = latest.current;
    if (!hasBinaryOperator(current)) return;
    const result = evaluateAmountExpression(current);
    if (result !== null) setValue(result);
  };

  // Escape closes the keypad, committing any pending expression first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        commitExpression();
        latest.current.onConfirm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Closing by any other route (tapping another field) must not leave "100+50" for the page to
  // parseFloat as 100. Commit the pending expression on unmount.
  useEffect(() => {
    return () => {
      commitExpression();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const pressDigit = (key: string) => {
    if (value.length + key.length > MAX_INPUT_LENGTH) return;
    if (key === ".") {
      const segment = value.split(/[+\-*/]/).pop() ?? "";
      if (segment.includes(".")) return;
    }
    onChange(value + key);
  };

  const pressOperator = (op: "+" | "-") => {
    if (value === "") {
      if (op === "-") onChange("-");
      return;
    }
    const last = value[value.length - 1];
    if (OPERATORS.includes(last)) {
      const base = value.slice(0, -1);
      if (base === "") return;
      onChange(base + op);
      return;
    }
    if (value.length + 1 > MAX_INPUT_LENGTH) return;
    onChange(value + op);
  };

  const pressDelete = () => {
    if (value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  const pressDone = () => {
    if (hasBinaryOperator(value)) {
      commitExpression();
      return;
    }
    onConfirm();
  };

  const startLongPress = () => {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      onChange("");
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const handleDeleteClick = () => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    pressDelete();
  };

  const digitClass =
    "flex h-11 items-center justify-center rounded-xl bg-muted text-xl font-medium text-foreground transition-colors active:bg-muted/70";
  const opClass =
    "flex h-11 items-center justify-center rounded-xl bg-primary/15 text-xl font-medium text-primary transition-colors active:bg-primary/25";
  const doneClass =
    "flex h-11 items-center justify-center rounded-xl bg-primary text-xl font-semibold text-primary-foreground transition-colors active:bg-primary/90";

  const doneShowsEquals = hasBinaryOperator(value);

  return (
    <div
      role="group"
      aria-label="Amount keypad"
      className="grid w-full grid-cols-4 gap-1.5 border-t border-border bg-background pb-2 pl-2 pr-2 pt-1.5"
    >
      <button type="button" className={digitClass} onClick={() => pressDigit("7")}>7</button>
      <button type="button" className={digitClass} onClick={() => pressDigit("8")}>8</button>
      <button type="button" className={digitClass} onClick={() => pressDigit("9")}>9</button>
      <button
        type="button"
        aria-label="Delete last digit"
        className={digitClass}
        onClick={handleDeleteClick}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Delete className="h-6 w-6" aria-hidden="true" />
      </button>

      <button type="button" className={digitClass} onClick={() => pressDigit("4")}>4</button>
      <button type="button" className={digitClass} onClick={() => pressDigit("5")}>5</button>
      <button type="button" className={digitClass} onClick={() => pressDigit("6")}>6</button>
      <button type="button" aria-label="Plus" className={opClass} onClick={() => pressOperator("+")}>+</button>

      <button type="button" className={digitClass} onClick={() => pressDigit("1")}>1</button>
      <button type="button" className={digitClass} onClick={() => pressDigit("2")}>2</button>
      <button type="button" className={digitClass} onClick={() => pressDigit("3")}>3</button>
      <button type="button" aria-label="Minus" className={opClass} onClick={() => pressOperator("-")}>−</button>

      <button type="button" aria-label="Three zeros" className={digitClass} onClick={() => pressDigit("000")}>000</button>
      <button type="button" className={digitClass} onClick={() => pressDigit("0")}>0</button>
      <button type="button" aria-label="Decimal point" className={digitClass} onClick={() => pressDigit(".")}>.</button>
      <button type="button" aria-label="Done" className={doneClass} onClick={pressDone}>
        {doneShowsEquals ? "=" : "Done"}
      </button>
    </div>
  );
}
