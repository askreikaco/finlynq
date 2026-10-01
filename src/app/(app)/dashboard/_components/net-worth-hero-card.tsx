"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";
import { formatCurrency } from "@/lib/currency";
import { formatPercent } from "@/lib/locale";
import { AnimatedNumber } from "./animated-number";

export interface NetWorthHeroCardProps {
  value: number;
  currency: string;
  /** Change over the comparison window; null hides the pill (no history). */
  change: number | null;
  changePct: number;
  /** Text after the change amount, e.g. "vs last month". */
  changeCaption: string;
  sparkData: number[];
  sparkLabels?: string[];
  /** Drill-through target; omitted = static card. */
  href?: string;
  onMouseMove?: React.MouseEventHandler<HTMLDivElement>;
  /** Optional line under the number (shown instead of the pill when there is no change). */
  footnote?: string;
}

/**
 * The dashboard's "Total Net Worth" hero card (extracted from dashboard/page.tsx so the Family
 * overview renders the identical card). Markup and classes are unchanged.
 */
export function NetWorthHeroCard({
  value,
  currency,
  change,
  changePct,
  changeCaption,
  sparkData,
  sparkLabels,
  href,
  onMouseMove,
  footnote,
}: NetWorthHeroCardProps) {
  const card = (
    <Card
      className={`relative overflow-hidden group card-hover mouse-glow hover:scale-[1.005] transition-transform duration-300 rounded-2xl h-full${href ? " cursor-pointer" : ""}`}
      onMouseMove={onMouseMove}
    >
      {/* Decorative gradient orbs */}
      <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-indigo-500/8 blur-3xl dark:bg-indigo-400/5 pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-40 h-40 rounded-full bg-violet-500/6 blur-3xl dark:bg-violet-400/4 pointer-events-none" />

      <CardContent className="relative pt-6 pb-6 px-6">
        <div className="flex items-start justify-between">
          <div className="space-y-3 min-w-0">
            {/* Label */}
            <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
              Total Net Worth
            </p>

            {/* Big number */}
            <p className="text-4xl md:text-5xl font-bold tracking-tight hero-number leading-none break-words">
              <AnimatedNumber value={value} currency={currency} />
            </p>

            {/* Change pill */}
            {change != null && (
              <div className="flex flex-wrap items-center gap-2.5 mt-1">
                {change >= 0 ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600 bg-emerald-100/80 dark:bg-emerald-950/60 dark:text-emerald-400 px-2.5 py-0.5 rounded-full">
                    <ArrowUpRight className="h-3 w-3" />
                    +{formatPercent(changePct, 1)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-600 bg-rose-100/80 dark:bg-rose-950/60 dark:text-rose-400 px-2.5 py-0.5 rounded-full">
                    <ArrowDownRight className="h-3 w-3" />
                    {formatPercent(changePct, 1)}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground">
                  {change >= 0 ? "+" : ""}{formatCurrency(change, currency)} {changeCaption}
                </span>
              </div>
            )}
            {footnote && <p className="text-[11px] text-muted-foreground">{footnote}</p>}
          </div>

          {/* Mini sparkline */}
          {sparkData.length > 1 && (
            <div className="hidden md:block w-40 h-20 opacity-50 group-hover:opacity-100 transition-opacity duration-300">
              <Sparkline data={sparkData} color="#6366f1" labels={sparkLabels} currency={currency} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}
