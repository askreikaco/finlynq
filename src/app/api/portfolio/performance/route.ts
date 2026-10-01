/**
 * Portfolio-performance endpoint — Phase 3 of plan/portfolio-lots-and-performance.md.
 *
 * GET /api/portfolio/performance?period=1m|3m|6m|ytd|1y|all&accountId=…
 *
 * Returns: daily value series + TWRR + MWRR for the period. Reads
 * `portfolio_snapshots` (built nightly by the cron) for the time
 * series; reads `transactions` for the MWRR cash flows.
 *
 * The chart on /portfolio consumes this. Stdio MCP cannot read names
 * but CAN read snapshot numbers; the new MCP tool
 * `get_portfolio_performance_v2` wraps this same logic.
 *
 * The computation lives in src/lib/portfolio/performance/compute.ts (shared
 * with the Family Wealth overview's Performance card).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { computePortfolioPerformance } from "@/lib/portfolio/performance/compute";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;

  const params = request.nextUrl.searchParams;
  const period = params.get("period") ?? "1y";
  const accountId = params.get("accountId")
    ? parseInt(params.get("accountId")!, 10)
    : null;

  const asOfDate = new Date().toISOString().slice(0, 10);
  const perf = await computePortfolioPerformance({ userId, period, accountId, asOfDate });

  return NextResponse.json({
    success: true,
    data: {
      period: perf.period,
      accountId: perf.accountId,
      from: perf.from,
      to: perf.to,
      currency: perf.currency,
      // Response shape unchanged: the per-point currency stays server-side.
      series: perf.series.map((p) => ({
        date: p.date,
        marketValue: p.marketValue,
        costBasis: p.costBasis,
        contribution: p.contribution,
        gapsFilled: p.gapsFilled,
      })),
      twrr: perf.twrr,
      mwrr: perf.mwrr,
      gapsFilledDays: perf.gapsFilledDays,
    },
  });
}
