import { SectionCard } from "./section-card";
import { SectionLabel } from "./section-label";
import { Amount } from "./amount";
import { StatTile } from "./stat-tile";

/**
 * Net worth hero: total + Assets / Liabilities tiles. `totalLiabilities` is the signed
 * (normally negative) sum, so net worth = assets + liabilities (same as the dashboard hero).
 */
export function NetWorthHero({
  totalAssets,
  totalLiabilities,
  currency,
}: {
  totalAssets: number;
  totalLiabilities: number;
  currency: string;
}) {
  const netWorth = totalAssets + totalLiabilities;
  return (
    <SectionCard data-slot="net-worth-hero" className="space-y-4">
      <div>
        <SectionLabel>Net worth</SectionLabel>
        <Amount value={netWorth} currency={currency} size="hero" tone="none" className="mt-1 block" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Assets" value={<Amount value={totalAssets} currency={currency} size="lg" tone="pos" />} />
        <StatTile label="Liabilities" value={<Amount value={totalLiabilities} currency={currency} size="lg" tone={totalLiabilities < 0 ? "neg" : "muted"} />} />
      </div>
    </SectionCard>
  );
}
