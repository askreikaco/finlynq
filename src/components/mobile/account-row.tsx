"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ListRow } from "./list-row";
import { Amount } from "./amount";

interface AccountRowProps {
  accountId: number;
  accountName: string;
  currency: string;
  balance: number;
  convertedBalance?: number;
  displayCurrency: string;
  archived?: boolean;
  type: "asset" | "liability";
}

export function AccountRow({
  accountId,
  accountName,
  currency,
  balance,
  convertedBalance,
  displayCurrency,
  archived,
  type,
}: AccountRowProps) {
  // Show currency code only for non-VND, or always show the currency
  const showCurrency = currency.toUpperCase() !== "VND";
  const subtitle = showCurrency ? currency.toUpperCase() : "";

  // For liabilities, show "Owed" label if balance is negative or zero
  const isLiability = type === "liability" || balance < 0;
  const liabilityLabel = isLiability && balance >= 0 ? "Owed" : "";

  const icon = (
    <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-[8px] bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-xs font-bold">
      {(accountName ?? "?").charAt(0).toUpperCase()}
    </div>
  );

  return (
    <Link href={`/accounts/${accountId}`} className={archived ? "opacity-60" : ""}>
      <ListRow
        leading={icon}
        title={accountName}
        subtitle={subtitle || undefined}
        value={
          <div className="flex flex-col items-end gap-1">
            <Amount
              value={balance}
              currency={currency}
              size="md"
              className="font-mono font-semibold"
            />
            {convertedBalance != null &&
              currency.toUpperCase() !== displayCurrency.toUpperCase() && (
                <span className="font-mono text-xs text-muted-foreground">
                  {displayCurrency} {convertedBalance.toFixed(0)}
                </span>
              )}
          </div>
        }
      />
      {(archived || liabilityLabel) && (
        <div className="flex gap-2 px-4 pt-1">
          {archived && (
            <Badge variant="secondary" className="text-[10px]">
              Archived
            </Badge>
          )}
          {liabilityLabel && (
            <Badge variant="outline" className="text-[10px]">
              {liabilityLabel}
            </Badge>
          )}
        </div>
      )}
    </Link>
  );
}
