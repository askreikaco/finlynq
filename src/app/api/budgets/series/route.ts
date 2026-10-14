import { NextRequest, NextResponse } from "next/server";
import { withPrivateSwr } from "@/lib/http/private-swr";
import { getBudgets, getSpendingByCategoryAndCurrency } from "@/lib/queries";
import { requireAuth } from "@/lib/auth/require-auth";
import { getRateMap, convertWithRateMap, getDisplayCurrency } from "@/lib/fx-service";
import { monthsBetween } from "@/lib/metrics/period";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MONTHS = 36;

/**
 * GET /api/budgets/series?from=YYYY-MM&to=YYYY-MM&currency=XXX
 * Monthly totals for the /budgets summary cards, in the display currency:
 *   [{ month, budget, spent }]  (spent = spending in the categories that month budgeted, like the page's total).
 * Numbers only (no names, no DEK). Months with no budget rows are omitted: there is no history to show for them.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request); if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!MONTH.test(from) || !MONTH.test(to) || from > to) {
    return NextResponse.json({ error: "from and to must be YYYY-MM with from <= to" }, { status: 400 });
  }
  const months = monthsBetween(`${from}-01`, `${to}-01`);
  if (months.length > MAX_MONTHS) {
    return NextResponse.json({ error: `At most ${MAX_MONTHS} months` }, { status: 400 });
  }

  const displayCurrency = await getDisplayCurrency(userId, sp.get("currency"));
  const rateMap = await getRateMap(displayCurrency, userId);
  const all = await getBudgets(userId);
  const inWindow = all.filter((b: { month: string }) => b.month >= from && b.month <= to);

  const points = await Promise.all(
    months.map(async (month) => {
      const rows = inWindow.filter((b: { month: string }) => b.month === month);
      if (rows.length === 0) return null;
      const [y, m] = month.split("-").map(Number);
      const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const spending = await getSpendingByCategoryAndCurrency(userId, `${month}-01`, endDate);
      const budgeted = new Set(rows.map((b: { categoryId: number }) => b.categoryId));
      let spent = 0;
      for (const s of spending) {
        if (s.categoryId != null && budgeted.has(s.categoryId)) spent += Math.abs(convertWithRateMap(Number(s.total), s.currency, rateMap));
      }
      const budget = rows.reduce(
        (sum: number, b: { amount: number; currency: string }) => sum + convertWithRateMap(b.amount, b.currency, rateMap),
        0,
      );
      return { month, budget: Math.round(budget * 100) / 100, spent: Math.round(spent * 100) / 100 };
    }),
  );

  return withPrivateSwr(NextResponse.json({ displayCurrency, series: points.filter((p): p is NonNullable<typeof p> => p !== null) }));
}
