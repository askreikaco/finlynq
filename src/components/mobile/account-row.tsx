import { Landmark, TrendingUp, CreditCard, Wallet, type LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { ListRow } from "./list-row";
import { Amount } from "./amount";

function iconFor(type: "asset" | "liability", group: string | undefined, isInvestment: boolean | undefined): LucideIcon {
  if (isInvestment) return TrendingUp;
  if (type === "liability") return CreditCard;
  return /cash|wallet/i.test(group ?? "") ? Wallet : Landmark;
}

/**
 * One account as a native list row: icon tile, name, subtitle (alias · currency · Archived),
 * balance in the account's own currency (+ the display-currency equivalent underneath when
 * they differ), chevron → /accounts/[id]. Liability balances read red like the desktop list.
 */
export function AccountRow({
  accountId,
  accountName,
  alias,
  currency,
  balance,
  convertedBalance,
  displayCurrency,
  archived,
  type,
  group,
  isInvestment,
}: {
  accountId: number;
  accountName: string;
  alias?: string | null;
  currency: string;
  balance: number;
  convertedBalance?: number | null;
  displayCurrency: string;
  archived?: boolean;
  type: "asset" | "liability";
  group?: string;
  isInvestment?: boolean;
}) {
  const subtitle = [alias, currency.toUpperCase(), archived ? "Archived" : null].filter(Boolean).join(" · ");
  const differs = convertedBalance != null && currency.toUpperCase() !== displayCurrency.toUpperCase();
  return (
    <ListRow
      href={`/accounts/${accountId}`}
      icon={iconFor(type, group, isInvestment)}
      title={accountName}
      subtitle={subtitle}
      value={<Amount value={balance} currency={currency} tone={type === "liability" || balance < 0 ? "neg" : "pos"} />}
      secondary={differs ? formatCurrency(convertedBalance as number, displayCurrency) : undefined}
      className={archived ? "opacity-60" : undefined}
    />
  );
}
