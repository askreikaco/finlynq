import { db, schema } from "@/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { apiHandler } from "@/lib/api-handler";
import { AppError } from "@/lib/validate";
import { decryptName, decryptTxRows } from "@/lib/crypto/encrypted-columns";
import { getDisplayCurrency, getRateMap, convertWithRateMap } from "@/lib/fx-service";
import { convertReportingSlice, selfHealReportingAmounts } from "@/lib/fx/reporting-amount";
import { todayISO } from "@/lib/utils/date";
import {
  buildCategoryDetail,
  categoryWindow,
  rangeWindow,
  CATEGORY_WINDOWS,
  type CategoryTxRow,
  type CategoryType,
} from "@/lib/reports/category-detail";

/**
 * GET /api/reports/category?categoryId=&months=6|12|24[&currency=]
 *   or ?categoryId=&from=YYYY-MM-DD&to=YYYY-MM-DD[&currency=]  (from/to wins over months)
 *   or ?group=<name>&type=E|I instead of categoryId: a GROUP (parent) of categories. Same payload, aggregated over
 *   every category of that group and type (budgets summed), plus `children` (each member's amount in the period).
 *
 * One category's detail for the `/categories/[id]` page: monthly series with
 * budget, average / median / comparisons, share of all spending (or income),
 * top payees and recent transactions. Math lives in the pure
 * lib/reports/category-detail.ts.
 *
 * Money follows the Reports rules (FINLYNQ-123): each row uses its STORED
 * historical `reporting_amount` when it's in the display currency, else a
 * current-rate conversion of `amount`. Budgets convert at the current rate.
 * The DEK comes from the auth context (GH #343) — it decrypts the category
 * name, payees and account names; without one, payees can't be grouped and
 * `payeesLocked` is set.
 */
function isRealDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const GET = apiHandler({ auth: "auth" }, async ({ request, userId, dek }) => {
  const params = request.nextUrl.searchParams;
  const groupName = (params.get("group") ?? "").trim();
  const groupType = params.get("type") === "I" ? "I" : "E";
  const categoryId = Number(params.get("categoryId"));
  if (!groupName && (!Number.isInteger(categoryId) || categoryId <= 0)) throw new AppError("categoryId is required", 400);
  const from = params.get("from");
  const to = params.get("to");
  let range: { from: string; to: string } | undefined;
  if (from != null || to != null) {
    if (!from || !to || !isRealDay(from) || !isRealDay(to) || from > to) {
      throw new AppError("from and to must both be valid YYYY-MM-DD dates with from <= to", 400);
    }
    range = { from, to };
  }
  const requested = Number(params.get("months") ?? 12);
  const months = (CATEGORY_WINDOWS as readonly number[]).includes(requested) ? requested : 12;

  const catCols = {
    id: schema.categories.id,
    type: schema.categories.type,
    group: schema.categories.group,
    nameCt: schema.categories.nameCt,
  };
  // One category, or (group mode) every category of the group + type. `cat` = the first member.
  const members = await db
    .select(catCols)
    .from(schema.categories)
    .where(
      groupName
        ? and(eq(schema.categories.userId, userId), eq(schema.categories.group, groupName), eq(schema.categories.type, groupType))
        : and(eq(schema.categories.id, categoryId), eq(schema.categories.userId, userId)),
    )
    .all();
  const cat = members[0];
  if (!cat) throw new AppError(groupName ? "Group not found" : "Category not found", 404);
  const memberIds = members.map((m) => m.id);
  const type = (["E", "I", "R"].includes(cat.type) ? cat.type : "E") as CategoryType;

  const displayCurrency = (await getDisplayCurrency(userId, params.get("currency"))).toUpperCase();
  const rateMap = await getRateMap(displayCurrency, userId);
  void selfHealReportingAmounts(userId, displayCurrency);

  const today = todayISO();
  const win = range ? rangeWindow(today, range.from, range.to) : categoryWindow(today, months);
  const { windowStart, windowStartMonth, queryStart } = win;
  // Stats / share cover the selected period (days) or the whole months window.
  const typeStart = range ? range.from : windowStart;
  const typeEnd = range ? (range.to < today ? range.to : today) : today;

  const rawRows = await db
    .select({
      id: schema.transactions.id,
      categoryId: schema.transactions.categoryId,
      date: schema.transactions.date,
      payee: schema.transactions.payee,
      amount: schema.transactions.amount,
      currency: schema.transactions.currency,
      reportingAmount: schema.transactions.reportingAmount,
      reportingCurrency: schema.transactions.reportingCurrency,
      accountNameCt: schema.accounts.nameCt,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(and(
      eq(schema.transactions.userId, userId),
      inArray(schema.transactions.categoryId, memberIds),
      gte(schema.transactions.date, queryStart),
      lte(schema.transactions.date, typeEnd),
    ))
    .all();

  const decrypted = decryptTxRows(dek, rawRows);
  const rows: CategoryTxRow[] = decrypted.map((r) => ({
    id: r.id,
    date: r.date,
    // Without a DEK the payee is still ciphertext — never show or group it.
    payee: dek ? (r.payee ?? null) : null,
    amount: r.amount,
    currency: r.currency,
    reportingAmount: r.reportingAmount,
    reportingCurrency: r.reportingCurrency,
    accountName: decryptName(r.accountNameCt, dek, null),
  }));

  const toDisplay = (r: CategoryTxRow) =>
    convertReportingSlice(
      { currency: r.currency, reportingCurrency: r.reportingCurrency, totalAmount: r.amount, totalReporting: r.reportingAmount },
      displayCurrency,
      rateMap,
    );

  const budgetRows = await db
    .select({ month: schema.budgets.month, amount: schema.budgets.amount, currency: schema.budgets.currency })
    .from(schema.budgets)
    .where(and(
      eq(schema.budgets.userId, userId),
      inArray(schema.budgets.categoryId, memberIds),
      gte(schema.budgets.month, windowStartMonth),
    ))
    .all();
  const budgets = new Map<string, number>();
  for (const b of budgetRows) {
    budgets.set(b.month, (budgets.get(b.month) ?? 0) + convertWithRateMap(b.amount, b.currency ?? displayCurrency, rateMap));
  }

  // Denominator for "share of spending/income": every category of the same
  // type over the window, sliced by currency so each slice converts correctly.
  const typeSlices = await db
    .select({
      currency: schema.transactions.currency,
      reportingCurrency: schema.transactions.reportingCurrency,
      totalAmount: sql<number>`SUM(${schema.transactions.amount})`,
      totalReporting: sql<number | null>`SUM(${schema.transactions.reportingAmount})`,
    })
    .from(schema.transactions)
    .innerJoin(schema.categories, eq(schema.transactions.categoryId, schema.categories.id))
    .where(and(
      eq(schema.transactions.userId, userId),
      eq(schema.categories.type, cat.type),
      gte(schema.transactions.date, typeStart),
      lte(schema.transactions.date, typeEnd),
    ))
    .groupBy(schema.transactions.currency, schema.transactions.reportingCurrency)
    .all();
  const sign = type === "I" ? 1 : -1;
  const typeTotal = sign * typeSlices.reduce((s, row) => s + convertReportingSlice(row, displayCurrency, rateMap), 0);

  const detail = buildCategoryDetail({ type, rows, budgets, today, months, range, toDisplay, typeTotal });

  // Group mode: each member's amount over the same period as the stats (positively oriented), biggest first.
  const children = groupName
    ? members
        .map((m) => {
          const mine = decrypted.filter((r) => r.categoryId === m.id && r.date >= typeStart && r.date <= typeEnd);
          const amount = mine.reduce((sum, r) => sum + sign * convertReportingSlice(
            { currency: r.currency, reportingCurrency: r.reportingCurrency, totalAmount: r.amount, totalReporting: r.reportingAmount },
            displayCurrency,
            rateMap,
          ), 0);
          return { id: m.id, name: decryptName(m.nameCt, dek, null), amount: Math.round(amount * 100) / 100, count: mine.length };
        })
        .sort((a, b) => b.amount - a.amount)
    : undefined;

  return {
    category: groupName
      ? { id: 0, name: groupName, type, group: groupName, isGroup: true }
      : { id: cat.id, name: decryptName(cat.nameCt, dek, null), type, group: cat.group ?? "" },
    ...(children ? { children } : {}),
    windowMonths: months,
    ...(range ? { range: { from: range.from, to: range.to } } : {}),
    displayCurrency,
    payeesLocked: !dek,
    ...detail,
  };
});
