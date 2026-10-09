/**
 * SQL for the local store. Each function mirrors one server query in
 * src/lib/queries.ts (quoted per function). Semantics only: no server imports.
 * Parameters are $1.. and are passed by the caller.
 */

/** Mirrors getAccountBalances (queries.ts:852-853, 865, 869-870): SUM(amount) per account, archived/invisible filters per opts. */
export function accountBalancesSql(includeArchived: boolean, includeInvisible: boolean): string {
  // queries.ts:852  if (!opts?.includeArchived) conditions.push(eq(accounts.archived, false));
  // queries.ts:853  if (!opts?.includeInvisible) conditions.push(eq(accounts.invisible, false));
  const conds: string[] = [];
  if (!includeArchived) conds.push("a.archived = false");
  if (!includeInvisible) conds.push("a.invisible = false");
  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  // queries.ts:865 balance: COALESCE(SUM(amount), 0); :868 leftJoin(transactions)
  return `
    SELECT a.id AS "accountId", a.type AS "accountType", a."group" AS "accountGroup",
           a.currency AS currency, a.archived AS archived, a.is_investment AS "isInvestment",
           a.invisible AS invisible, COALESCE(SUM(t.amount), 0) AS balance
    FROM accounts a
    LEFT JOIN transactions t ON a.id = t.account_id
    ${where}
    GROUP BY a.id, a.type, a."group", a.currency, a.archived, a.is_investment, a.invisible
    ORDER BY a.type, a."group"`;
}

/** Mirrors getSpendingByCategory (queries.ts:922-933): date gte/lte window, categories.type = 'E'. */
export const SPENDING_BY_CATEGORY_SQL = `
  SELECT c.id AS "categoryId", c."group" AS "categoryGroup", c.type AS "categoryType",
         SUM(t.amount) AS total
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.date >= $1 AND t.date <= $2 AND c.type = 'E'
  GROUP BY c.id, c."group", c.type
  ORDER BY SUM(t.amount)`;

/** Mirrors getIncomeVsExpenses (queries.ts:974-991): month bucket to_char(date::date,'YYYY-MM') (queries.ts:13-17), type IN ('E','I'). */
export const INCOME_VS_EXPENSES_SQL = `
  SELECT to_char(t.date::date, 'YYYY-MM') AS month, c.type AS type, t.currency AS currency,
         SUM(t.amount) AS total
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.date >= $1 AND t.date <= $2 AND c.type IN ('E', 'I')
  GROUP BY to_char(t.date::date, 'YYYY-MM'), c.type, t.currency
  ORDER BY to_char(t.date::date, 'YYYY-MM')`;

/**
 * Mirrors getNetWorthOverTime (queries.ts:1097-1107): per month and accounts.currency.
 * queries.ts:1105 COALESCE(accounts.invisible, false) = false keeps account-less rows (NULL join).
 */
export const NET_WORTH_BY_MONTH_SQL = `
  SELECT to_char(t.date::date, 'YYYY-MM') AS month, a.currency AS currency,
         SUM(t.amount) AS cumulative
  FROM transactions t
  LEFT JOIN accounts a ON t.account_id = a.id
  WHERE COALESCE(a.invisible, false) = false
  GROUP BY to_char(t.date::date, 'YYYY-MM'), a.currency
  ORDER BY to_char(t.date::date, 'YYYY-MM')`;
