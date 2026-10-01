import { formatPercent } from "@/lib/locale";
import { ListRow } from "./list-row";
import { Amount } from "./amount";

/**
 * Portfolio holding as a native row: Name | Market value + Unrealized % (text-pos / text-neg).
 * Everything else (qty, avg cost, price, cost basis, realized, accounts) lives in the
 * DetailSheet opened by `onPress`. `unrealizedPct` null (cash, no cost basis) → no % line.
 */
export function HoldingRow({
  name,
  marketValue,
  unrealizedPct,
  currency,
  onPress,
}: {
  name: string;
  marketValue: number;
  unrealizedPct: number | null;
  currency: string;
  onPress: () => void;
}) {
  const hasPct = unrealizedPct != null && Number.isFinite(unrealizedPct);
  return (
    <ListRow
      initials={name.slice(0, 2).toUpperCase()}
      title={name}
      value={<Amount value={marketValue} currency={currency} tone="none" />}
      secondary={hasPct ? `${unrealizedPct >= 0 ? "+" : ""}${formatPercent(unrealizedPct, 2)}` : undefined}
      secondaryTone={hasPct ? (unrealizedPct >= 0 ? "pos" : "neg") : "muted"}
      onPress={onPress}
      aria-label={name}
    />
  );
}
