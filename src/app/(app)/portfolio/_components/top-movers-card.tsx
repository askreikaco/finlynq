"use client";

import { Flame, Snowflake } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const Icon = kind === "gainers" ? Flame : Snowflake;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${kind === "gainers" ? "text-pos" : "text-destructive"}`} />
          <CardTitle className="text-sm font-medium">{kind === "gainers" ? "Top Gainers" : "Top Losers"}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {children ?? (
          <div className="space-y-2">
            {movers.map(m => (
              <div key={m.key} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  {m.image && <img src={m.image} alt="" className="h-5 w-5 rounded-full" />}
                  <span className="text-sm font-medium">{m.symbol ?? m.name}</span>
                  {m.name !== (m.symbol ?? m.name) && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">{m.name}</span>
                  )}
                </div>
                <DayChange pct={m.changePct} amount={m.dayChangeDisplay} currency={currency} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
