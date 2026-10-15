"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Mover } from "../_types";
import { DayChange } from "./portfolio-ui";

/**
 * The /portfolio "Top Gainers" / "Top Losers" card (extracted from portfolio/page.tsx so the
 * Family overview renders the identical card). `children` replaces the list (empty / not-shared
 * states on the Family overview).
 */
export function TopMoversCard({
  kind,
  movers,
  currency,
  children,
}: {
  kind: "gainers" | "losers";
  movers: Mover[];
  currency: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      title={kind === "gainers" ? "Top Gainers" : "Top Losers"}
      icon={kind === "gainers" ? TrendingUp : TrendingDown}
      tone={kind === "gainers" ? "emerald" : "rose"}
    >
      {children ?? (
        <div className="space-y-2">
          {movers.map(m => (
            <div key={m.key} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                {m.image && <img src={m.image} alt="" className="h-5 w-5 rounded-full" />}
                <span className="text-sm font-medium">{m.symbol ?? m.name}</span>
                {m.name !== (m.symbol ?? m.name) && (
                  <span className="text-xs text-muted-foreground max-regular:hidden">{m.name}</span>
                )}
              </div>
              <DayChange pct={m.changePct} amount={m.dayChangeDisplay} currency={currency} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
