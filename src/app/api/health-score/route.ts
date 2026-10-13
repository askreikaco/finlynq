import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { requireAuth } from "@/lib/auth/require-auth";
import { calculateFinancialHealth } from "@/lib/financial-health";
import { getDisplayCurrency } from "@/lib/fx-service";

/**
 * Financial health score for the dashboard's Financial Health card.
 *
 * Thin wrapper around the canonical calculator at `src/lib/financial-health.ts`
 * (FINLYNQ-94, 2026-05-23). The MCP HTTP `get_financial_health_score` tool
 * uses the same calculator — see register-tools-pg.ts.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId, dek } = auth.context;

  const url = new URL(request.url);
  const reportingCurrency = await getDisplayCurrency(userId, url.searchParams.get("currency"));

  // ?history=N adds the month-by-month series (N previous month ends + the current month) for the dashboard cards.
  const historyParam = Number(url.searchParams.get("history"));
  const historyMonths = Number.isFinite(historyParam) ? Math.min(12, Math.max(0, Math.floor(historyParam))) : 0;

  const payload = await calculateFinancialHealth({
    db,
    userId,
    dek: dek ?? null,
    reportingCurrency,
    historyMonths,
  });

  return NextResponse.json(payload);
}
