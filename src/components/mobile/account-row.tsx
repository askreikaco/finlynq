import { Landmark, TrendingUp, CreditCard, Wallet, type LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { InvisibleMark } from "@/components/invisible-mark";
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
 * they differ). The row links to /accounts/[id] (no chevron: a column of arrows was noise), or, in the
 * split view, `onPress` selects it into the detail pane. Liability balances read red.
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
  invisible,
  selected,
  onPress,
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
  /** Hidden from net worth and totals: shows the invisible mark. */
  invisible?: boolean;
  /** Split view: this account is open in the detail pane. */
  selected?: boolean;
  /** Split view: select into the pane instead of navigating. */
  onPress?: () => void;
}) {
  const subtitle = [alias, currency.toUpperCase(), archived ? "Archived" : null].filter(Boolean).join(" · ");
  const differs = convertedBalance != null && currency.toUpperCase() !== displayCurrency.toUpperCase();
  return (
    <ListRow
      {...(onPress ? { onPress } : { href: `/accounts/${accountId}` })}
      selected={selected}
      badge={invisible ? <InvisibleMark /> : undefined}
      icon={iconFor(type, group, isInvestment)}
      title={accountName}
      subtitle={subtitle}
      value={<Amount value={balance} currency={currency} tone={type === "liability" || balance < 0 ? "neg" : "pos"} />}
      secondary={differs ? formatCurrency(convertedBalance as number, displayCurrency) : undefined}
      dimmed={archived}
      chevron={false}
    />
  );
}
