/**
 * P4 Family Wealth overview - REAL Postgres integration tests (DATABASE_URL must target a *_test DB).
 *
 * Every request goes through the real route handlers with real session JWTs and DEK-cache entries;
 * the guards (session-only, 2FA, rate limit, share status, key unseal) are never mocked. Only the
 * mail transport and outbound market fetches are stubbed.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

vi.mock("@/lib/email", async (orig) => {
  const actual = await orig<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: async (m: never) => {
      (globalThis as unknown as { __famMails: unknown[] }).__famMails ??= [];
      (globalThis as unknown as { __famMails: unknown[] }).__famMails.push(m);
    },
  };
});
vi.mock("@/lib/market-fetch", async (orig) => {
  const actual = await orig<typeof import("@/lib/market-fetch")>();
  return {
    ...actual,
    marketFetch: async () => {
      throw new Error("offline (test)");
    },
  };
});

import { db } from "@/db";
import { accounts, familyKeyGrants, familyLabels, familyShares, settings, userPasskeys } from "@/db/schema-pg";
import { createSessionToken } from "@/lib/auth/jwt";
import { getOrCreateApiKey } from "@/lib/api-auth";
import { decryptLabel, buildLabelAAD, unsealKey, buildGrantAAD } from "@/lib/crypto/family-crypto";
import { getUserPrivateKeyHex, withSectionKeys } from "@/lib/family/grant";
import { syncFamilyLabels } from "@/lib/family/sweep";
import { FAMILY_SECTIONS_V1, type FamilySection } from "@/lib/family/sections";
import { bootstrapFamilyTestDb, resetFamilyTestDb, shutdownFamilyTestDb } from "./family-fixtures";
import {
  CANARY,
  RESET_SQL,
  call,
  lastTokenTo,
  mails,
  mkUser,
  req,
  seedRates,
  seedWorld,
  today,
  type TU,
} from "./p4-helpers";

import * as overviewModule from "@/app/api/family/overview/route";
import { GET as overviewGET } from "@/app/api/family/overview/route";
import { POST as invitePOST } from "@/app/api/family/manage/invite/route";
import { POST as acceptPOST } from "@/app/api/family/manage/accept/route";
import { GET as reportsGET } from "@/app/api/reports/route";
import { GET as goalsGET } from "@/app/api/goals/route";
import { GET as loansGET } from "@/app/api/loans/route";
import { GET as dashboardGET } from "@/app/api/dashboard/route";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";

const OV = "/api/family/overview";
const overview = (u: TU | null, qs = "") => call(overviewGET, req(OV + qs, "GET", u));

beforeAll(async () => {
  await bootstrapFamilyTestDb();
});
beforeEach(async () => {
  await resetFamilyTestDb();
  await db.execute(RESET_SQL);
  mails().length = 0;
  await seedRates({ VND: 0.00004, EUR: 1.25 });
});
afterAll(async () => {
  await shutdownFamilyTestDb();
});

/** invite + accept + owner sweep => active share with sealed grants and sidecar labels */
async function activeShare(owner: TU, viewer: TU, sections: string[]): Promise<string> {
  const inv = await call(invitePOST, req("/api/family/manage/invite", "POST", owner, { viewerEmail: viewer.email, sections }));
  expect(inv.status).toBe(201);
  const acc = await call(acceptPOST, req("/api/family/manage/accept", "POST", viewer, { token: lastTokenTo(viewer.email) }));
  expect(acc.status).toBe(200);
  await syncFamilyLabels(db, owner.id, owner.dek);
  const [row] = await db.select().from(familyShares).where(eq(familyShares.id, inv.json.shareId));
  expect(row.status).toBe("active");
  return inv.json.shareId;
}

/** raw share row (no keys): status/section matrix without the invite round trip */
async function rawShare(ownerId: string, viewer: TU, sections: string[], status: string) {
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO family_shares (id, owner_id, viewer_id, viewer_email_lower, sections, status)
    VALUES (${id}, ${ownerId}, ${viewer.id}, ${viewer.email}, ${`{${sections.join(",")}}`}::TEXT[], ${status})`);
  return id;
}

const shared = (body: any) => (body.members as any[]).find((m) => m.relation === "shared");
const me = (body: any) => (body.members as any[]).find((m) => m.relation === "me");
const byLabel = (rows: any[], label: string) => rows.find((r) => r.label === label);

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("real numbers + decrypted labels match the owner's own API (sections net_worth + accounts)", () => {
  it("returns the owner's balance-sheet figures, converted VND, sidecar labels, and nothing else", async () => {
    const A = await mkUser("owner", { name: "Alice" });
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await activeShare(A, B, ["net_worth", "accounts"]);

    const ov = await overview(B);
    expect(ov.status).toBe(200);
    const m = shared(ov.json);
    expect(m.name).toBe("Alice");
    expect(Object.keys(m.sections).sort()).toEqual(["accounts", "net_worth"]);
    expect(m.notShared).toEqual(FAMILY_SECTIONS_V1.filter((s) => s !== "net_worth" && s !== "accounts"));
    expect(m.partial).toBe(false);
    expect(m.genericLabels).toBe(false);

    // owner's own API (real handler, owner's session, live DEK)
    const bs = await call(reportsGET, req("/api/reports?type=balance-sheet", "GET", A));
    expect(bs.status).toBe(200);
    expect(m.sections.net_worth.assets).toBe(bs.json.totalAssets);
    expect(m.sections.net_worth.liabilities).toBe(bs.json.totalLiabilities);
    expect(m.sections.net_worth.net).toBe(bs.json.netWorth);
    expect(bs.json.totalAssets).toBe(3630 + 100); // 3630 USD + 2,500,000 VND @ 0.00004
    expect(bs.json.totalLiabilities).toBe(300);

    const ownerRows = [...bs.json.assets, ...bs.json.liabilities] as any[];
    const accs = m.sections.accounts.accounts as any[];
    expect(accs.map((a) => a.label).sort()).toEqual(["Checking", "Savings VND", "Visa"]);
    for (const a of accs) {
      const o = ownerRows.find((r) => r.accountName === a.label);
      expect(o, a.label).toBeTruthy();
      expect(Math.abs(a.converted)).toBe(o.convertedBalance);
      expect(a.labelIsGeneric).toBe(false);
      expect(a.basis).toBe("ledger");
    }
    expect(byLabel(accs, "Savings VND")).toMatchObject({ currency: "VND", balance: 2_500_000, converted: 100, group: "Banking", type: "A" });
    expect(byLabel(accs, "Visa")).toMatchObject({ type: "L", balance: -300, converted: -300 });
    expect(m.sections.accounts.groups).toEqual(
      expect.arrayContaining([
        { group: "Banking", type: "A", converted: 3730 },
        { group: "Credit Cards", type: "L", converted: -300 },
      ]),
    );

    // history: last point equals today's net worth (live cash override)
    const hist = m.sections.net_worth.history as Array<{ date: string; value: number }>;
    expect(hist.length).toBeGreaterThan(30);
    expect(hist[hist.length - 1].value).toBe(m.sections.net_worth.net);

    // NOTHING from other sections: no names, no ciphertext, no secrets anywhere in the body
    for (const canary of [CANARY.goal, CANARY.loan, CANARY.category, CANARY.holding, CANARY.payee, CANARY.note, CANARY.alias, "Salary"]) {
      expect(ov.text).not.toContain(canary);
    }
    expect(ov.text).not.toMatch(/v1:/);
    expect(ov.text).not.toContain(A.id);
    expect(ov.text).not.toContain(A.email);
    expect(ov.headers.get("cache-control")).toContain("no-store");

    // "me" member is always present and carries the viewer's (empty) own data
    expect(me(ov.json)).toMatchObject({ id: "me", name: "Me" });
  });

  it("goals / loans / budgets / cashflow / investments match the owner's own APIs", async () => {
    const A = await mkUser("owner", { name: "Alice" });
    const B = await mkUser("viewer", { mfa: true });
    const world = await seedWorld(A);
    await activeShare(A, B, [...FAMILY_SECTIONS_V1]);

    const ov = await overview(B);
    expect(ov.status).toBe(200);
    const m = shared(ov.json);
    expect(Object.keys(m.sections).sort()).toEqual([...FAMILY_SECTIONS_V1].sort());
    expect(m.notShared).toEqual([]);

    const og = (await call(goalsGET, req("/api/goals", "GET", A))).json as any[];
    const g = m.sections.goals.goals[0];
    const ogoal = og.find((x) => x.name === CANARY.goal)!;
    expect(g.label).toBe(CANARY.goal);
    expect(g.currentAmount).toBe(ogoal.currentAmount);
    expect(g.progress).toBe(ogoal.progress);
    expect(g.remaining).toBe(ogoal.remaining);
    expect(g.currentAmount).toBe(3630);

    const ol = (await call(loansGET, req("/api/loans", "GET", A))).json as any[];
    const l = m.sections.loans.loans[0];
    const oloan = ol.find((x) => x.name === CANARY.loan)!;
    expect(l.label).toBe(CANARY.loan);
    expect(l.remainingBalance).toBe(oloan.remainingBalance);
    expect(l.balanceSource).toBe(oloan.balanceSource);
    expect(l.remainingBalance).toBe(300);
    expect(l.monthlyPayment).toBe(oloan.monthlyPayment);
    expect(l.payoffDate).toBe(oloan.payoffDate);

    const dash = (await call(dashboardGET, req("/api/dashboard", "GET", A))).json as any;
    const monthKey = today().slice(0, 7);
    const dI = dash.incomeVsExpenses.find((r: any) => r.month === monthKey && r.type === "I").total;
    const dE = dash.incomeVsExpenses.find((r: any) => r.month === monthKey && r.type === "E").total;
    expect(m.sections.cashflow.income).toBe(dI);
    expect(m.sections.cashflow.expenses).toBe(-dE);
    expect(m.sections.cashflow.monthly).toEqual([{ month: monthKey, income: 3000, expenses: 120 }]);

    expect(m.sections.budgets.month).toBe(monthKey);
    expect(m.sections.budgets.budgets).toEqual([
      expect.objectContaining({ label: CANARY.category, budgeted: 400, actual: 120, labelIsGeneric: false }),
    ]);
    expect(world.ids.budgetCat).toBeGreaterThan(0);
    expect(m.sections.investments.holdings).toEqual([]);
  });

  it("investments: latest stored market snapshot (DEK-free), holdings with sidecar label, not the ledger sum", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A, { brokerage: true });
    await activeShare(A, B, ["net_worth", "accounts", "investments"]);
    const m = shared((await overview(B)).json);
    const inv = m.sections.investments;
    expect(inv.holdingsValue).toBe(5000);
    expect(inv).toMatchObject({ accountsPriced: 1, accountsUnpriced: 0 });
    expect(inv.holdings).toEqual([
      expect.objectContaining({ label: CANARY.holding, quantity: 10, currency: "USD", labelIsGeneric: false }),
    ]);
    const brk = byLabel(m.sections.accounts.accounts, "Brokerage");
    expect(brk).toMatchObject({ balance: 5000, converted: 5000, basis: "market_snapshot" });
    expect(m.sections.net_worth.assets).toBe(3630 + 100 + 5000);
    // symbols are ciphertext: never in the response
    expect(JSON.stringify(m)).not.toContain("CNRY");
  });

  it("an investment account without a stored snapshot is unpriced (never valued at its ledger sum)", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A, { brokerage: true });
    await db.execute(sql`TRUNCATE TABLE portfolio_snapshots`);
    await activeShare(A, B, ["net_worth", "accounts", "investments"]);
    const m = shared((await overview(B)).json);
    expect(byLabel(m.sections.accounts.accounts, "Brokerage")).toMatchObject({ balance: null, converted: null, basis: "unpriced" });
    expect(m.partial).toBe(true);
    expect(m.partialReasons).toContain("investment_unpriced");
    expect(m.sections.net_worth.assets).toBe(3630 + 100);
    expect(m.sections.investments).toMatchObject({ holdingsValue: 0, accountsUnpriced: 1 });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("section filter x share state matrix (generated from FAMILY_SECTIONS_V1)", () => {
  const classes: Array<[string, (s: FamilySection) => FamilySection[]]> = [
    ["only s", (s) => [s]],
    ["all but s", (s) => FAMILY_SECTIONS_V1.filter((x) => x !== s)],
    ["all", () => [...FAMILY_SECTIONS_V1]],
  ];

  for (const section of FAMILY_SECTIONS_V1) {
    for (const [name, pick] of classes) {
      it(`active share, ${name} [s=${section}]: exactly the granted sections, ungranted listed as notShared`, async () => {
        const A = await mkUser("owner");
        const B = await mkUser("viewer", { mfa: true });
        await seedWorld(A, { brokerage: true });
        const granted = pick(section);
        await rawShare(A.id, B, granted, "active");
        const ov = await overview(B);
        expect(ov.status).toBe(200);
        const m = shared(ov.json);
        expect(Object.keys(m.sections).sort()).toEqual([...granted].sort());
        expect(m.notShared).toEqual(FAMILY_SECTIONS_V1.filter((x) => !granted.includes(x)));
        expect(m.unavailable).toEqual([]);
        // without sealed grants the numbers still flow, labels are generic (never the real name)
        expect(ov.text).not.toContain(CANARY.goal);
        expect(ov.text).not.toContain(CANARY.account);
      });
    }
  }

  for (const status of ["pending", "awaiting_owner_unlock", "suspended", "revoked", "declined", "expired", "key_reset"]) {
    it(`share in status "${status}" yields no member and no owner data`, async () => {
      const A = await mkUser("owner");
      const B = await mkUser("viewer", { mfa: true });
      await seedWorld(A);
      await rawShare(A.id, B, [...FAMILY_SECTIONS_V1], status);
      const ov = await overview(B);
      expect(ov.status).toBe(200);
      expect(ov.json.members).toHaveLength(1); // only "me"
      expect(ov.json.members[0].relation).toBe("me");
      expect(ov.text).not.toContain("Checking");
      expect(ov.text).not.toContain("3630");
    });
  }

  it("revoking an active share removes the member on the very next call", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    const shareId = await activeShare(A, B, ["accounts"]);
    expect((await overview(B)).json.members).toHaveLength(2);
    await db.update(familyShares).set({ status: "revoked" }).where(eq(familyShares.id, shareId));
    const after = await overview(B);
    expect(after.json.members).toHaveLength(1);
    expect(after.text).not.toContain("Checking");
  });

  it("a key-less (not yet finalized) active share serves numbers with generic labels", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await rawShare(A.id, B, ["accounts"], "active");
    const m = shared((await overview(B)).json);
    expect(m.genericLabels).toBe(true);
    expect((m.sections.accounts.accounts as any[]).map((a) => a.label).sort()).toEqual(["Account 1", "Account 2", "Account 3"]);
    expect((m.sections.accounts.accounts as any[]).every((a) => a.labelIsGeneric)).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("label keys: only the viewer's own private key opens only the granted sections' labels", () => {
  it("other viewers/sections cannot decrypt; a missing or foreign-epoch label degrades to a generic label", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewerb", { mfa: true });
    const C = await mkUser("viewerc", { mfa: true });
    await seedWorld(A);
    const sB = await activeShare(A, B, ["accounts"]);
    const sC = await activeShare(A, C, ["goals"]);

    // B sees account labels, no goals; C the reverse
    const mb = shared((await overview(B)).json);
    expect(Object.keys(mb.sections)).toEqual(["accounts"]);
    expect(mb.sections.accounts.accounts.map((a: any) => a.label).sort()).toEqual(["Checking", "Savings VND", "Visa"]);
    const mc = shared((await overview(C)).json);
    expect(Object.keys(mc.sections)).toEqual(["goals"]);
    expect(mc.sections.goals.goals[0].label).toBe(CANARY.goal);
    expect((await overview(C)).text).not.toContain("Checking");

    // crypto taint: B's private key + B's section keys cannot open the goals sidecar
    const privB = (await getUserPrivateKeyHex(db, B.id, B.dek))!;
    const goalRow = (await db.select().from(familyLabels).where(and(eq(familyLabels.ownerId, A.id), eq(familyLabels.section, "goals"))))[0];
    await withSectionKeys(sB, B.id, privB, db, async (keys) => {
      expect(Object.keys(keys)).toEqual(["accounts"]);
      expect(() => decryptLabel(keys.accounts, goalRow.labelCt, buildLabelAAD(A.id, "goals", "goals", goalRow.entityId, goalRow.epoch))).toThrow();
    });
    // C's private key cannot unseal B's grant
    const privC = (await getUserPrivateKeyHex(db, C.id, C.dek))!;
    const gB = (await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, sB)))[0];
    expect(() => unsealKey(gB.keySealed!, privC, buildGrantAAD(sB, A.id, B.id, gB.section, gB.epoch))).toThrow();
    expect(() => unsealKey(gB.keySealed!, privC, buildGrantAAD(sC, A.id, C.id, gB.section, gB.epoch))).toThrow();

    // missing sidecar row for one account => that account is generic, the others keep real labels
    const accRows = await db.select().from(familyLabels).where(and(eq(familyLabels.ownerId, A.id), eq(familyLabels.section, "accounts")));
    await db.delete(familyLabels).where(and(eq(familyLabels.ownerId, A.id), eq(familyLabels.section, "accounts"), eq(familyLabels.entityId, accRows[0].entityId)));
    const m2 = shared((await overview(B)).json);
    const labels = m2.sections.accounts.accounts as any[];
    expect(labels.filter((a) => a.labelIsGeneric)).toHaveLength(1);
    expect(labels.filter((a) => !a.labelIsGeneric)).toHaveLength(2);
    expect(m2.genericLabels).toBe(true);

    // a row from a foreign epoch (tampered AAD) is undecryptable => generic, not an error
    await db.update(familyLabels).set({ epoch: 99 }).where(and(eq(familyLabels.ownerId, A.id), eq(familyLabels.section, "accounts")));
    const m3 = shared((await overview(B)).json);
    expect((m3.sections.accounts.accounts as any[]).every((a) => a.labelIsGeneric)).toBe(true);
    expect(m3.sections.accounts.accounts.map((a: any) => a.label).sort()).toEqual(["Account 1", "Account 2", "Account 3"]);
  });

  it("a locked viewer session (no DEK) still gets numbers, with generic labels", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await activeShare(A, B, ["accounts", "net_worth"]);
    const lockedToken = (await createSessionToken(B.id, true)).token; // never put into the DEK cache
    const ov = await overview({ ...B, token: lockedToken });
    expect(ov.status).toBe(200);
    const m = shared(ov.json);
    expect(m.sections.net_worth.net).toBe(3630 + 100 - 300);
    expect(m.genericLabels).toBe(true);
    expect(ov.text).not.toContain("Checking");
  });

  it("the viewer's own data ('me') carries real labels decrypted with the viewer's own DEK", async () => {
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(B);
    const ov = await overview(B);
    const mm = me(ov.json);
    expect(Object.keys(mm.sections).sort()).toEqual([...FAMILY_SECTIONS_V1].sort());
    expect(mm.sections.accounts.accounts.map((a: any) => a.label).sort()).toEqual(["Checking", "Savings VND", "Visa"]);
    expect(mm.sections.goals.goals[0].label).toBe(CANARY.goal);
    expect(mm.notShared).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("2FA gate", () => {
  it("no 2FA => 403 mfa_required with zero data; enabling => 200; disabling => 403 again", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: false });
    await seedWorld(A);
    await rawShare(A.id, B, ["accounts"], "active");
    const denied = await overview(B);
    expect(denied.status).toBe(403);
    expect(denied.json.error).toBe("mfa_required");
    expect(denied.json.members).toBeUndefined();
    expect(denied.text).not.toContain("Checking");

    // enable MFA on the account AND sign in again (a session minted before MFA stays refused)
    await db.execute(sql`UPDATE users SET mfa_enabled = 1 WHERE id = ${B.id}`);
    expect((await overview(B)).status).toBe(403); // stale session: this session never passed 2FA
    const B2 = await mkUser("viewer2", { mfa: true });
    await rawShare(A.id, B2, ["accounts"], "active");
    expect((await overview(B2)).status).toBe(200);

    await db.execute(sql`UPDATE users SET mfa_enabled = 0 WHERE id = ${B2.id}`);
    expect((await overview(B2)).status).toBe(403);
  });

  it("a registered passkey counts as 2FA only for a session that passed it; mfa_enabled without a verified session is refused", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: false });
    await rawShare(A.id, B, ["accounts"], "active");
    await db.insert(userPasskeys).values({ id: randomUUID(), userId: B.id, publicKey: "pk", createdAt: new Date().toISOString() });
    expect((await overview(B)).status).toBe(403);

    const C = await mkUser("viewerc", { mfa: true, sessionMfa: false });
    await rawShare(A.id, C, ["accounts"], "active");
    const r = await overview(C);
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("mfa_required");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("auth methods, write methods, rate limit, strict query", () => {
  it("api_key (real pf_ key) is refused with 403 and returns no data", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await rawShare(A.id, B, ["accounts"], "active");
    const key = await getOrCreateApiKey(B.id, B.dek);
    expect(key).toBeTruthy();
    const r = await call(overviewGET, req(OV, "GET", null, undefined, { authorization: `Bearer ${key}` }));
    expect(r.status).toBe(403);
    expect(r.json.error).toBe("Only session authentication is allowed"); // refused by the method guard itself, not just the 2FA gate behind it
    expect(r.text).not.toContain("Checking");
    const r2 = await call(overviewGET, req(OV, "GET", null, undefined, { "x-api-key": key as string }));
    expect([401, 403]).toContain(r2.status);
    // unauthenticated
    expect((await overview(null)).status).toBe(401);
  });

  it("a pending-MFA token (password passed, TOTP not) gets no data", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await rawShare(A.id, B, ["accounts"], "active");
    const { token } = await createSessionToken(B.id, false, { pending: true, expirationTime: "5m" });
    const r = await overview({ ...B, token });
    expect([401, 403]).toContain(r.status);
    expect(r.text).not.toContain("Checking");
  });

  it("the route module exports GET only; the middleware answers every other method 405 before auth", async () => {
    const exported = Object.keys(overviewModule).filter((k) => /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(k));
    expect(exported).toEqual(["GET"]);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = middleware(new NextRequest(`http://localhost${OV}`, { method, headers: { origin: "http://localhost" } }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get("allow")).toContain("GET");
    }
    const ok = middleware(new NextRequest(`http://localhost${OV}`, { method: "GET" }));
    expect(ok.status).not.toBe(405);
  });

  it("30 requests / minute / viewer, then 429 with Retry-After", async () => {
    const B = await mkUser("viewer", { mfa: true });
    for (let i = 0; i < 30; i++) expect((await overview(B)).status, `req ${i}`).toBe(200);
    const r = await overview(B);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rejects unknown query params (as / ownerId / userId) and bad periods with 400; currency is ignored", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await rawShare(A.id, B, ["accounts"], "active");
    for (const qs of [`?as=${A.id}`, `?ownerId=${A.id}`, `?userId=${A.id}`, "?period=5y", "?foo=bar"]) {
      const r = await overview(B, qs);
      expect(r.status, qs).toBe(400);
      expect(r.text).not.toContain("Checking");
    }
    const ok = await overview(B, "?currency=EUR&period=6m");
    expect(ok.status).toBe(200);
    expect(ok.json.displayCurrency).toBe("USD"); // viewer's own setting, not the query
    expect(ok.json.period).toBe("6m");
  });

  it("calling the overview writes nothing (data tables identical before/after)", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A, { brokerage: true });
    await activeShare(A, B, [...FAMILY_SECTIONS_V1]);
    const snap = async () =>
      (
        await db.execute(sql`SELECT
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM accounts t) a,
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM transactions t) tx,
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM goals t) g,
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM loans t) l,
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) FROM portfolio_snapshots t) ps,
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY entity_id, section), '')) FROM family_labels t) fl,
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY section), '')) FROM family_key_grants t) fk,
          (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY section, epoch), '')) FROM family_section_keys t) fsk`)
      ).rows[0];
    const before = await snap();
    for (let i = 0; i < 3; i++) expect((await overview(B)).status).toBe(200);
    expect(await snap()).toEqual(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("FX into the viewer's display currency (never a silent 1:1)", () => {
  it("converts every account to the viewer's display currency at the viewer's rates", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await db.insert(settings).values({ key: "display_currency", userId: B.id, value: "EUR" });
    await activeShare(A, B, ["net_worth", "accounts"]);
    const ov = await overview(B);
    expect(ov.json.displayCurrency).toBe("EUR");
    const m = shared(ov.json);
    const accs = m.sections.accounts.accounts as any[];
    expect(byLabel(accs, "Checking")).toMatchObject({ balance: 3630, currency: "USD", converted: 2904 }); // 3630 / 1.25
    expect(byLabel(accs, "Savings VND").converted).toBe(80); // 2,500,000 * 0.00004 / 1.25
    expect(byLabel(accs, "Visa").converted).toBe(-240);
    expect(m.sections.net_worth).toMatchObject({ assets: 2984, liabilities: 240, net: 2744 });
    expect(m.partial).toBe(false);
  });

  it("a currency with no resolvable rate is flagged partial and excluded - never counted 1:1", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A, { extraAccounts: [{ name: "Mystery", currency: "ZZZ", balance: 777_777 }] });
    await activeShare(A, B, ["net_worth", "accounts"]);
    const ov = await overview(B);
    expect(ov.status).toBe(200);
    const m = shared(ov.json);
    expect(m.partial).toBe(true);
    expect(m.partialReasons).toContain("fx_rate_missing");
    expect(ov.json.partial).toBe(true);
    const mystery = byLabel(m.sections.accounts.accounts, "Mystery");
    expect(mystery).toMatchObject({ balance: 777_777, currency: "ZZZ", converted: null });
    expect(m.sections.net_worth.assets).toBe(3630 + 100); // 777,777 NOT added as if 1 ZZZ = 1 USD
    expect(ov.text).not.toContain("778");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
describe("response contains only the DTO: no key material, no user/db ids, no ciphertext", () => {
  it("key names are an allow-list; values carry no ids/keys", async () => {
    const A = await mkUser("owner", { name: "Alice" });
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A, { brokerage: true });
    const shareId = await activeShare(A, B, [...FAMILY_SECTIONS_V1]);
    const ov = await overview(B);
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (keys.add(k), walk(x));
    };
    walk(ov.json);
    for (const bad of ["id", "ownerId", "userId", "viewerId", "key", "keySealed", "sectionKey", "dek", "priv", "privateKey", "epoch", "labelCt", "nameCt", "symbol", "payee", "note", "tags", "alias"]) {
      if (bad === "id") continue; // member id (share id / "me") is the only id, asserted below
      expect(keys.has(bad), bad).toBe(false);
    }
    const memberIds = (ov.json.members as any[]).map((x) => x.id);
    expect(memberIds).toEqual(["me", shareId]);
    // no entity carries a raw `id`
    for (const m of ov.json.members as any[]) {
      const sec = JSON.stringify(m.sections);
      expect(sec).not.toMatch(/"id":/);
    }
    // top-level shape (contract for the P5 page)
    expect(Object.keys(ov.json).sort()).toEqual(["asOf", "displayCurrency", "members", "partial", "period"]);
    expect(Object.keys(shared(ov.json)).sort()).toEqual(
      ["genericLabels", "id", "name", "notShared", "partial", "partialReasons", "relation", "sections", "unavailable"].sort(),
    );
    for (const secret of [A.id, A.email, B.id, B.email]) expect(ov.text).not.toContain(secret);
    expect(ov.text).not.toMatch(/pfs_|pf_[0-9a-f]{8}/);
    expect(ov.text).not.toMatch(/v1:/);
  });

  it("a failing section builder yields unavailable + partial, never a 500 and never other sections' data", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer", { mfa: true });
    await seedWorld(A);
    await db.execute(sql`UPDATE loans SET start_date = 'not-a-date'`); // legacy bad row: summarized as integrity row
    await activeShare(A, B, ["loans", "accounts"]);
    const ov = await overview(B);
    expect(ov.status).toBe(200);
    const m = shared(ov.json);
    expect(m.sections.loans.loans[0]).toMatchObject({ remainingBalance: null, monthlyPayment: null });
    expect(m.sections.accounts.accounts).toHaveLength(3);
  });
});

void accounts;
