"use client";

import { ListRow } from "./list-row";
import { Amount } from "./amount";
import { formatPercent } from "@/lib/locale";

interface HoldingRowProps {
  id: string;
  name: string;
  ticker?: string;
  marketValue: number;
  unrealizedPct: number;
  currency: string;
  onClick: () => void;
}

export function HoldingRow({
  id,
  name,
  ticker,
  marketValue,
  unrealizedPct,
  currency,
  onClick,
}: HoldingRowProps) {
  const isPositive = unrealizedPct >= 0;
  const subtitle = ticker || undefined;

  const icon = (
    <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[8px] bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-xs font-bold">
      {ticker ? ticker.substring(0, 2).toUpperCase() : "H"}
    </div>
  );

  return (
    <button
      key={id}
      onClick={onClick}
      className="w-full text-left"
      type="button"
    >
      <ListRow
        leading={icon}
        title={name}
        subtitle={subtitle}
        value={
          <div className="flex flex-col items-end gap-1">
            <Amount
              value={marketValue}
              currency={currency}
              size="md"
              className="font-mono font-semibold"
            />
            <span
              className={`font-mono text-xs font-medium ${
                isPositive ? "text-pos" : "text-neg"
              }`}
            >
              {isPositive ? "+" : ""}{formatPercent(unrealizedPct, 2)}
            </span>
          </div>
        }
      />
    </button>
  );
}
