/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recovery B2 — trusted-device peek / redeem-without-rotate / rotate (real PG).
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { eq } from "drizzle-orm";

process.env.PF_TRUSTED_DEVICE_DAYS = "30";

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { db, schema as s } from "@/db";
import { createUser } from "@/lib/auth/queries";
import {
  issueDevice,
  peekDevice,
  redeemDeviceWithoutRotate,
  rotateDevice,
  parseDeviceIdFromCookie,
} from "@/lib/auth/trusted-device";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const row = async (id: string) => (await db.select().from(s.userDevices).where(eq(s.userDevices.id, id)))[0];

async function mk() {
  const u = await createUser({ username: "td" + crypto.randomUUID(), passwordHash: "h", kekSalt: "a", dekWrapped: "b", dekWrappedIv: "c", dekWrappedTag: "d" } as any);
  return u.id as string;
}

describe("parseDeviceIdFromCookie", () => {
  it("extracts id, rejects garbage", () => {
    expect(parseDeviceIdFromCookie("abc.def")).toBe("abc");
    expect(parseDeviceIdFromCookie("nodot")).toBeUndefined();
    expect(parseDeviceIdFromCookie("a.b.c")).toBeUndefined();
    expect(parseDeviceIdFromCookie(undefined)).toBeUndefined();
    expect(parseDeviceIdFromCookie("")).toBeUndefined();
  });
});

describe.skipIf(!HAS_DB)("trusted-device peek/redeem/rotate (real Postgres)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);

  it("peek does not consume: secret hash unchanged, repeatable, redeem-no-rotate still works", async () => {
    const uid = await mk();
    const dek = crypto.randomBytes(32);
    const d = (await issueDevice(uid, dek, "Chrome"))!;
    const before = await row(d.id);
    const p1 = await peekDevice(d.cookieValue, uid);
    const p2 = await peekDevice(d.cookieValue);
    expect(p1).toMatchObject({ valid: true, userId: uid, deviceId: d.id, label: "Chrome" });
    expect(p2).toMatchObject({ valid: true, userId: uid });
    const after = await row(d.id);
    expect(after.secretHash).toBe(before.secretHash);
    expect(after.dekWrapped).toBe(before.dekWrapped);
    expect(after.revokedAt).toBeNull();
    expect((await redeemDeviceWithoutRotate(d.cookieValue, uid))!.dek.equals(dek)).toBe(true);
  });

  it("peek rejects wrong secret / wrong user / revoked / expired and never revokes", async () => {
    const uid = await mk();
    const other = await mk();
    const d = (await issueDevice(uid, crypto.randomBytes(32)))!;
    const badSecret = `${d.id}.${crypto.randomBytes(32).toString("base64url")}`;
    expect(await peekDevice(badSecret, uid)).toEqual({ valid: false });
    expect((await row(d.id)).revokedAt).toBeNull();           // peek must not revoke on mismatch
    expect(await peekDevice(d.cookieValue, other)).toEqual({ valid: false });
    expect(await peekDevice("garbage", uid)).toEqual({ valid: false });
    await db.update(s.userDevices).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(s.userDevices.id, d.id));
    expect(await peekDevice(d.cookieValue, uid)).toEqual({ valid: false });
    const r = (await issueDevice(uid, crypto.randomBytes(32)))!;
    await db.update(s.userDevices).set({ revokedAt: new Date().toISOString() }).where(eq(s.userDevices.id, r.id));
    expect(await peekDevice(r.cookieValue, uid)).toEqual({ valid: false });
  });

  it("redeem-without-rotate keeps the secret valid across repeated redemptions", async () => {
    const uid = await mk();
    const dek = crypto.randomBytes(32);
    const d = (await issueDevice(uid, dek))!;
    const before = await row(d.id);
    for (let i = 0; i < 3; i++) {
      const r = await redeemDeviceWithoutRotate(d.cookieValue, uid);
      expect(r!.dek.equals(dek)).toBe(true);
      expect(r!.cookieValue).toBe(d.cookieValue);
    }
    const after = await row(d.id);
    expect(after.secretHash).toBe(before.secretHash);
    expect(after.dekWrapped).toBe(before.dekWrapped);
    expect(after.revokedAt).toBeNull();
    // wrong user is refused
    expect(await redeemDeviceWithoutRotate(d.cookieValue, await mk())).toBeNull();
  });

  it("rotate invalidates the old secret; new cookie works and carries the same DEK", async () => {
    const uid = await mk();
    const dek = crypto.randomBytes(32);
    const d = (await issueDevice(uid, dek))!;
    const before = await row(d.id);
    const rot = await rotateDevice(d.cookieValue, uid);
    expect(rot).not.toBeNull();
    expect(rot!.rotatedCookieValue).not.toBe(d.cookieValue);
    expect(parseDeviceIdFromCookie(rot!.rotatedCookieValue)).toBe(d.id);
    const after = await row(d.id);
    expect(after.secretHash).not.toBe(before.secretHash);
    expect(after.dekWrapped).not.toBe(before.dekWrapped);
    // new secret redeems to the same DEK
    expect((await redeemDeviceWithoutRotate(rot!.rotatedCookieValue, uid))!.dek.equals(dek)).toBe(true);
    // old secret is dead (and treated as replay: device revoked)
    expect(await redeemDeviceWithoutRotate(d.cookieValue, uid)).toBeNull();
    expect(await rotateDevice(d.cookieValue, uid)).toBeNull();
  });

  it("rotate refuses wrong user and a revoked device", async () => {
    const uid = await mk();
    const d = (await issueDevice(uid, crypto.randomBytes(32)))!;
    expect(await rotateDevice(d.cookieValue, await mk())).toBeNull();
    await db.update(s.userDevices).set({ revokedAt: new Date().toISOString() }).where(eq(s.userDevices.id, d.id));
    expect(await rotateDevice(d.cookieValue, uid)).toBeNull();
  });
});
