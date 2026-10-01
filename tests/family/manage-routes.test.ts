/**
 * P3 manage API - REAL Postgres integration tests (DATABASE_URL must target a *_test DB).
 *
 * Routes are invoked as real handlers with real session JWTs + DEK cache entries; only the mail
 * transport and a failure-injection seam on syncFamilyLabels are mocked. Guards are never mocked.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const h = vi.hoisted(() => ({
  mails: [] as Array<{ to: string; subject: string; html: string; text?: string }>,
  failMail: false,
  failSyncOnce: false,
}));

vi.mock("@/lib/email", async (orig) => {
  const actual = await orig<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: async (m: { to: string; subject: string; html: string; text?: string }) => {
      if (h.failMail) throw new Error("smtp down");
      h.mails.push(m);
    },
  };
});
vi.mock("@/lib/family/sweep", async (orig) => {
  const actual = await orig<typeof import("@/lib/family/sweep")>();
  return {
    ...actual,
    syncFamilyLabels: (...args: Parameters<typeof actual.syncFamilyLabels>) => {
      if (h.failSyncOnce) {
        h.failSyncOnce = false;
        throw new Error("injected failure mid-transaction");
      }
      return actual.syncFamilyLabels(...args);
    },
  };
});

import { db } from "@/db";
import {
  accounts,
  goals,
  familyShares,
  familyInvites,
  familyKeyGrants,
  familySectionKeys,
  familyLabels,
  userKeypairs,
} from "@/db/schema-pg";
import { createSessionToken } from "@/lib/auth/jwt";
import { putDEK } from "@/lib/crypto/dek-cache";
import { generateDEK, encryptField } from "@/lib/crypto/envelope";
import { decryptLabel, buildLabelAAD } from "@/lib/crypto/family-crypto";
import { getOrCreateApiKey } from "@/lib/api-auth";
import { withSectionKeys, getUserPrivateKeyHex } from "@/lib/family/grant";
import { syncFamilyLabels } from "@/lib/family/sweep";
import { hashInviteToken } from "@/lib/family/invite-token";
import { bootstrapFamilyTestDb, resetFamilyTestDb, shutdownFamilyTestDb, createTestUser } from "./family-fixtures";

import { POST as invitePOST } from "@/app/api/family/manage/invite/route";
import { POST as acceptPOST } from "@/app/api/family/manage/accept/route";
import { POST as declinePOST } from "@/app/api/family/manage/decline/route";
import { POST as resendPOST } from "@/app/api/family/manage/resend/route";
import { POST as revokePOST } from "@/app/api/family/manage/revoke/route";
import { PUT as updatePUT } from "@/app/api/family/manage/update-sections/route";
import { GET as listGET } from "@/app/api/family/manage/list/route";

interface TU {
  id: string;
  email: string;
  dek: Buffer;
  token: string;
}

let seq = 0;
const uniq = (p: string) => `${p}${Date.now().toString(36)}${seq++}@fam3.test`;

async function mkUser(prefix: string, opts: { locked?: boolean; name?: string } = {}): Promise<TU> {
  const email = uniq(prefix);
  const id = await createTestUser(email);
  if (opts.name) await db.execute(sql`UPDATE users SET display_name = ${opts.name} WHERE id = ${id}`);
  const dek = generateDEK();
  const { token, jti } = await createSessionToken(id, true);
  if (!opts.locked) putDEK(jti, Buffer.from(dek), 3_600_000, id);
  return { id, email, dek, token };
}

function req(path: string, method: string, user: TU | null, body?: unknown, headers: Record<string, string> = {}) {
  const hd = new Headers({ "content-type": "application/json", origin: "http://localhost", ...headers });
  if (user) hd.set("cookie", `pf_session=${user.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: hd,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const P = "/api/family/manage";

async function call(handler: (r: NextRequest) => Promise<Response>, r: NextRequest) {
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

const invite = (u: TU, viewerEmail: string, sections: string[], extra: Record<string, unknown> = {}) =>
  call(invitePOST, req(`${P}/invite`, "POST", u, { viewerEmail, sections, ...extra }));
const accept = (u: TU, token: string, extra: Record<string, unknown> = {}) =>
  call(acceptPOST, req(`${P}/accept`, "POST", u, { token, ...extra }));
const revoke = (u: TU, shareId: string) => call(revokePOST, req(`${P}/revoke`, "POST", u, { shareId }));
const update = (u: TU, shareId: string, sections: string[]) =>
  call(updatePUT, req(`${P}/update-sections`, "PUT", u, { shareId, sections }));
const list = (u: TU) => call(listGET, req(`${P}/list`, "GET", u));

function lastTokenTo(email: string): string {
  const m = [...h.mails].reverse().find((x) => x.to === email);
  const t = m?.text?.match(/token=([0-9a-f]{64})/)?.[1];
  if (!t) throw new Error("no invite mail for " + email);
  return t;
}

/** invite + accept; returns share id and token */
async function inviteAndAccept(owner: TU, viewer: TU, sections: string[], extra: Record<string, unknown> = {}, acceptExtra = {}) {
  const inv = await invite(owner, viewer.email, sections, extra);
  expect(inv.status).toBe(201);
  const token = lastTokenTo(viewer.email);
  const acc = await accept(viewer, token, acceptExtra);
  expect(acc.status).toBe(200);
  return { shareId: inv.json.shareId as string, token };
}

const status = async (shareId: string) =>
  (await db.select().from(familyShares).where(eq(familyShares.id, shareId)))[0]?.status;
const grantsOf = (shareId: string) => db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, shareId));
const keysOf = (ownerId: string, section: string) =>
  db.select().from(familySectionKeys).where(and(eq(familySectionKeys.ownerId, ownerId), eq(familySectionKeys.section, section)));
const labelsOf = (ownerId: string, section: string) =>
  db.select().from(familyLabels).where(and(eq(familyLabels.ownerId, ownerId), eq(familyLabels.section, section)));

/** viewer's unsealed section keys, copied out of the callback (test-only) */
async function viewerKeys(shareId: string, viewer: TU): Promise<Record<string, Buffer>> {
  const priv = (await getUserPrivateKeyHex(db, viewer.id, viewer.dek))!;
  return withSectionKeys(shareId, viewer.id, priv, db, async (k) => {
    const out: Record<string, Buffer> = {};
    for (const [s, b] of Object.entries(k)) out[s] = Buffer.from(b);
    return out;
  });
}
function labelPlain(key: Buffer, ownerId: string, section: string, entityType: string, row: { entityId: number; epoch: number; labelCt: string }) {
  return decryptLabel(key, row.labelCt, buildLabelAAD(ownerId, section, entityType, row.entityId, row.epoch));
}
async function seedAccount(owner: TU, name: string): Promise<number> {
  const [r] = await db.insert(accounts).values({ userId: owner.id, type: "A", currency: "CAD", nameCt: encryptField(owner.dek, name) }).returning({ id: accounts.id });
  return r.id;
}
async function seedGoal(owner: TU, name: string): Promise<number> {
  const [r] = await db.insert(goals).values({ userId: owner.id, type: "savings", targetAmount: 100, nameCt: encryptField(owner.dek, name) }).returning({ id: goals.id });
  return r.id;
}

beforeAll(async () => {
  await bootstrapFamilyTestDb();
});
beforeEach(async () => {
  await resetFamilyTestDb();
  await db.execute(sql`TRUNCATE TABLE accounts, goals RESTART IDENTITY CASCADE`);
  h.mails.length = 0;
  h.failMail = false;
  h.failSyncOnce = false;
});
afterAll(async () => {
  await shutdownFamilyTestDb();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lifecycle: invite -> accept -> list -> update-sections -> revoke -> resend/decline", () => {
  it("runs the whole lifecycle and activates grants at the owner's next sweep", async () => {
    const A = await mkUser("a", { name: "Alice" });
    const B = await mkUser("b", { name: "Bob" });
    await seedAccount(A, "Checking");
    await seedGoal(A, "House");

    const inv = await invite(A, B.email, ["accounts", "goals"]);
    expect(inv.status).toBe(201);
    expect(Object.keys(inv.json)).toEqual(["shareId"]);
    const shareId = inv.json.shareId;
    expect(await status(shareId)).toBe("pending");
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0].to).toBe(B.email);

    const token = lastTokenTo(B.email);
    const acc = await accept(B, token);
    expect(acc.status).toBe(200);
    expect(acc.json).toEqual({ shareId });
    expect(await status(shareId)).toBe("awaiting_owner_unlock");
    expect(await grantsOf(shareId)).toHaveLength(0); // owner offline: nothing sealed yet
    // owner is notified (display name only, owner mailbox), invitee is not
    expect(h.mails.some((m) => m.to === A.email && /Bob/.test(m.subject))).toBe(true);

    // owner sweep (login) finalizes: promotes + seals to the viewer
    await syncFamilyLabels(db, A.id, A.dek);
    expect(await status(shareId)).toBe("active");
    const grants = await grantsOf(shareId);
    expect(grants.map((g) => g.section).sort()).toEqual(["accounts", "goals"]);
    expect(grants.every((g) => g.status === "ready" && g.keySealed)).toBe(true);
    const keys = await viewerKeys(shareId, B);
    const accLabel = (await labelsOf(A.id, "accounts"))[0];
    expect(labelPlain(keys.accounts, A.id, "accounts", "accounts", accLabel)).toBe("Checking");

    // list: both sides
    const la = await list(A);
    expect(la.status).toBe(200);
    expect(la.json.outgoing).toHaveLength(1);
    expect(la.json.outgoing[0]).toMatchObject({ id: shareId, role: "owner", status: "active", sections: ["accounts", "goals"] });
    const lb = await list(B);
    expect(lb.json.incoming).toHaveLength(1);
    expect(lb.json.incoming[0]).toMatchObject({ id: shareId, role: "viewer", counterparty: { name: "Alice" } });
    expect(lb.json.outgoing).toHaveLength(0);

    // widen: only the NEW section is sealed, existing grants untouched
    const before = await grantsOf(shareId);
    const w = await update(A, shareId, ["accounts", "goals", "loans"]);
    expect(w.status).toBe(200);
    expect(w.json.sections).toEqual(["accounts", "goals", "loans"]);
    const afterW = await grantsOf(shareId);
    expect(afterW.map((g) => g.section).sort()).toEqual(["accounts", "goals", "loans"]);
    for (const g of before) {
      const same = afterW.find((x) => x.section === g.section)!;
      expect(same.epoch).toBe(g.epoch);
      expect(same.keySealed).toBe(g.keySealed);
    }

    // narrow: dropped section rotated + viewer's grant gone
    const oldGoalsKey = (await viewerKeys(shareId, B)).goals;
    const goalRow = (await labelsOf(A.id, "goals"))[0];
    expect(labelPlain(oldGoalsKey, A.id, "goals", "goals", goalRow)).toBe("House");
    const n = await update(A, shareId, ["accounts"]);
    expect(n.status).toBe(200);
    const afterN = await grantsOf(shareId);
    expect(afterN.map((g) => g.section)).toEqual(["accounts"]);
    // goals no longer shared with anyone: key + sidecar deleted
    expect(await keysOf(A.id, "goals")).toHaveLength(0);
    expect(await labelsOf(A.id, "goals")).toHaveLength(0);
    expect(await keysOf(A.id, "loans")).toHaveLength(0);
    const accKeys = await keysOf(A.id, "accounts");
    expect(accKeys.map((k) => k.epoch)).toEqual([1]); // untouched section not rotated

    // revoke (owner) -> rotation done, everything gone
    const r = await revoke(A, shareId);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: "revoked", rotation: "done" });
    expect(await status(shareId)).toBe("revoked");
    expect(await grantsOf(shareId)).toHaveLength(0);
    expect(h.mails.some((m) => m.to === B.email && /revoked/i.test(m.subject))).toBe(true);
    await expect(viewerKeys(shareId, B)).rejects.toThrow();
    // double revoke -> 409
    expect((await revoke(A, shareId)).status).toBe(409);

    // after revoke the viewer's token / invite cannot be replayed
    expect((await accept(B, token)).status).toBe(410);
  });

  it("revoke rotates: old key cannot open post-rotation labels, remaining viewer can, grants deleted", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const C = await mkUser("c");
    await seedAccount(A, "Checking");
    const sB = (await inviteAndAccept(A, B, ["accounts"])).shareId;
    const sC = (await inviteAndAccept(A, C, ["accounts"])).shareId;
    await syncFamilyLabels(db, A.id, A.dek);
    expect(await status(sB)).toBe("active");
    expect(await status(sC)).toBe("active");

    const oldK = (await viewerKeys(sB, B)).accounts;
    const epoch1 = (await keysOf(A.id, "accounts"))[0].epoch;
    expect(epoch1).toBe(1);

    const r = await revoke(A, sB);
    expect(r.json.rotation).toBe("done");

    const keysNow = await keysOf(A.id, "accounts");
    expect(keysNow.map((k) => k.epoch)).toEqual([2]);
    expect(await grantsOf(sB)).toHaveLength(0);
    const rows = await labelsOf(A.id, "accounts");
    expect(rows.length).toBe(1);
    expect(rows.every((x) => x.epoch === 2)).toBe(true);
    for (const row of rows) {
      expect(() => labelPlain(oldK, A.id, "accounts", "accounts", row)).toThrow(); // revoked viewer's key is dead
    }
    const cK = (await viewerKeys(sC, C)).accounts;
    expect(labelPlain(cK, A.id, "accounts", "accounts", rows[0])).toBe("Checking");

    // a label written AFTER revocation is unreadable with the old key, readable by C
    await seedAccount(A, "Brand new");
    await syncFamilyLabels(db, A.id, A.dek);
    const rows2 = await labelsOf(A.id, "accounts");
    expect(rows2).toHaveLength(2);
    for (const row of rows2) {
      expect(() => labelPlain(oldK, A.id, "accounts", "accounts", row)).toThrow();
      expect(labelPlain(cK, A.id, "accounts", "accounts", row)).toMatch(/Checking|Brand new/);
    }

    // last viewer revoked: section key + sidecar removed entirely
    expect((await revoke(A, sC)).status).toBe(200);
    expect(await keysOf(A.id, "accounts")).toHaveLength(0);
    expect(await labelsOf(A.id, "accounts")).toHaveLength(0);
  });

  it("viewer-initiated leave keeps the grant rows as the rotation marker; owner's next sweep rotates them", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const C = await mkUser("c");
    await seedAccount(A, "Checking");
    const sB = (await inviteAndAccept(A, B, ["accounts"])).shareId;
    await inviteAndAccept(A, C, ["accounts"]);
    await syncFamilyLabels(db, A.id, A.dek);
    const oldK = (await viewerKeys(sB, B)).accounts;

    const leave = await revoke(B, sB);
    expect(leave.status).toBe(200);
    expect(leave.json.rotation).toBe("deferred");
    expect(await status(sB)).toBe("revoked");
    expect((await keysOf(A.id, "accounts"))[0].epoch).toBe(1);
    await expect(viewerKeys(sB, B)).rejects.toThrow(); // API-level: denied immediately
    expect(h.mails.some((m) => m.to === A.email && /left/i.test(m.subject))).toBe(true);

    await syncFamilyLabels(db, A.id, A.dek); // owner's next sweep
    expect((await keysOf(A.id, "accounts"))[0].epoch).toBe(2);
    expect(await grantsOf(sB)).toHaveLength(0);
    for (const row of await labelsOf(A.id, "accounts")) {
      expect(() => labelPlain(oldK, A.id, "accounts", "accounts", row)).toThrow();
    }
  });

  it("narrowing rotates the dropped section; widening seals new sections ONLY to that viewer", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const C = await mkUser("c");
    await seedAccount(A, "Checking");
    await seedGoal(A, "House");
    const sB = (await inviteAndAccept(A, B, ["accounts", "goals"])).shareId;
    const sC = (await inviteAndAccept(A, C, ["accounts", "goals"])).shareId;
    await syncFamilyLabels(db, A.id, A.dek);

    const bOldGoals = (await viewerKeys(sB, B)).goals;
    // narrow B: drop goals (C still has it) => goals rotated to epoch 2, accounts untouched
    expect((await update(A, sB, ["accounts"])).status).toBe(200);
    expect((await keysOf(A.id, "goals")).map((k) => k.epoch)).toEqual([2]);
    expect((await keysOf(A.id, "accounts")).map((k) => k.epoch)).toEqual([1]);
    expect((await grantsOf(sB)).map((g) => g.section)).toEqual(["accounts"]);
    const goalRow = (await labelsOf(A.id, "goals"))[0];
    expect(goalRow.epoch).toBe(2);
    expect(() => labelPlain(bOldGoals, A.id, "goals", "goals", goalRow)).toThrow();
    expect(labelPlain((await viewerKeys(sC, C)).goals, A.id, "goals", "goals", goalRow)).toBe("House");

    // widen C only with loans-less example: give B goals back, C must not gain anything new
    const cBefore = await grantsOf(sC);
    expect((await update(A, sB, ["accounts", "goals"])).status).toBe(200);
    const cAfter = await grantsOf(sC);
    expect(cAfter.map((g) => [g.section, g.epoch, g.keySealed])).toEqual(cBefore.map((g) => [g.section, g.epoch, g.keySealed]));
    expect((await grantsOf(sB)).map((g) => g.section).sort()).toEqual(["accounts", "goals"]);
    // a section only B is widened into: C has no grant for it
    expect((await update(A, sB, ["accounts", "goals", "loans"])).status).toBe(200);
    expect((await grantsOf(sB)).map((g) => g.section)).toContain("loans");
    expect((await grantsOf(sC)).map((g) => g.section)).not.toContain("loans");
  });

  it("resend invalidates the old token and issues a fresh single-use one; decline works by token", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const inv = await invite(A, B.email, ["accounts"]);
    const t1 = lastTokenTo(B.email);
    const rs = await call(resendPOST, req(`${P}/resend`, "POST", A, { shareId: inv.json.shareId }));
    expect(rs.status).toBe(200);
    const t2 = lastTokenTo(B.email);
    expect(t2).not.toBe(t1);
    expect((await accept(B, t1)).status).toBe(410);
    const [row] = await db.select().from(familyInvites).where(eq(familyInvites.shareId, inv.json.shareId));
    expect(row.sendCount).toBe(2);
    expect(row.tokenHash).toBe(hashInviteToken(t2));

    // a non-owner cannot resend
    const X = await mkUser("x");
    expect((await call(resendPOST, req(`${P}/resend`, "POST", X, { shareId: inv.json.shareId }))).status).toBe(404);

    // decline (right email only)
    const bad = await call(declinePOST, req(`${P}/decline`, "POST", X, { token: t2 }));
    expect(bad.status).toBe(410);
    expect(await status(inv.json.shareId)).toBe("pending");
    const ok = await call(declinePOST, req(`${P}/decline`, "POST", B, { token: t2 }));
    expect(ok.status).toBe(200);
    expect(await status(inv.json.shareId)).toBe("declined");
    expect((await accept(B, t2)).status).toBe(410); // consumed
    expect((await call(resendPOST, req(`${P}/resend`, "POST", A, { shareId: inv.json.shareId }))).status).toBe(404);
    expect((await list(A)).json.outgoing[0].status).toBe("declined");
  });

  it("re-inviting the same address while pending refreshes the single pending share and kills the old token", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const first = await invite(A, B.email, ["accounts"]);
    const t1 = lastTokenTo(B.email);
    const second = await invite(A, B.email, ["accounts", "goals"]);
    expect(second.json.shareId).toBe(first.json.shareId);
    expect(await db.select().from(familyShares).where(eq(familyShares.ownerId, A.id))).toHaveLength(1);
    expect((await accept(B, t1)).status).toBe(410);
    expect((await accept(B, lastTokenTo(B.email))).status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("anti-enumeration", () => {
  it("invite to a registered vs unknown address: identical status+body+headers shape, same DB footprint, same mail", async () => {
    const A = await mkUser("a");
    const known = await mkUser("known");
    const unknownEmail = uniq("nobody");

    const r1 = await invite(A, known.email, ["accounts"]);
    const r2 = await invite(A, unknownEmail, ["accounts"]);
    expect(r1.status).toBe(r2.status);
    expect(r1.status).toBe(201);
    expect(Object.keys(r1.json)).toEqual(Object.keys(r2.json));
    expect(r1.text.length).toBe(r2.text.length); // uuid-only body
    expect(r1.headers.get("content-type")).toBe(r2.headers.get("content-type"));
    expect([...r1.headers.keys()].sort()).toEqual([...r2.headers.keys()].sort());

    const shares = await db.select().from(familyShares).where(eq(familyShares.ownerId, A.id));
    expect(shares).toHaveLength(2);
    for (const s of shares) {
      expect(s.status).toBe("pending");
      expect(s.viewerId).toBeNull(); // never resolved at invite time
    }
    const invs = await db.select().from(familyInvites);
    expect(invs).toHaveLength(2);
    expect(invs.every((i) => i.consumedAt === null && i.sendCount === 1)).toBe(true);
    expect(h.mails.map((m) => m.to).sort()).toEqual([known.email, unknownEmail].sort());
    expect(h.mails[0].subject).toBe(h.mails[1].subject);
  });

  it("per-email 429 has the same body as the per-user 429 (no cross-owner invite oracle)", async () => {
    const A = await mkUser("a");
    const target = uniq("target");
    const others = await Promise.all([mkUser("o1"), mkUser("o2"), mkUser("o3"), mkUser("o4")]);
    const outs = [];
    for (const o of others) outs.push(await invite(o, target, ["accounts"]));
    expect(outs.slice(0, 3).map((o) => o.status)).toEqual([201, 201, 201]);
    expect(outs[3].status).toBe(429);
    expect(outs[3].headers.get("retry-after")).toBeTruthy();
    // per-user limit: 10 / day
    let last;
    for (let i = 0; i < 11; i++) last = await invite(A, uniq("u"), ["accounts"]);
    expect(last!.status).toBe(429);
    expect(last!.json).toEqual(outs[3].json);
  });

  it("accept: unknown token, foreign-email session, self and consumed all return the SAME 410 body", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const X = await mkUser("x");
    await invite(A, B.email, ["accounts"]);
    const token = lastTokenTo(B.email);

    const unknown = await accept(B, "f".repeat(64));
    const foreign = await accept(X, token);
    const self = await accept(A, token);
    expect([unknown.status, foreign.status, self.status]).toEqual([410, 410, 410]);
    expect(foreign.text).toBe(unknown.text);
    expect(self.text).toBe(unknown.text);

    // foreign attempt must not have consumed or advanced anything
    const [inv] = await db.select().from(familyInvites);
    expect(inv.consumedAt).toBeNull();
    expect(await status(inv.shareId)).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("accept: email match, expiry, single use, verified email, lock", () => {
  it("expired invite -> 410 and nothing changes (expiry enforced)", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const { } = await invite(A, B.email, ["accounts"]);
    const token = lastTokenTo(B.email);
    await db.execute(sql`UPDATE family_invites SET expires_at = NOW() - INTERVAL '1 minute'`);
    const r = await accept(B, token);
    expect(r.status).toBe(410);
    expect(r.json.error).toBe("Invitation expired");
    const [inv] = await db.select().from(familyInvites);
    expect(inv.consumedAt).toBeNull();
    expect(await status(inv.shareId)).toBe("pending");
  });

  it("wrong-email session cannot accept even with a valid token (email match enforced)", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const X = await mkUser("x");
    await invite(A, B.email, ["accounts"]);
    const token = lastTokenTo(B.email);
    const r = await accept(X, token);
    expect(r.status).toBe(410);
    const [s] = await db.select().from(familyShares);
    expect(s.status).toBe("pending");
    expect(s.viewerId).toBeNull();
    const [inv] = await db.select().from(familyInvites);
    expect(inv.consumedAt).toBeNull();
  });

  it("email comparison is case-insensitive on the account side; unverified email is refused", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    await invite(A, B.email, ["accounts"]);
    const token = lastTokenTo(B.email);
    await db.execute(sql`UPDATE users SET email_verified = 0 WHERE id = ${B.id}`);
    expect((await accept(B, token)).status).toBe(403);
    await db.execute(sql`UPDATE users SET email_verified = 1, email = ${B.email.toUpperCase()} WHERE id = ${B.id}`);
    expect((await accept(B, token)).status).toBe(200);
  });

  it("single use: second accept 410; two concurrent accepts => exactly one 200", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    await invite(A, B.email, ["accounts"]);
    const token = lastTokenTo(B.email);
    const rs = await Promise.all([accept(B, token), accept(B, token)]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 410]);
    expect((await accept(B, token)).status).toBe(410);
    expect((await db.select().from(familyShares))).toHaveLength(1);
  });

  it("locked session (no DEK) gets 423 and changes nothing", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b", { locked: true });
    await invite(A, B.email, ["accounts"]);
    const r = await accept(B, lastTokenTo(B.email));
    expect(r.status).toBe(423);
    expect(await status((await db.select().from(familyShares))[0].id)).toBe("pending");
  });

  it("tokens are stored only as hashes; raw token appears nowhere in the DB", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    await invite(A, B.email, ["accounts"]);
    const token = lastTokenTo(B.email);
    const [inv] = await db.select().from(familyInvites);
    expect(inv.tokenHash).toBe(hashInviteToken(token));
    expect(inv.tokenHash).not.toBe(token);
    const dump = await db.execute(sql`SELECT row_to_json(t)::text AS j FROM family_invites t UNION ALL SELECT row_to_json(s)::text FROM family_shares s`);
    expect(JSON.stringify(dump.rows)).not.toContain(token);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("must-share-back", () => {
  it("accept creates the reciprocal atomically, sealed to the owner; shrink below required => 409; widen ok", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    await seedAccount(B, "Bob Checking");
    const { shareId } = await inviteAndAccept(A, B, ["accounts"], { mustShareBack: true }, { shareBackSections: ["goals"] });
    expect(await status(shareId)).toBe("awaiting_owner_unlock");

    const [rec] = await db.select().from(familyShares).where(eq(familyShares.reciprocalOf, shareId));
    expect(rec.ownerId).toBe(B.id);
    expect(rec.viewerId).toBe(A.id);
    expect(rec.status).toBe("active");
    expect([...rec.sections].sort()).toEqual(["accounts", "goals"]);
    expect(rec.viewerEmailLower).toBe(A.email.toLowerCase());
    // grants sealed to A (owner of parent) and A can open B's labels
    const g = await grantsOf(rec.id);
    expect(g.map((x) => x.section).sort()).toEqual(["accounts", "goals"]);
    const keys = await viewerKeys(rec.id, A);
    const row = (await labelsOf(B.id, "accounts"))[0];
    expect(labelPlain(keys.accounts, B.id, "accounts", "accounts", row)).toBe("Bob Checking");

    // B cannot shrink below the required set
    const shrink = await update(B, rec.id, ["goals"]);
    expect(shrink.status).toBe(409);
    expect(shrink.json.requiredSections).toEqual(["accounts"]);
    expect((await update(B, rec.id, ["accounts", "goals", "loans"])).status).toBe(200);

    // DB trigger repeats the check even if the app check is bypassed
    await expect(db.execute(sql`UPDATE family_shares SET sections = '{goals}' WHERE id = ${rec.id}`)).rejects.toThrow();
  });

  it("B revoking the reciprocal suspends the parent; A revoking the parent leaves the reciprocal", async () => {
    const A = await mkUser("a", { name: "Alice" });
    const B = await mkUser("b", { name: "Bob" });
    const { shareId } = await inviteAndAccept(A, B, ["accounts"], { mustShareBack: true });
    await syncFamilyLabels(db, A.id, A.dek);
    expect(await status(shareId)).toBe("active");
    const [rec] = await db.select().from(familyShares).where(eq(familyShares.reciprocalOf, shareId));

    expect((await revoke(B, rec.id)).status).toBe(200);
    expect(await status(shareId)).toBe("suspended");
    expect(h.mails.some((m) => m.to === A.email && /suspended/i.test(m.subject))).toBe(true);
    await expect(viewerKeys(shareId, B)).rejects.toThrow(); // B lost the view of A

    // second pair: A revokes the parent => reciprocal stays active
    const C = await mkUser("c");
    const { shareId: p2 } = await inviteAndAccept(A, C, ["accounts"], { mustShareBack: true });
    await syncFamilyLabels(db, A.id, A.dek);
    expect((await revoke(A, p2)).status).toBe(200);
    const [rec2] = await db.select().from(familyShares).where(eq(familyShares.reciprocalOf, p2));
    expect(rec2.status).toBe("active");
    // constraint lifted: C may now shrink freely
    expect((await update(C, rec2.id, ["goals"])).status).toBe(200);
  });

  it("ATOMIC: failure injected mid-transaction leaves no share, grants, keys or consumed invite", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    await seedAccount(B, "Bob Checking");
    await invite(A, B.email, ["accounts"], { mustShareBack: true });
    const token = lastTokenTo(B.email);
    const [parent] = await db.select().from(familyShares);

    h.failSyncOnce = true; // fires inside the accept tx, AFTER consume+accept+reciprocal insert
    const r = await accept(B, token);
    expect(r.status).toBe(500);

    expect((await db.select().from(familyShares)).map((s) => [s.id, s.status])).toEqual([[parent.id, "pending"]]);
    expect(await db.select().from(familyShares).where(eq(familyShares.reciprocalOf, parent.id))).toHaveLength(0);
    const [inv] = await db.select().from(familyInvites);
    expect(inv.consumedAt).toBeNull();
    expect(await db.select().from(familyKeyGrants)).toHaveLength(0);
    expect(await db.select().from(familySectionKeys)).toHaveLength(0);
    expect(await db.select().from(familyLabels)).toHaveLength(0);

    // the same token still works afterwards (nothing was burned)
    expect((await accept(B, token)).status).toBe(200);
    expect(await db.select().from(familyShares)).toHaveLength(2);
  });

  it("existing conflicting share maps to 409 and rolls back", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    // B already shares with A
    await inviteAndAccept(B, A, ["accounts"]);
    await syncFamilyLabels(db, B.id, B.dek);
    await invite(A, B.email, ["accounts"], { mustShareBack: true });
    const r = await accept(B, lastTokenTo(B.email));
    expect(r.status).toBe(409);
    const pend = await db.select().from(familyShares).where(and(eq(familyShares.ownerId, A.id)));
    expect(pend[0].status).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("authorization", () => {
  it("every manage route rejects api_key credentials with 403 (header, bearer and query forms)", async () => {
    const A = await mkUser("a");
    const apiKey = (await getOrCreateApiKey(A.id, A.dek))!;
    const sid = "00000000-0000-4000-8000-000000000000";
    const cases: Array<[string, (r: NextRequest) => Promise<Response>, string, unknown]> = [
      ["invite", invitePOST, "POST", { viewerEmail: "z@z.com", sections: ["accounts"] }],
      ["accept", acceptPOST, "POST", { token: "x" }],
      ["decline", declinePOST, "POST", { token: "x" }],
      ["resend", resendPOST, "POST", { shareId: sid }],
      ["revoke", revokePOST, "POST", { shareId: sid }],
      ["update-sections", updatePUT as any, "PUT", { shareId: sid, sections: ["accounts"] }],
      ["list", listGET as any, "GET", undefined],
    ];
    for (const [name, handler, method, body] of cases) {
      for (const form of ["x-api-key", "bearer", "query"] as const) {
        const headers: Record<string, string> = {};
        let path = `${P}/${name}`;
        if (form === "x-api-key") headers["x-api-key"] = apiKey;
        if (form === "bearer") headers["authorization"] = `Bearer ${apiKey}`;
        if (form === "query") path += `?token=${apiKey}`;
        const r = await call(handler, req(path, method, null, body, headers));
        // ?token= is not an accepted API-key carrier (validateApiKey ignores it): never authenticated.
        if (form === "query") expect([401, 403], `${name}/${form}`).toContain(r.status);
        else expect(r.status, `${name}/${form}`).toBe(403);
      }
    }
    expect(await db.select().from(familyShares)).toHaveLength(0);
  });

  it("unauthenticated -> 401 on every route", async () => {
    const sid = "00000000-0000-4000-8000-000000000000";
    for (const [name, handler, method, body] of [
      ["invite", invitePOST, "POST", { viewerEmail: "z@z.com", sections: ["accounts"] }],
      ["accept", acceptPOST, "POST", { token: "x" }],
      ["decline", declinePOST, "POST", { token: "x" }],
      ["resend", resendPOST, "POST", { shareId: sid }],
      ["revoke", revokePOST, "POST", { shareId: sid }],
      ["update-sections", updatePUT, "PUT", { shareId: sid, sections: ["accounts"] }],
      ["list", listGET, "GET", undefined],
    ] as Array<[string, any, string, unknown]>) {
      expect((await call(handler, req(`${P}/${name}`, method, null, body))).status, name).toBe(401);
    }
  });

  it("owner/viewer separation: viewer cannot update/resend; outsider cannot revoke; owner cannot accept their own invite", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const X = await mkUser("x");
    const { shareId, token } = await inviteAndAccept(A, B, ["accounts"]);
    await syncFamilyLabels(db, A.id, A.dek);

    expect((await update(B, shareId, ["accounts", "goals"])).status).toBe(404); // viewer cannot widen
    expect((await call(resendPOST, req(`${P}/resend`, "POST", B, { shareId }))).status).toBe(404);
    expect((await revoke(X, shareId)).status).toBe(404); // outsider
    expect((await update(X, shareId, ["accounts"])).status).toBe(404);
    expect((await accept(A, token)).status).toBe(410);
    expect((await grantsOf(shareId)).map((g) => g.section)).toEqual(["accounts"]);
    // viewer may leave their own share
    expect((await revoke(B, shareId)).status).toBe(200);
  });

  it("zod strict: unknown fields, unknown/ungrantable sections and bad ids are 400 (never 500)", async () => {
    const A = await mkUser("a");
    expect((await invite(A, uniq("z"), ["accounts"], { extra: 1 })).status).toBe(400);
    expect((await invite(A, uniq("z"), ["payee"])).status).toBe(400);
    expect((await invite(A, uniq("z"), [])).status).toBe(400);
    expect((await invite(A, "not-an-email", ["accounts"])).status).toBe(400);
    expect((await call(revokePOST, req(`${P}/revoke`, "POST", A, { shareId: "x" }))).status).toBe(400);
    expect((await call(revokePOST, req(`${P}/revoke`, "POST", A, { shareId: "00000000-0000-4000-8000-000000000000", force: true }))).status).toBe(400);
    const bad = await call(invitePOST, req(`${P}/invite`, "POST", A, { viewerEmail: "x@y.com", sections: ["accounts"], mustShareBack: "yes" }));
    expect(bad.status).toBe(400);
    expect(bad.text).not.toContain("yes"); // submitted values are not echoed
  });

  it("owner cannot invite themselves or re-invite an address that already has a live share", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    expect((await invite(A, A.email, ["accounts"])).status).toBe(409);
    await inviteAndAccept(A, B, ["accounts"]);
    expect((await invite(A, B.email, ["accounts"])).status).toBe(409);
  });

  it("locked owner (no DEK): invite 423; update that needs keys 423; revoke still succeeds (deferred rotation)", async () => {
    const A = await mkUser("a");
    const B = await mkUser("b");
    const L = await mkUser("l", { locked: true });
    expect((await invite(L, uniq("z"), ["accounts"])).status).toBe(423);
    await seedAccount(A, "Checking");
    const { shareId } = await inviteAndAccept(A, B, ["accounts"]);
    await syncFamilyLabels(db, A.id, A.dek);
    // same owner but session without DEK
    const A2 = { ...A, ...(await (async () => { const { token } = await createSessionToken(A.id, true); return { token }; })()) };
    expect((await update(A2, shareId, ["accounts", "goals"])).status).toBe(423);
    const r = await revoke(A2, shareId);
    expect(r.status).toBe(200);
    expect(r.json.rotation).toBe("deferred");
    await syncFamilyLabels(db, A.id, A.dek);
    expect(await grantsOf(shareId)).toHaveLength(0);
    expect((await keysOf(A.id, "accounts"))).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("CSRF is enforced for the manage routes by middleware", () => {
  it("cross-origin cookie POST/PUT is rejected before the handler; same-origin passes; Bearer-less no-cookie passes to auth", async () => {
    const { middleware } = await import("@/middleware");
    const A = await mkUser("a");
    for (const [name, method] of [["invite", "POST"], ["accept", "POST"], ["decline", "POST"], ["resend", "POST"], ["revoke", "POST"], ["update-sections", "PUT"]] as const) {
      const evil = middleware(req(`${P}/${name}`, method, A, {}, { origin: "https://evil.example" }));
      expect(evil.status, name).toBe(403);
      const noOrigin = new NextRequest(`http://localhost${P}/${name}`, { method, headers: { cookie: `pf_session=${A.token}` } });
      expect(middleware(noOrigin).status, name + " no origin").toBe(403);
      const ok = middleware(req(`${P}/${name}`, method, A, {}));
      expect(ok.status, name + " same origin").not.toBe(403);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("no secret material in responses, logs or emails; email failures are non-fatal", () => {
  it("responses/logs/emails never contain key material, token hashes or other users' emails/ids", async () => {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "))),
    );
    try {
      const A = await mkUser("a", { name: "Alice" });
      const B = await mkUser("b", { name: "Bob" });
      const C = await mkUser("c");
      await seedAccount(A, "Checking");
      const outs: string[] = [];
      const inv = await invite(A, B.email, ["accounts"]);
      outs.push(inv.text);
      const token = lastTokenTo(B.email);
      outs.push((await accept(B, token)).text);
      await syncFamilyLabels(db, A.id, A.dek);
      outs.push((await update(A, inv.json.shareId, ["accounts"])).text);
      const la = await list(A);
      const lb = await list(B);
      outs.push(la.text, lb.text);
      outs.push((await accept(C, token)).text);
      outs.push((await revoke(A, inv.json.shareId)).text);

      const [invRow] = await db.select().from(familyInvites);
      const [kp] = await db.select().from(userKeypairs).where(eq(userKeypairs.userId, B.id));
      const [keyRow] = await db.select().from(familySectionKeys).where(eq(familySectionKeys.ownerId, A.id)).catch(() => [undefined as any]);
      const forbidden = [
        invRow.tokenHash, token, "tokenHash", "token_hash", "keySealed", "key_sealed", "keyWrapped", "key_wrapped",
        "privWrapped", "priv_wrapped", "x25519", kp.x25519Pub, kp.privWrapped,
        ...(keyRow ? [keyRow.keyWrapped] : []),
      ];
      for (const body of outs) for (const f of forbidden) expect(body).not.toContain(f);

      // other users' identity: B's list must not show A's email or any user id; A's must not show B's id
      expect(lb.text).not.toContain(A.email);
      expect(lb.text).not.toContain(A.id);
      expect(la.text).not.toContain(B.id);
      expect(la.text).not.toContain(C.email);
      for (const body of outs) expect(body).not.toContain(C.id);

      // logs: no tokens, hashes, emails
      const all = logs.join("\n");
      for (const f of [token, invRow.tokenHash, A.email, B.email, C.email]) expect(all).not.toContain(f);

      // emails carry no key material or amounts; invite link only
      for (const m of h.mails) {
        const blob = m.html + (m.text ?? "") + m.subject;
        for (const f of [invRow.tokenHash, "keySealed", kp.x25519Pub, kp.privWrapped]) expect(blob).not.toContain(f);
        expect(blob).not.toMatch(/\$\s?\d/);
      }
      // the revoked-mail / accepted-mail never include the OTHER party's email address
      const acceptedMail = h.mails.find((m) => /accepted/i.test(m.subject))!;
      expect(acceptedMail.html + acceptedMail.text).not.toContain(B.email);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it("send failure is non-fatal for invite, resend, accept notification and revoke; nothing leaks to logs", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
    try {
      const A = await mkUser("a");
      const B = await mkUser("b");
      h.failMail = true;
      const inv = await invite(A, B.email, ["accounts"]);
      expect(inv.status).toBe(201);
      expect(h.mails).toHaveLength(0);
      const [row] = await db.select().from(familyInvites);
      expect(row.tokenHash).toHaveLength(64);
      expect((await call(resendPOST, req(`${P}/resend`, "POST", A, { shareId: inv.json.shareId }))).status).toBe(200);
      h.failMail = false;
      expect((await call(resendPOST, req(`${P}/resend`, "POST", A, { shareId: inv.json.shareId }))).status).toBe(200);
      const token = lastTokenTo(B.email);
      h.failMail = true;
      expect((await accept(B, token)).status).toBe(200);
      expect((await revoke(A, inv.json.shareId)).status).toBe(200);
      const all = logs.join("\n");
      expect(all).not.toContain(token);
      expect(all).not.toContain(B.email);
      expect(all).not.toContain(A.email);
    } finally {
      spy.mockRestore();
    }
  });

  it("invite email goes through src/lib/email sendEmail with the accept link and 7-day notice", async () => {
    const A = await mkUser("a", { name: "Ali <script>" });
    const B = await mkUser("b");
    await invite(A, B.email, ["accounts"]);
    const m = h.mails[0];
    expect(m.to).toBe(B.email);
    expect(m.html).toContain("/family/accept?token=");
    expect(m.html).not.toContain("<script>"); // escaped
    expect(m.html).toContain("7 days");
  });
});
