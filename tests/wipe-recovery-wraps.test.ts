/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { bootstrapTestDb } from "./helpers/portfolio-fixtures";
import { db, schema as s } from "@/db";
import { createUser, wipeUserDataAndRewrap, replaceRecoveryCodes, consumeRecoveryCode, setSessionNotBefore, getSessionNotBefore, revokeAllDevicesExcept } from "@/lib/auth/queries";
import { generateRecoveryCodes, hashRecoveryCode, wrapDEKWithRecoveryCode, unwrapDEKWithRecoveryCode } from "@/lib/auth/recovery-codes";

let uid: string, other: string;
const wrap = () => ({ kekSalt: "a", dekWrapped: "b", dekWrappedIv: "c", dekWrappedTag: "d" });
const mk = async () => (await createUser({ username: "u"+crypto.randomUUID(), passwordHash: "h", kekSalt: "a", dekWrapped: "b", dekWrappedIv: "c", dekWrappedTag: "d" } as any)).id;
beforeAll(async () => { if (!HAS_DB) return; await bootstrapTestDb(); uid = await mk(); other = await mk(); });

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
describe.skipIf(!HAS_DB)("recovery B1 (real Postgres)", () => {
  it("clears devices, prf, unused code wraps in wipe", async () => {
    await db.insert(s.userDevices).values({ id: crypto.randomUUID(), userId: uid, secretHash: crypto.randomUUID(), dekWrapped: "w", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+1e9).toISOString() } as any);
    await db.insert(s.userPasskeys).values({ id: crypto.randomUUID(), userId: uid, publicKey: "pk", dekWrappedPrf: "prf", createdAt: new Date().toISOString() } as any);
    const dek = crypto.randomBytes(32);
    const codes = generateRecoveryCodes(3);
    await replaceRecoveryCodes(uid, codes.map(c => ({ hash: hashRecoveryCode(c.canonical), dekWrapped: wrapDEKWithRecoveryCode(dek, c.canonical) })));
    await wipeUserDataAndRewrap(uid, "newhash", wrap());
    expect((await db.select().from(s.userDevices).where(eq(s.userDevices.userId, uid))).length).toBe(0);
    expect((await db.select().from(s.userPasskeys).where(eq(s.userPasskeys.userId, uid))).every(p => p.dekWrappedPrf === null)).toBe(true);
    const rows = await db.select().from(s.userRecoveryCodes).where(eq(s.userRecoveryCodes.userId, uid));
    expect(rows.length).toBe(3);
    expect(rows.every(r => r.dekWrapped === null && r.usedAt !== null)).toBe(true);
  });
  it("consume atomic + user scoped", async () => {
    const dek = crypto.randomBytes(32);
    const codes = generateRecoveryCodes(8);
    const hashes = codes.map((c) => hashRecoveryCode(c.canonical));
    await replaceRecoveryCodes(uid, codes.map((c, i) => ({ hash: hashes[i], dekWrapped: wrapDEKWithRecoveryCode(dek, c.canonical) })));
    // cross-user must not consume
    expect(await consumeRecoveryCode(other, hashes[0])).toBeNull();
    // many concurrent attempts per code: exactly one winner, and it gets the wrap
    for (let i = 0; i < codes.length; i++) {
      const res = await Promise.all(Array.from({ length: 30 }, () => consumeRecoveryCode(uid, hashes[i])));
      const wins = res.filter((x): x is string => x !== null);
      expect(wins.length).toBe(1);
      expect(unwrapDEKWithRecoveryCode(wins[0], codes[i].canonical)).toEqual(dek);
    }
    // first-use timestamp is never overwritten by later attempts (used_at IS NULL guard)
    const get = async () => (await db.select().from(s.userRecoveryCodes).where(eq(s.userRecoveryCodes.codeHash, hashes[0])))[0];
    const first = await get();
    expect(first.dekWrapped).toBeNull();
    await new Promise((r) => setTimeout(r, 15));
    expect(await consumeRecoveryCode(uid, hashes[0])).toBeNull();
    expect((await get()).usedAt).toBe(first.usedAt);
  });
  it("cutoff roundtrip + revokeExcept scoped", async () => {
    const d = new Date(); const t = d.toISOString(); await setSessionNotBefore(uid, d);
    expect((await getSessionNotBefore(uid))?.getTime()).toBe(d.getTime());
    const mkd = async (u: string) => { const id = crypto.randomUUID(); await db.insert(s.userDevices).values({ id, userId: u, secretHash: crypto.randomUUID(), dekWrapped: "w", createdAt: t, expiresAt: t } as any); return id; };
    const a = await mkd(uid), b = await mkd(uid), o = await mkd(other);
    await revokeAllDevicesExcept(uid, a);
    const g = async (id: string) => (await db.select().from(s.userDevices).where(eq(s.userDevices.id, id)))[0].revokedAt;
    expect(await g(a)).toBeNull(); expect(await g(b)).not.toBeNull(); expect(await g(o)).toBeNull();
  });
});
