"use client";

import React from "react";
import { Delete } from "lucide-react";

interface NumpadProps {
  value: string;
  onChange: (val: string) => void;
  onConfirm: () => void;
}

export function Numpad({ value, onChange, onConfirm }: NumpadProps) {
  const evaluateMath = (expr: string): string => {
    if (!expr || !/^[\d\s+\-*/.]+$/.test(expr)) return expr;
    try {
      // Safe arithmetic evaluator
      const res = Function(`"use strict"; return (${expr})`)();
      if (typeof res === "number" && !isNaN(res) && isFinite(res)) {
        return (Math.round(res * 100) / 100).toString();
      }
    } catch {
      // Keep expression as is on malformed math
    }
    return expr;
  };

  const handlePress = (key: string) => {
    if (key === "=") {
      onChange(evaluateMath(value));
      return;
    }

    if (key === "OK") {
      onChange(evaluateMath(value));
      onConfirm();
      return;
    }

    if (key === "DEL") {
      onChange(value.slice(0, -1));
      return;
    }

    if (key === "C") {
      onChange("");
      return;
    }

    // Prevent duplicate operators
    if (["+", "-", "*", "/"].includes(key)) {
      if (!value) return;
      const lastChar = value[value.length - 1];
      if (["+", "-", "*", "/"].includes(lastChar)) {
        onChange(value.slice(0, -1) + key);
        return;
      }
    }

    // Prevent multiple decimals in the current number segment
    if (key === ".") {
      const parts = value.split(/[+\-*/]/);
      const currentSegment = parts[parts.length - 1];
      if (currentSegment.includes(".")) return;
    }

    onChange(value + key);
  };

  const btnClass =
    "flex items-center justify-center text-2xl font-medium bg-zinc-800/80 text-white rounded-xl active:bg-zinc-700 transition-colors h-14";
  const opClass =
    "flex items-center justify-center text-2xl font-medium bg-indigo-500/20 text-indigo-400 rounded-xl active:bg-indigo-500/40 transition-colors h-14";

  return (
    <div className="w-full bg-zinc-950 p-2 pb-8 grid grid-cols-4 gap-2 border-t border-zinc-800">
      <button type="button" onClick={() => handlePress("C")} className={btnClass}>C</button>
      <button type="button" onClick={() => handlePress("/")} className={opClass}>/</button>
      <button type="button" onClick={() => handlePress("*")} className={opClass}>*</button>
      <button type="button" onClick={() => handlePress("DEL")} className={btnClass}>
        <Delete className="w-6 h-6" />
      </button>

      <button type="button" onClick={() => handlePress("7")} className={btnClass}>7</button>
      <button type="button" onClick={() => handlePress("8")} className={btnClass}>8</button>
      <button type="button" onClick={() => handlePress("9")} className={btnClass}>9</button>
      <button type="button" onClick={() => handlePress("-")} className={opClass}>-</button>

      <button type="button" onClick={() => handlePress("4")} className={btnClass}>4</button>
      <button type="button" onClick={() => handlePress("5")} className={btnClass}>5</button>
      <button type="button" onClick={() => handlePress("6")} className={btnClass}>6</button>
      <button type="button" onClick={() => handlePress("+")} className={opClass}>+</button>

      <button type="button" onClick={() => handlePress("1")} className={btnClass}>1</button>
      <button type="button" onClick={() => handlePress("2")} className={btnClass}>2</button>
      <button type="button" onClick={() => handlePress("3")} className={btnClass}>3</button>
      <button type="button" onClick={() => handlePress("=")} className={opClass}>=</button>

      <button type="button" onClick={() => handlePress("0")} className={btnClass}>0</button>
      <button type="button" onClick={() => handlePress("00")} className={btnClass}>00</button>
      <button type="button" onClick={() => handlePress("000")} className={btnClass}>000</button>
      <button type="button" onClick={() => handlePress(".")} className={btnClass}>.</button>
      
      <button
        type="button"
        onClick={() => handlePress("OK")}
        className="col-span-4 bg-indigo-600 text-white font-semibold rounded-xl h-14 text-xl active:bg-indigo-700 transition-colors mt-2"
      >
        OK
      </button>
    </div>
  );
}
