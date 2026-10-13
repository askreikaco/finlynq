import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { getMonthlyAccountDeltas } from "@/lib/queries";
import { getRateMap, convertWithRateMap, getDisplayCurrency } from "@/lib/fx-service";
import { monthsBetween } from "@/lib/metrics/period";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MONTHS = 36;

/**
 * GET /api/goals/series?from=YYYY-MM&to=YYYY-MM&currency=XXX
 * Month-end saved total of the accounts linked to the user's ACTIVE goals, in the display currency:
 *   { series: [{ month, current }] | null, reason? }
 * The schema keeps no goal contribution history: a goal's saved amount IS its linked accounts' balance, so the
 * history is those accounts' cumulative cash balance. Investment (market value) and liability (debt payoff) links
 * have no month-end history here, so any such goal makes the series null rather than a partial/fake total.
 * Targets and the completed count have no history at all and are not served.
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

  const active = await db
    .select({ id: schema.goals.id, type: schema.goals.type })
    .from(schema.goals)
    .where(and(eq(schema.goals.userId, userId), eq(schema.goals.status, "active")));
  if (active.length === 0) return NextResponse.json({ displayCurrency, series: null, reason: "no-active-goals" });
  if (active.some((g) => g.type === "debt_payoff")) {
    return NextResponse.json({ displayCurrency, series: null, reason: "debt-payoff-goal" });
  }
  const links = await db
    .select({ accountId: schema.goalAccounts.accountId })
    .from(schema.goalAccounts)
    .where(and(eq(schema.goalAccounts.userId, userId), inArray(schema.goalAccounts.goalId, active.map((g) => g.id))));
  // The same account linked to two goals counts once per goal in the page total; keep that multiplicity.
  const accountIds = Array.from(new Set(links.map((l) => l.accountId)));
  if (accountIds.length === 0) return NextResponse.json({ displayCurrency, series: null, reason: "no-linked-accounts" });

  const accounts = await db
    .select({ id: schema.accounts.id, currency: schema.accounts.currency, isInvestment: schema.accounts.isInvestment, type: schema.accounts.type })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), inArray(schema.accounts.id, accountIds)));
  if (accounts.some((a) => a.isInvestment)) return NextResponse.json({ displayCurrency, series: null, reason: "investment-account" });
  if (accounts.some((a) => a.type === "L")) return NextResponse.json({ displayCurrency, series: null, reason: "liability-account" });

  const rateMap = await getRateMap(displayCurrency, userId);
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const multiplicity = new Map<number, number>();
  for (const l of links) multiplicity.set(l.accountId, (multiplicity.get(l.accountId) ?? 0) + 1);

  const deltas = await getMonthlyAccountDeltas(userId, accountIds);
  const series = months.map((month) => {
    let total = 0;
    for (const d of deltas) {
      if (d.accountId == null || d.month > month) continue;
      const cur = currencyOf.get(d.accountId);
      if (!cur) continue;
      total += convertWithRateMap(Number(d.total), cur, rateMap) * (multiplicity.get(d.accountId) ?? 1);
    }
    return { month, current: Math.round(total * 100) / 100 };
  });
  return NextResponse.json({ displayCurrency, series });
}
