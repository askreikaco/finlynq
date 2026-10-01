/**
 * P4: step-up on invite / widen / accept-with-share-back, and must-share-back re-consent (plan 7.4).
 * REAL Postgres, real JWTs (a stale session is a genuinely old JWT), real password hashing.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

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
import { familyKeyGrants, familyShares, users } from "@/db/schema-pg";
import { hashPassword } from "@/lib/auth";
import { syncFamilyLabels } from "@/lib/family/sweep";
import { bootstrapFamilyTestDb, resetFamilyTestDb, shutdownFamilyTestDb } from "./family-fixtures";
import { RESET_SQL, call, lastTokenTo, mails, mkUser, req, seedRates, seedWorld, staleSession, CANARY, type TU } from "./p4-helpers";

import { POST as invitePOST } from "@/app/api/family/manage/invite/route";
import { POST as acceptPOST } from "@/app/api/family/manage/accept/route";
import { PUT as updatePUT } from "@/app/api/family/manage/update-sections/route";
import { GET as listGET } from "@/app/api/family/manage/list/route";
import { GET as overviewGET } from "@/app/api/family/overview/route";

const P = "/api/family/manage";
const PASSWORD = "correct horse battery staple";

const invite = (u: TU, viewerEmail: string, sections: string[], extra: Record<string, unknown> = {}) =>
  call(invitePOST, req(`${P}/invite`, "POST", u, { viewerEmail, sections, ...extra }));
const accept = (u: TU, token: string, extra: Record<string, unknown> = {}) =>
  call(acceptPOST, req(`${P}/accept`, "POST", u, { token, ...extra }));
const update = (u: TU, shareId: string, sections: string[], extra: Record<string, unknown> = {}) =>
  call(updatePUT, req(`${P}/update-sections`, "PUT", u, { shareId, sections, ...extra }));
const list = (u: TU) => call(listGET, req(`${P}/list`, "GET", u));
const overview = (u: TU) => call(overviewGET, req("/api/family/overview", "GET", u));
const shareCount = async () => (await db.select().from(familyShares)).length;
const row = async (id: string) => (await db.select().from(familyShares).where(eq(familyShares.id, id)))[0];

async function withPassword(u: TU) {
  await db.update(users).set({ passwordHash: await hashPassword(PASSWORD) }).where(eq(users.id, u.id));
}

beforeAll(async () => {
  await bootstrapFamilyTestDb();
});
beforeEach(async () => {
  await resetFamilyTestDb();
  await db.execute(RESET_SQL);
  mails().length = 0;
  await seedRates({ VND: 0.00004 });
});
afterAll(async () => {
  await shutdownFamilyTestDb();
});

describe("step-up on invite", () => {
  it("stale session without password is rejected (nothing created, nothing mailed); fresh and stale+password succeed", async () => {
    const A = await mkUser("owner");
    await withPassword(A);
    const stale = await staleSession(A);

    const r1 = await invite(stale, "x1@fam4.test", ["accounts"]);
    expect(r1.status).toBe(401);
    expect(r1.json.code).toBe("step_up_required");
    expect(await shareCount()).toBe(0);
    expect(mails()).toHaveLength(0);

    const wrong = await invite(stale, "x1@fam4.test", ["accounts"], { currentPassword: "nope" });
    expect(wrong.status).toBe(401);
    expect(await shareCount()).toBe(0);

    const ok = await invite(stale, "x1@fam4.test", ["accounts"], { currentPassword: PASSWORD });
    expect(ok.status).toBe(201);
    expect(await shareCount()).toBe(1);

    const fresh = await invite(A, "x2@fam4.test", ["accounts"]); // fresh session needs no password
    expect(fresh.status).toBe(201);
    const freshWrongPw = await invite(A, "x3@fam4.test", ["accounts"], { currentPassword: "ignored-when-fresh" });
    expect(freshWrongPw.status).toBe(201);
  });

  it("password guesses through a stale session are rate limited (5 / 15 min)", async () => {
    const A = await mkUser("owner");
    await withPassword(A);
    const stale = await staleSession(A);
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await invite(stale, "g@fam4.test", ["accounts"], { currentPassword: `bad${i}` })).status);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes[5]).toBe(429);
    // even the right password is now throttled
    expect((await invite(stale, "g@fam4.test", ["accounts"], { currentPassword: PASSWORD })).status).toBe(429);
  });
});

describe("step-up on widening (update-sections)", () => {
  it("widening needs fresh session or password; narrowing and same-set do not", async () => {
    const A = await mkUser("owner");
    await withPassword(A);
    await seedWorld(A);
    const inv = await invite(A, "w@fam4.test", ["accounts", "goals"]);
    const shareId = inv.json.shareId as string;
    const stale = await staleSession(A);

    const denied = await update(stale, shareId, ["accounts", "goals", "loans"]);
    expect(denied.status).toBe(401);
    expect((await row(shareId)).sections).toEqual(["accounts", "goals"]);

    const wrong = await update(stale, shareId, ["accounts", "goals", "loans"], { currentPassword: "nope" });
    expect(wrong.status).toBe(401);
    expect((await row(shareId)).sections).toEqual(["accounts", "goals"]);

    const narrow = await update(stale, shareId, ["accounts"]);
    expect(narrow.status).toBe(200);
    expect((await row(shareId)).sections).toEqual(["accounts"]);

    const okPw = await update(stale, shareId, ["accounts", "goals"], { currentPassword: PASSWORD });
    expect(okPw.status).toBe(200);
    const okFresh = await update(A, shareId, ["accounts", "goals", "loans"]);
    expect(okFresh.status).toBe(200);
    expect((await row(shareId)).sections).toEqual(["accounts", "goals", "loans"]);
  });
});

describe("step-up on accept with share-back", () => {
  it("stale viewer without password cannot accept a must-share-back invite; with password or fresh it works; plain accept needs none", async () => {
    const A = await mkUser("owner");
    const B = await mkUser("viewer");
    await withPassword(B);
    const stale = await staleSession(B);

    const inv = await invite(A, B.email, ["accounts"], { mustShareBack: true });
    expect(inv.status).toBe(201);
    const token = lastTokenTo(B.email);

    const denied = await accept(stale, token);
    expect(denied.status).toBe(401);
    expect((await row(inv.json.shareId)).status).toBe("pending");
    expect((await db.select().from(familyShares)).filter((s) => s.reciprocalOf)).toHaveLength(0);

    expect((await accept(stale, token, { currentPassword: "nope" })).status).toBe(401);
    expect((await row(inv.json.shareId)).status).toBe("pending");

    const ok = await accept(stale, token, { currentPassword: PASSWORD });
    expect(ok.status).toBe(200);
    expect((await row(inv.json.shareId)).status).not.toBe("pending");
    expect((await db.select().from(familyShares)).filter((s) => s.reciprocalOf)).toHaveLength(1);

    // fresh session, share-back
    const C = await mkUser("viewerc");
    const inv2 = await invite(A, C.email, ["accounts"], { mustShareBack: true });
    expect((await accept(C, lastTokenTo(C.email))).status).toBe(200);
    expect(inv2.status).toBe(201);

    // plain (no share-back) accept: stale session is fine
    const D = await mkUser("viewerd");
    await invite(A, D.email, ["accounts"]);
    const staleD = await staleSession(D);
    expect((await accept(staleD, lastTokenTo(D.email))).status).toBe(200);
  });
});

describe("must-share-back re-consent when the owner widens (plan 7.4)", () => {
  async function pair() {
    const A = await mkUser("owner", { name: "Alice" });
    const B = await mkUser("viewer", { mfa: true, name: "Bob" });
    await seedWorld(A);
    const inv = await invite(A, B.email, ["accounts"], { mustShareBack: true });
    expect(inv.status).toBe(201);
    expect((await accept(B, lastTokenTo(B.email))).status).toBe(200);
    await syncFamilyLabels(db, A.id, A.dek);
    await syncFamilyLabels(db, B.id, B.dek);
    const parentId = inv.json.shareId as string;
    const child = (await db.select().from(familyShares)).find((s) => s.reciprocalOf === parentId)!;
    return { A, B, parentId, childId: child.id };
  }
  const grantSections = async (shareId: string) =>
    (await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, shareId))).map((g) => g.section).sort();
  const sharedMember = (body: any) => (body.members as any[]).find((m) => m.relation === "shared");

  it("A widens: B only receives what B reciprocates until B consents; then the new section flows", async () => {
    const { A, B, parentId, childId } = await pair();
    expect(await grantSections(parentId)).toEqual(["accounts"]);
    expect(Object.keys(sharedMember((await overview(B)).json).sections)).toEqual(["accounts"]);

    // A widens A->B to accounts + goals
    const w = await update(A, parentId, ["accounts", "goals"]);
    expect(w.status).toBe(200);
    expect(w.json).toMatchObject({ sections: ["accounts", "goals"], reconsentRequired: true, reconsentSections: ["accounts", "goals"].filter((s) => s === "goals") });
    expect((await row(parentId)).requiredBackSections).toEqual(["accounts", "goals"]);

    // not consented: B holds no goals grant and receives no goals data
    await syncFamilyLabels(db, A.id, A.dek);
    expect(await grantSections(parentId)).toEqual(["accounts"]);
    const before = await overview(B);
    expect(Object.keys(sharedMember(before.json).sections)).toEqual(["accounts"]);
    expect(sharedMember(before.json).notShared).toContain("goals");
    expect(JSON.stringify(sharedMember(before.json))).not.toContain(CANARY.goal);

    // both parties see the pending re-consent in the manage list
    const lb = await list(B);
    expect(lb.json.incoming.find((s: any) => s.id === parentId)).toMatchObject({ reconsentRequired: true, reconsentSections: ["goals"] });
    expect((await list(A)).json.outgoing.find((s: any) => s.id === parentId)).toMatchObject({ reconsentRequired: true });

    // B cannot shrink below what A requires (existing guard)
    expect((await update(B, childId, ["goals"])).status).toBe(409);

    // B consents = widens B->A to cover the requirement (step-up applies: fresh session here)
    const consent = await update(B, childId, ["accounts", "goals"]);
    expect(consent.status).toBe(200);
    // A offline: numbers flow, labels generic until A's next sweep seals the new grant
    const mid = sharedMember((await overview(B)).json);
    expect(Object.keys(mid.sections).sort()).toEqual(["accounts", "goals"]);
    expect(mid.sections.goals.goals[0].labelIsGeneric).toBe(true);
    // A's next sweep finalizes the grant and the label
    await syncFamilyLabels(db, A.id, A.dek);
    expect(await grantSections(parentId)).toEqual(["accounts", "goals"]);
    const after = sharedMember((await overview(B)).json);
    expect(after.sections.goals.goals[0].label).toBe(CANARY.goal);
    expect((await list(B)).json.incoming.find((s: any) => s.id === parentId)).toMatchObject({ reconsentRequired: false });
  });

  it("B can still revoke the reciprocal share (and A can leave it) while a re-consent is pending", async () => {
    const { A, B, parentId, childId } = await pair();
    expect((await update(A, parentId, ["accounts", "goals"])).status).toBe(200);
    const { POST: revokePOST } = await import("@/app/api/family/manage/revoke/route");
    const rv = await call(revokePOST, req(`${P}/revoke`, "POST", B, { shareId: childId }));
    expect(rv.status).toBe(200);
    expect((await row(childId)).status).toBe("revoked");
    expect((await row(parentId)).status).toBe("suspended");
  });

  it("A viewing the reciprocal share while a re-consent is pending still records last_viewed_at", async () => {
    const { A, B, parentId, childId } = await pair();
    await db.execute(sql`UPDATE users SET mfa_enabled = 1 WHERE id = ${A.id}`);
    const A2 = await mkUser("ownerviewer", { mfa: true });
    void A2;
    expect((await update(A, parentId, ["accounts", "goals"])).status).toBe(200);
    // A (mfa-enabled session needed): mint an mfa session for A and view B's data
    const { createSessionToken } = await import("@/lib/auth/jwt");
    const { putDEK } = await import("@/lib/crypto/dek-cache");
    const { token, jti } = await createSessionToken(A.id, true);
    putDEK(jti, Buffer.from(A.dek), 3_600_000, A.id);
    const ov = await overview({ ...A, token });
    expect(ov.status).toBe(200);
    expect((await row(childId)).lastViewedAt).not.toBeNull();
    void B;
  });

  it("A narrowing back (or B revoking) never leaves un-reciprocated sections served", async () => {
    const { A, B, parentId, childId } = await pair();
    await update(A, parentId, ["accounts", "goals"]);
    await syncFamilyLabels(db, A.id, A.dek);
    const narrowed = await update(A, parentId, ["accounts"]);
    expect(narrowed.status).toBe(200);
    expect(narrowed.json.reconsentRequired).toBe(false);
    expect((await row(parentId)).requiredBackSections).toEqual(["accounts"]);

    // B revokes the reciprocal share => A->B is suspended: nothing served at all
    const { POST: revokePOST } = await import("@/app/api/family/manage/revoke/route");
    const rv = await call(revokePOST, req(`${P}/revoke`, "POST", B, { shareId: childId }));
    expect(rv.status).toBe(200);
    expect((await row(parentId)).status).toBe("suspended");
    const ov = await overview(B);
    expect(ov.json.members.filter((m: any) => m.relation === "shared")).toHaveLength(0);
    void and;
    void sql;
  });
});
