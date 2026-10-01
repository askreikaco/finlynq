"use client";

import { SectionCard } from "./section-card";
import { Amount } from "./amount";
import { StatTile } from "./stat-tile";

interface NetWorthHeroProps {
  totalAssets: number;
  totalLiabilities: number;
  currency: string;
}

export function NetWorthHero({
  totalAssets,
  totalLiabilities,
  currency,
}: NetWorthHeroProps) {
  const netWorth = totalAssets + totalLiabilities;

  return (
    <SectionCard>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase mb-2">
            Net Worth
          </p>
          <Amount
            value={netWorth}
            currency={currency}
            size="hero"
            className="text-[28px] font-extrabold tracking-tight"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Assets"
            value={
              <Amount
                value={totalAssets}
                currency={currency}
                size="md"
                className="text-emerald-600 dark:text-emerald-400"
              />
            }
          />
          <StatTile
            label="Liabilities"
            value={
              <Amount
                value={totalLiabilities}
                currency={currency}
                size="md"
                className={totalLiabilities >= 0 ? "text-muted-foreground" : "text-rose-600 dark:text-rose-400"}
              />
            }
          />
        </div>
      </div>
    </SectionCard>
  );
}
