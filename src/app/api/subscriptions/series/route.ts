import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { getRateMap, convertWithRateMap, getDisplayCurrency } from "@/lib/fx-service";
import { withPrivateSwr } from "@/lib/http/private-swr";
import { monthsBetween } from "@/lib/metrics/period";
import { todayISO } from "@/lib/utils/date";
import { frequencyOrMonthly } from "@/lib/subscriptions/schedule";
import { buildSubscriptionSeries } from "@/lib/subscriptions/history";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MONTHS = 36;

/**
 * GET /api/subscriptions/series?from=YYYY-MM&to=YYYY-MM&currency=XXX
 * Month-by-month history of the Subscriptions cards, in the display currency:
 *   { displayCurrency, series: [{ month, monthly, annual, active, dueSoon, dueSoonCount }] | null }
 * See lib/subscriptions/history.ts for how "running in month M" is derived (booked transactions, end date, status now).
 * Names are never read, so no DEK is needed. null = no subscriptions at all.
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
  if (monthsBetween(`${from}-01`, `${to}-01`).length > MAX_MONTHS) {
    return NextResponse.json({ error: `At most ${MAX_MONTHS} months` }, { status: 400 });
  }
  const displayCurrency = await getDisplayCurrency(userId, sp.get("currency"));

  const rows = await db
    .select({
      id: schema.subscriptions.id,
      status: schema.subscriptions.status,
      amount: schema.subscriptions.amount,
      currency: schema.subscriptions.currency,
      frequency: schema.subscriptions.frequency,
      intervalDays: schema.subscriptions.intervalDays,
      nextDate: schema.subscriptions.nextDate,
      anchorDate: schema.subscriptions.anchorDate,
      endDate: schema.subscriptions.endDate,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .all();
  if (rows.length === 0) return withPrivateSwr(NextResponse.json({ displayCurrency, series: null, reason: "no-subscriptions" }));

  const booked = await db
    .select({
      id: schema.transactions.subscriptionId,
      first: sql<string>`min(${schema.transactions.date})`,
      last: sql<string>`max(${schema.transactions.date})`,
    })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.userId, userId), sql`${schema.transactions.subscriptionId} IS NOT NULL`))
    .groupBy(schema.transactions.subscriptionId)
    .all();
  const firstTx = new Map<number, string>();
  const lastTx = new Map<number, string>();
  for (const b of booked) {
    if (b.id == null) continue;
    firstTx.set(b.id, b.first);
    lastTx.set(b.id, b.last);
  }

  const rateMap = await getRateMap(displayCurrency, userId);
  const subs = rows.map((r) => ({
    id: r.id,
    status: r.status,
    displayAmount: convertWithRateMap(r.amount, r.currency ?? displayCurrency, rateMap),
    frequency: frequencyOrMonthly(r.frequency),
    intervalDays: r.intervalDays,
    nextDate: r.nextDate,
    anchorDate: r.anchorDate,
    endDate: r.endDate,
  }));
  const series = buildSubscriptionSeries({ subs, firstTx, lastTx, from, to, today: todayISO() });
  return withPrivateSwr(NextResponse.json({ displayCurrency, series }));
}
