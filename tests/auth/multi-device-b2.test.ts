/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Multi-account B2 — multi-user pf_device list against REAL Postgres
 * (*_test DB; skipped otherwise): per-entry verification, user binding,
 * bound-to-5 + oldest evicted, tampered entries dropped, logout ?everywhere
 * and trustDevice:false scoped to ONE user, A-then-B keeps A's device.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

process.env.PF_TRUSTED_DEVICE_DAYS = "30";
process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { db, schema as s } from "@/db";
import { createUser } from "@/lib/auth/queries";
import { createSessionToken, _clearRevokedJtiCache, SESSION_TTL_MS } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";
import { putDEK } from "@/lib/crypto/dek-cache";
import {
  issueDevice,
  peekDevice,
  redeemDevice,
  redeemDeviceWithoutRotate,
  rotateDevice,
  removeUserDevicesFromList,
  findUserDeviceId,
  parseDeviceIdsFromCookie,
  MAX_DEVICE_ENTRIES,
} from "@/lib/auth/trusted-device";
import { applyTrustedDevicePolicy } from "@/lib/auth/login-device";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { DELETE as devicesDELETE } from "@/app/api/settings/devices/route";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const row = async (id: string) => (await db.select().from(s.userDevices).where(eq(s.userDevices.id, id)))[0];
const entries = (list: string) => list.split(",").filter(Boolean);
const idOf = (entry: string) => entry.split(".")[0];

async function mkUser() {
  const u = await createUser({
    username: "md" + crypto.randomUUID(),
    email: `${crypto.randomUUID()}@ex.test`,
    passwordHash: "h", kekSalt: "a", dekWrapped: "b", dekWrappedIv: "c", dekWrappedTag: "d",
  } as any);
  return u.id as string;
}

/** A user + DEK + a device appended to `list` (like a login on a shared browser). */
async function loginOn(list: string | undefined) {
  const userId = await mkUser();
  const dek = crypto.randomBytes(32);
  const d = (await issueDevice(userId, dek, "Chrome", undefined, list))!;
  return { userId, dek, d, list: d.cookieList };
}

describe.skipIf(!HAS_DB)("multi-user pf_device (real Postgres)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => { _clearRevokedJtiCache(); _clearSessionCutoffCache(); });

  it("A then B login on one browser: A's device still redeems (rotating and not), each yields its own DEK", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    expect(entries(B.list)).toHaveLength(2);
    expect(entries(B.list)[0]).toBe(B.d.cookieValue);         // new entry first
    expect(entries(B.list)[1]).toBe(A.d.cookieValue);         // A's entry preserved verbatim
    // A's device row was NOT revoked by B's login
    expect((await row(A.d.id)).revokedAt).toBeNull();

    const nr = await redeemDeviceWithoutRotate(B.list, A.userId);
    expect(nr!.dek.equals(A.dek)).toBe(true);
    const rr = await redeemDevice(B.list, A.userId);
    expect(rr!.dek.equals(A.dek)).toBe(true);
    const rb = await redeemDevice(rr!.rotatedCookieValue, B.userId);
    expect(rb!.dek.equals(B.dek)).toBe(true);
    // each user is bound to their own entry
    expect(await redeemDeviceWithoutRotate(B.list, await mkUser())).toBeNull();
  });

  it("rotating A's entry changes only A's secret; B's entry and row are untouched; A's old secret is dead", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    const bBefore = await row(B.d.id);
    const r = (await rotateDevice(B.list, A.userId))!;
    expect(entries(r.rotatedCookieValue)).toHaveLength(2);
    expect(entries(r.rotatedCookieValue).map(idOf).sort()).toEqual([A.d.id, B.d.id].sort());
    expect(entries(r.rotatedCookieValue).find((e) => idOf(e) === B.d.id)).toBe(B.d.cookieValue);
    expect(entries(r.rotatedCookieValue).find((e) => idOf(e) === A.d.id)).not.toBe(A.d.cookieValue);
    const bAfter = await row(B.d.id);
    expect(bAfter.secretHash).toBe(bBefore.secretHash);
    // A's old secret no longer redeems (replay -> A's device revoked, B's not)
    expect(await redeemDeviceWithoutRotate(B.list, A.userId)).toBeNull();
    expect((await row(A.d.id)).revokedAt).not.toBeNull();
    expect((await row(B.d.id)).revokedAt).toBeNull();
    expect((await redeemDeviceWithoutRotate(r.rotatedCookieValue, B.userId))!.dek.equals(B.dek)).toBe(true);
  });

  it("per-entry verification: a forged secret on B's entry fails B only; peek never revokes", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    const forgedB = `${B.d.id}.${crypto.randomBytes(32).toString("base64url")}`;
    const list = [forgedB, A.d.cookieValue].join(",");
    expect(await peekDevice(list, A.userId)).toMatchObject({ valid: true, userId: A.userId, deviceId: A.d.id });
    expect(await peekDevice(list, B.userId)).toEqual({ valid: false });
    expect(await peekDevice(list)).toMatchObject({ valid: true, userId: A.userId }); // first VALID entry, not first entry
    expect((await row(B.d.id)).revokedAt).toBeNull();           // peek must not revoke
    expect((await redeemDeviceWithoutRotate(list, A.userId))!.dek.equals(A.dek)).toBe(true);
    expect(await redeemDevice(list, B.userId)).toBeNull();      // forged secret
    expect((await row(B.d.id)).revokedAt).not.toBeNull();       // replay revokes B's device only
    expect((await row(A.d.id)).revokedAt).toBeNull();
  });

  it("user binding: A's valid entry cannot be used to redeem as B, nor B's DEK obtained via A's id", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(undefined);
    expect(await redeemDevice(A.d.cookieValue, B.userId)).toBeNull();
    expect(await rotateDevice(A.d.cookieValue, B.userId)).toBeNull();
    expect(await peekDevice(A.d.cookieValue, B.userId)).toEqual({ valid: false });
    // list holds A's valid entry only; asking for B finds nothing, A's row is not revoked
    expect((await row(A.d.id)).revokedAt).toBeNull();
    expect(await findUserDeviceId(`${B.d.cookieValue},${A.d.cookieValue}`, A.userId)).toBe(A.d.id);
    expect(await findUserDeviceId(`${B.d.cookieValue},${A.d.cookieValue}`, B.userId)).toBe(B.d.id);
  });

  it("bounded to MAX_DEVICE_ENTRIES (5): oldest evicted AND revoked; newest 5 still redeem; cookie size bounded", async () => {
    expect(MAX_DEVICE_ENTRIES).toBe(5);
    const users: Awaited<ReturnType<typeof loginOn>>[] = [];
    let list: string | undefined;
    for (let i = 0; i < 7; i++) {
      const u = await loginOn(list);
      users.push(u);
      list = u.list;
      expect(entries(list).length).toBeLessThanOrEqual(5);
    }
    expect(entries(list!)).toHaveLength(5);
    expect(list!.length).toBeLessThan(500);
    // newest first, oldest (users 0 and 1) gone
    expect(entries(list!).map(idOf)).toEqual(users.slice(2).reverse().map((u) => u.d.id));
    for (const u of users.slice(2)) {
      expect((await redeemDeviceWithoutRotate(list, u.userId))!.dek.equals(u.dek)).toBe(true);
    }
    for (const u of users.slice(0, 2)) {
      expect(await redeemDeviceWithoutRotate(list, u.userId)).toBeNull();
      expect((await row(u.d.id)).revokedAt).not.toBeNull(); // evicted entry's row is dead
    }
  });

  it("tampered / forged / dead entries are dropped when the list is rewritten", async () => {
    const A = await loginOn(undefined);
    const dead = await loginOn(undefined);
    await db.update(s.userDevices).set({ revokedAt: new Date().toISOString() }).where(eq(s.userDevices.id, dead.d.id));
    const wrongSecret = `${A.d.id}.${crypto.randomBytes(32).toString("base64url")}`; // dup id, bad secret
    const unknown = `${crypto.randomUUID()}.${crypto.randomBytes(32).toString("base64url")}`;
    const other = await loginOn(undefined);
    const otherBadSecret = `${other.d.id}.${crypto.randomBytes(32).toString("base64url")}`;
    const junk = ["nodot", "a.b.c", "x y.z", ".", "", "../etc.passwd"];
    const tampered = [dead.d.cookieValue, unknown, otherBadSecret, ...junk, A.d.cookieValue, wrongSecret].join(",");

    const B = await loginOn(tampered);
    // new B entry + A's valid entry only (junk, dead, unknown, wrong-secret, forged all dropped)
    expect(entries(B.list).map(idOf).sort()).toEqual([B.d.id, A.d.id].sort());
    expect(entries(B.list)).toContain(A.d.cookieValue);
    expect(entries(B.list)).not.toContain(wrongSecret);
    // the other user's device was only forged-against, not revoked by someone else's login
    expect((await row(other.d.id)).revokedAt).toBeNull();

    // redeem rewrite also drops them
    const rr = (await redeemDevice(`${unknown},${otherBadSecret},${junk.join(",")},${A.d.cookieValue}`, A.userId))!;
    expect(entries(rr.rotatedCookieValue)).toHaveLength(1);
    expect(idOf(rr.rotatedCookieValue)).toBe(A.d.id);
  });

  it("parser limits: oversized cookie ignored; >5 entries truncated; duplicate ids collapsed", async () => {
    const A = await loginOn(undefined);
    const huge = Array.from({ length: 80 }, () => `${crypto.randomUUID()}.${crypto.randomBytes(32).toString("base64url")}`).join(",") + "," + A.d.cookieValue;
    expect(huge.length).toBeGreaterThan(1024);
    expect(await peekDevice(huge, A.userId)).toEqual({ valid: false });
    expect(await redeemDevice(huge, A.userId)).toBeNull();
    const six = [...Array.from({ length: 5 }, () => `${crypto.randomUUID()}.abc`), A.d.cookieValue].join(",");
    expect(await peekDevice(six, A.userId)).toEqual({ valid: false }); // 6th entry is beyond the cap
    expect(parseDeviceIdsFromCookie(`${A.d.cookieValue},${A.d.cookieValue}`)).toEqual([A.d.id]);
    expect(parseDeviceIdsFromCookie(undefined)).toEqual([]);
  });

  it("re-login by the same user replaces (revokes) that user's old entry, keeps others", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    const dekB = B.dek;
    const B2 = (await issueDevice(B.userId, dekB, "Firefox", undefined, B.list))!;
    expect(entries(B2.cookieList)).toHaveLength(2);
    expect(entries(B2.cookieList).map(idOf)).toEqual([B2.id, A.d.id]);
    expect((await row(B.d.id)).revokedAt).not.toBeNull();
    expect((await row(A.d.id)).revokedAt).toBeNull();
    expect(B2.cookieValue).toBe(entries(B2.cookieList)[0]);       // cookieValue = single new entry (stable shape)
  });

  // ── removeUserDevicesFromList / policy / routes ───────────────────────────
  it("removeUserDevicesFromList drops only that user's entries (+revoke opt-in); forged others dropped", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    const r = await removeUserDevicesFromList(B.list, B.userId);
    expect(r.removed).toBe(true);
    expect(r.newDeviceList).toBe(A.d.cookieValue);
    expect((await row(B.d.id)).revokedAt).toBeNull();            // no revoke unless asked
    const r2 = await removeUserDevicesFromList(B.list, B.userId, { revoke: true });
    expect(r2.newDeviceList).toBe(A.d.cookieValue);
    expect((await row(B.d.id)).revokedAt).not.toBeNull();
    expect((await row(A.d.id)).revokedAt).toBeNull();
    expect(await removeUserDevicesFromList(A.d.cookieValue, A.userId)).toEqual({ newDeviceList: "", removed: true });
    expect(await removeUserDevicesFromList(undefined, A.userId)).toEqual({ newDeviceList: "", removed: false });
  });

  it("trustDevice:false removes and revokes ONLY this user's entry; others survive; cookie cleared only when none remain", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    const A2 = (await issueDevice(A.userId, A.dek, "Chrome"))!;  // A's device on ANOTHER browser
    const req = new NextRequest("http://localhost/api/auth/login", { method: "POST", headers: { cookie: `pf_device=${B.list}` } });
    const res = NextResponse.json({ ok: true });
    await applyTrustedDevicePolicy({ request: req, response: res, userId: B.userId, dek: B.dek, trustDevice: false, routeLabel: "t" });
    const c = res.cookies.get("pf_device")!;
    expect(c.value).toBe(A.d.cookieValue);                         // A's entry kept
    expect(c.maxAge).not.toBe(0);
    expect((await row(B.d.id)).revokedAt).not.toBeNull();
    expect((await row(A.d.id)).revokedAt).toBeNull();
    expect((await row(A2.id)).revokedAt).toBeNull();               // other browser untouched
    expect(await redeemDeviceWithoutRotate(c.value, A.userId)).not.toBeNull();

    // last entry -> cookie cleared
    const req2 = new NextRequest("http://localhost/api/auth/login", { method: "POST", headers: { cookie: `pf_device=${A.d.cookieValue}` } });
    const res2 = NextResponse.json({ ok: true });
    await applyTrustedDevicePolicy({ request: req2, response: res2, userId: A.userId, dek: A.dek, trustDevice: false, routeLabel: "t" });
    expect(res2.cookies.get("pf_device")!.maxAge).toBe(0);
    expect(res2.cookies.get("pf_device")!.value).toBe("");
  });

  it("trustDevice:true (policy) on a shared browser appends B and keeps A", async () => {
    const A = await loginOn(undefined);
    const userB = await mkUser();
    const req = new NextRequest("http://localhost/api/auth/login", { method: "POST", headers: { cookie: `pf_device=${A.d.cookieValue}`, "user-agent": "Mozilla Firefox" } });
    const res = NextResponse.json({ ok: true });
    await applyTrustedDevicePolicy({ request: req, response: res, userId: userB, dek: crypto.randomBytes(32), trustDevice: true, routeLabel: "t" });
    const v = res.cookies.get("pf_device")!.value;
    expect(entries(v)).toHaveLength(2);
    expect(entries(v)).toContain(A.d.cookieValue);
    expect((await redeemDeviceWithoutRotate(v, A.userId))!.dek.equals(A.dek)).toBe(true);
  });

  // ── routes ────────────────────────────────────────────────────────────────
  async function sessionFor(userId: string) {
    const { token, jti } = await createSessionToken(userId, true);
    putDEK(jti, crypto.randomBytes(32), SESSION_TTL_MS, userId);
    return { token, jti, userId };
  }

  it("logout ?everywhere=1 (active account only) removes ONLY that user's entries from pf_device; the other account's device still works", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    const sb = await sessionFor(B.userId);
    const req = new NextRequest("http://localhost/api/auth/logout?everywhere=1", {
      method: "POST",
      headers: { cookie: `pf_session=${sb.token}; pf_device=${B.list}` },
    });
    const res = (await logoutPOST(req)) as NextResponse;
    expect(res.status).toBe(200);
    const c = res.cookies.get("pf_device")!;
    expect(c.value).toBe(A.d.cookieValue);
    expect(c.maxAge).not.toBe(0);
    // B: every device revoked server-side; A: untouched and still redeemable from the new cookie
    expect((await row(B.d.id)).revokedAt).not.toBeNull();
    expect((await row(A.d.id)).revokedAt).toBeNull();
    expect((await redeemDeviceWithoutRotate(c.value, A.userId))!.dek.equals(A.dek)).toBe(true);
  });

  it("logout ?everywhere=1 with the only entry clears the cookie; plain logout leaves pf_device alone", async () => {
    const A = await loginOn(undefined);
    const sa = await sessionFor(A.userId);
    const res = (await logoutPOST(new NextRequest("http://localhost/api/auth/logout?everywhere=1", {
      method: "POST", headers: { cookie: `pf_session=${sa.token}; pf_device=${A.list}` },
    }))) as NextResponse;
    expect(res.cookies.get("pf_device")!.maxAge).toBe(0);
    const B = await loginOn(undefined);
    const sb = await sessionFor(B.userId);
    const plain = (await logoutPOST(new NextRequest("http://localhost/api/auth/logout", {
      method: "POST", headers: { cookie: `pf_session=${sb.token}; pf_device=${B.list}` },
    }))) as NextResponse;
    expect(plain.cookies.get("pf_device")).toBeUndefined();
    expect((await row(B.d.id)).revokedAt).toBeNull();
  });

  it("DELETE /api/settings/devices?all=1 revokes this user's devices and drops only their entries from pf_device", async () => {
    const A = await loginOn(undefined);
    const B = await loginOn(A.list);
    const sb = await sessionFor(B.userId);
    const res = await devicesDELETE(new NextRequest("http://localhost/api/settings/devices?all=1", {
      method: "DELETE",
      headers: { cookie: `pf_session=${sb.token}; pf_device=${B.list}`, "x-forwarded-for": "10.8.8.8" },
    }));
    expect(res.status).toBe(200);
    expect(res.cookies.get("pf_device")!.value).toBe(A.d.cookieValue);
    expect((await row(B.d.id)).revokedAt).not.toBeNull();
    expect((await row(A.d.id)).revokedAt).toBeNull();
  });
});
