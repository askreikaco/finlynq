/**
 * Shared helpers for the P4 real-Postgres tests: real session JWTs + DEK cache entries, route
 * invocation, and a seeded owner world. Guards are never mocked.
 */
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { db } from "@/db";
import {
  accounts,
  budgets,
  categories,
  fxRates,
  goalAccounts,
  goals,
  loans,
  portfolioHoldings,
  portfolioSnapshots,
  transactions,
} from "@/db/schema-pg";
import { createSessionToken } from "@/lib/auth/jwt";
import { putDEK } from "@/lib/crypto/dek-cache";
import { generateDEK, encryptField } from "@/lib/crypto/envelope";
import { createTestUser } from "./family-fixtures";

export interface TU {
  id: string;
  email: string;
  dek: Buffer;
  token: string;
}

let seq = 0;
export const uniq = (p: string) => `${p}${Date.now().toString(36)}${seq++}@fam4.test`;

export const mails = (): Array<{ to: string; subject: string; html: string; text?: string }> => {
  const g = globalThis as unknown as { __famMails?: Array<never> };
  g.__famMails ??= [];
  return g.__famMails as never;
};

export async function mkUser(
  prefix: string,
  opts: { mfa?: boolean; sessionMfa?: boolean; locked?: boolean; name?: string; staleSeconds?: number } = {},
): Promise<TU> {
  const email = uniq(prefix);
  const id = await createTestUser(email);
  if (opts.name) await db.execute(sql`UPDATE users SET display_name = ${opts.name} WHERE id = ${id}`);
  if (opts.mfa) await db.execute(sql`UPDATE users SET mfa_enabled = 1 WHERE id = ${id}`);
  const dek = generateDEK();
  if (opts.staleSeconds) vi.useFakeTimers({ toFake: ["Date"], now: Date.now() - opts.staleSeconds * 1000 });
  const { token, jti } = await createSessionToken(id, opts.sessionMfa ?? opts.mfa ?? false);
  if (opts.staleSeconds) vi.useRealTimers();
  if (!opts.locked) putDEK(jti, Buffer.from(dek), 3_600_000, id);
  return { id, email, dek, token };
}

export function req(path: string, method: string, user: TU | null, body?: unknown, headers: Record<string, string> = {}) {
  const hd = new Headers({ "content-type": "application/json", origin: "http://localhost", ...headers });
  if (user) hd.set("cookie", `pf_session=${user.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: hd,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function call(handler: (r: NextRequest) => Promise<Response>, r: NextRequest) {
  const res = await handler(r);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status, json, text, headers: res.headers };
}

export function lastTokenTo(email: string): string {
  const m = [...mails()].reverse().find((x) => x.to === email);
  const t = m?.text?.match(/token=([0-9a-f]{64})/)?.[1];
  if (!t) throw new Error("no invite mail for " + email);
  return t;
}

export const today = () => new Date().toISOString().slice(0, 10);

/** FX rows for today so the engine resolves from cache (no network). rate = 1 unit in USD. */
export async function seedRates(rates: Record<string, number>) {
  for (const [currency, rateToUsd] of Object.entries(rates)) {
    await db
      .insert(fxRates)
      .values({ currency, date: today(), rateToUsd, source: "manual" })
      .onConflictDoUpdate({ target: [fxRates.currency, fxRates.date], set: { rateToUsd } });
  }
}

export const CANARY = {
  payee: "CANARY_PAYEE_9f3a",
  note: "CANARY_NOTE_7c21",
  alias: "CANARY_ALIAS_55de",
  goal: "Canary Goal Alpha",
  loan: "Canary Loan Beta",
  category: "Canary Category Gamma",
  holding: "Canary Holding Delta",
  account: "Canary Account Epsilon",
};

export interface World {
  ids: { checking: number; vnd: number; visa: number; brokerage?: number; goal: number; loan: number; budgetCat: number; incomeCat: number };
}

/** Owner world: cash accounts (USD + VND), a liability, goal, loan, budget, income/expense. */
export async function seedWorld(
  owner: TU,
  opts: { brokerage?: boolean; extraAccounts?: Array<{ name: string; currency: string; balance: number }> } = {},
): Promise<World> {
  const enc = (s: string) => encryptField(owner.dek, s);
  const mkAcc = async (name: string, type: string, currency: string, group: string, extra: object = {}) =>
    (
      await db
        .insert(accounts)
        .values({ userId: owner.id, type, currency, group, nameCt: enc(name), aliasCt: enc(CANARY.alias), ...extra })
        .returning({ id: accounts.id })
    )[0].id;
  const tx = (accountId: number, amount: number, currency: string, extra: object = {}) =>
    db.insert(transactions).values({
      userId: owner.id,
      date: today(),
      accountId,
      currency,
      amount,
      payee: enc(CANARY.payee),
      note: enc(CANARY.note),
      ...extra,
    } as never);

  const checking = await mkAcc("Checking", "A", "USD", "Banking");
  const vnd = await mkAcc("Savings VND", "A", "VND", "Banking");
  const visa = await mkAcc("Visa", "L", "USD", "Credit Cards");
  await tx(checking, 1000, "USD");
  await tx(checking, -250, "USD");
  await tx(vnd, 2_500_000, "VND");
  await tx(visa, -300, "USD");

  const [goal] = await db
    .insert(goals)
    .values({ userId: owner.id, type: "savings", currency: "USD", targetAmount: 5000, nameCt: enc(CANARY.goal) })
    .returning({ id: goals.id });
  await db.insert(goalAccounts).values({ userId: owner.id, goalId: goal.id, accountId: checking });

  const [loan] = await db
    .insert(loans)
    .values({
      userId: owner.id,
      type: "auto",
      accountId: visa,
      currency: "USD",
      principal: 10000,
      annualRate: 5,
      termMonths: 60,
      startDate: "2025-01-01",
      paymentFrequency: "monthly",
      nameCt: enc(CANARY.loan),
    })
    .returning({ id: loans.id });

  const [groc] = await db
    .insert(categories)
    .values({ userId: owner.id, type: "E", group: "Food", nameCt: enc(CANARY.category) })
    .returning({ id: categories.id });
  const [sal] = await db
    .insert(categories)
    .values({ userId: owner.id, type: "I", group: "Work", nameCt: enc("Salary") })
    .returning({ id: categories.id });
  await db.insert(budgets).values({ userId: owner.id, categoryId: groc.id, month: today().slice(0, 7), amount: 400, currency: "USD" });
  await tx(checking, -120, "USD", { categoryId: groc.id });
  await tx(checking, 3000, "USD", { categoryId: sal.id });
  // keep the cash totals exact: the two flow rows above are part of the checking balance (750+2880)

  for (const a of opts.extraAccounts ?? []) {
    const id = await mkAcc(a.name, "A", a.currency, "Other");
    await tx(id, a.balance, a.currency);
  }

  let brokerage: number | undefined;
  if (opts.brokerage) {
    brokerage = await mkAcc("Brokerage", "A", "USD", "Investments", { isInvestment: true });
    const [h] = await db
      .insert(portfolioHoldings)
      .values({ userId: owner.id, accountId: brokerage, currency: "USD", nameCt: enc(CANARY.holding), symbolCt: enc("CNRY") })
      .returning({ id: portfolioHoldings.id });
    await tx(brokerage, -500, "USD", { quantity: 10, portfolioHoldingId: h.id });
    const d = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await db.insert(portfolioSnapshots).values({
      userId: owner.id,
      snapDate: d,
      accountId: brokerage,
      marketValue: 5000,
      costBasis: 4000,
      currency: "USD",
      nativeMarketValue: 5000,
      nativeCurrency: "USD",
      source: "cron",
    });
  }
  return { ids: { checking, vnd, visa, brokerage, goal: goal.id, loan: loan.id, budgetCat: groc.id, incomeCat: sal.id } };
}

export const RESET_SQL = sql`TRUNCATE TABLE accounts, goals, loans, categories, budgets, transactions, portfolio_holdings, portfolio_snapshots, goal_accounts, fx_rates, settings, user_passkeys RESTART IDENTITY CASCADE`;

/** Same user, same DEK, but a session issued `seconds` ago (not fresh for step-up). */
export async function staleSession(u: TU, seconds = 900): Promise<TU> {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() - seconds * 1000 });
  const { token, jti } = await createSessionToken(u.id, true);
  vi.useRealTimers();
  putDEK(jti, Buffer.from(u.dek), 3_600_000, u.id);
  return { ...u, token };
}
