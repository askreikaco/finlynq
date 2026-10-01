/**
 * Portfolio performance computation (value series + TWRR + MWRR) for one user.
 *
 * Extracted verbatim from GET /api/portfolio/performance so the /portfolio
 * Performance card and the Family Wealth overview (which runs it for a share
 * OWNER, DEK-free) share one implementation. Reads only plaintext numeric
 * columns: `portfolio_snapshots` for the series, `transactions` (via
 * computeNetContributions) for the MWRR cash flows. No names, no DEK.
 */

import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { computeTwrr, annualizeReturn } from "./twrr";
import { computeMwrr } from "./mwrr";
import { computeNetContributions } from "./contributions";

export const PERFORMANCE_PERIOD_DAYS: Record<string, number | null> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  ytd: -1, // sentinel: from Jan 1 of asOfDate's year
  "1y": 365,
  all: null,
};

export function performanceRangeStart(period: string, asOfDate: string): string {
  if (period === "ytd") return `${asOfDate.slice(0, 4)}-01-01`;
  // month-to-date (Family overview "This month"); not offered on /portfolio
  if (period === "mtd") return `${asOfDate.slice(0, 7)}-01`;
  const days = PERFORMANCE_PERIOD_DAYS[period];
  if (days == null) return "1900-01-01";
  const d = new Date(`${asOfDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export interface PerformancePoint {
  date: string;
  marketValue: number;
  costBasis: number;
  contribution: number;
  gapsFilled: boolean;
  /** currency of this snapshot row (the user's reporting currency when it was built) */
  currency: string;
}

export interface PortfolioPerformance {
  period: string;
  accountId: number | null;
  from: string;
  to: string;
  /** currency of the first row (legacy route contract); per-point currency is on each point */
  currency: string;
  series: PerformancePoint[];
  twrr: { period: number; annualized: number; hadContributions: boolean };
  mwrr: { irr: number; converged: boolean };
  gapsFilledDays: number;
}

export async function computePortfolioPerformance(input: {
  userId: string;
  period: string;
  accountId: number | null;
  asOfDate: string;
}): Promise<PortfolioPerformance> {
  const { userId, period, accountId, asOfDate } = input;
  const from = performanceRangeStart(period, asOfDate);

  const preds = [
    eq(schema.portfolioSnapshots.userId, userId),
    gte(schema.portfolioSnapshots.snapDate, from),
    lte(schema.portfolioSnapshots.snapDate, asOfDate),
  ];
  if (accountId != null) {
    preds.push(eq(schema.portfolioSnapshots.accountId, accountId));
  } else {
    // Aggregate-row only (account_id IS NULL).
    preds.push(isNull(schema.portfolioSnapshots.accountId));
  }

  const rows = await db
    .select({
      date: schema.portfolioSnapshots.snapDate,
      marketValue: schema.portfolioSnapshots.marketValue,
      costBasis: schema.portfolioSnapshots.costBasis,
      netContribution: schema.portfolioSnapshots.netContribution,
      currency: schema.portfolioSnapshots.currency,
      gapsFilled: schema.portfolioSnapshots.gapsFilled,
    })
    .from(schema.portfolioSnapshots)
    .where(and(...preds))
    .orderBy(schema.portfolioSnapshots.snapDate);

  const series: PerformancePoint[] = rows.map((r) => ({
    date: r.date,
    marketValue: Number(r.marketValue),
    costBasis: Number(r.costBasis),
    contribution: Number(r.netContribution),
    gapsFilled: r.gapsFilled,
    currency: r.currency,
  }));

  // ─── TWRR ───
  const twrr = computeTwrr(
    series.map((p) => ({
      date: p.date,
      marketValue: p.marketValue,
      contribution: p.contribution,
    })),
  );

  // ─── MWRR / XIRR ───
  let mwrr: { irr: number; converged: boolean } = { irr: 0, converged: false };
  if (series.length > 0) {
    const flows = await computeNetContributions({
      userId,
      accountId,
      fromDate: from,
      toDate: asOfDate,
    });
    // Initial value at the start of the period is treated as a contribution.
    const startMv = series[0]?.marketValue ?? 0;
    if (startMv > 0) {
      flows.unshift({ date: from, amount: -startMv });
    }
    const finalMv = series[series.length - 1]?.marketValue ?? 0;
    const result = computeMwrr(flows, finalMv, asOfDate);
    mwrr = { irr: result.irr, converged: result.converged };
  }

  const periodDays =
    series.length >= 2
      ? Math.max(
          1,
          Math.round(
            (Date.parse(series[series.length - 1].date) -
              Date.parse(series[0].date)) /
              86400000,
          ),
        )
      : 0;
  const twrrAnnualized = annualizeReturn(twrr.periodReturn, periodDays);

  return {
    period,
    accountId,
    from,
    to: asOfDate,
    currency: rows[0]?.currency ?? "USD",
    series,
    twrr: {
      period: twrr.periodReturn,
      annualized: twrrAnnualized,
      hadContributions: twrr.hadContributions,
    },
    mwrr,
    gapsFilledDays: series.filter((p) => p.gapsFilled).length,
  };
}
