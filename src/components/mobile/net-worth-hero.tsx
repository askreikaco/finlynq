import { SectionCard } from "./section-card";
import { SectionLabel } from "./section-label";
import { Amount } from "./amount";
import { MetricCard } from "@/components/metric-card";
import { Landmark, Wallet } from "lucide-react";

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
        <MetricCard label="Assets" icon={Wallet} tone="emerald" value={totalAssets} currency={currency} valueClassName="text-pos" />
        <MetricCard label="Liabilities" icon={Landmark} tone="rose" value={totalLiabilities} currency={currency} valueClassName={totalLiabilities < 0 ? "text-neg" : "text-muted-foreground"} />
      </div>
    </SectionCard>
  );
}
