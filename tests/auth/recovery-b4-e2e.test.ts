/**
 * Recovery B4 security review — end-to-end against REAL Postgres (*_test DB).
 * code/reset, device/reset, device/check: gate matrix, burn, enumeration,
 * cutoff, OAuth revoke, commitSession, rate limits, CSRF, concurrency.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { TOTP } from "otpauth";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.PF_TRUSTED_DEVICE_DAYS = "30";
process.env.PF_PEPPER = process.env.PF_PEPPER || "test-pepper-at-least-32-chars-long-ok-yes";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { db, schema as s } from "@/db";
import { createUser, enableUserMfa, getUserById } from "@/lib/auth/queries";
import { createWrappedDEKForPassword, deriveKEK, unwrapDEK, encryptField, decryptField } from "@/lib/crypto/envelope";
import { issueDevice } from "@/lib/auth/trusted-device";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { generateRecoveryCodes, wrapDEKWithRecoveryCode, hashRecoveryCode } from "@/lib/auth/recovery-codes";
import { createSessionToken, verifySessionToken, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";
import { putDEK } from "@/lib/crypto/dek-cache";
import { middleware } from "@/middleware";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const OLD_PW = "Hr4$yBn8@Cp6sGe1";
const NEW_PW = "Zq7!vLm3#Xt9wKd2";
const GENERIC = { error: "Recovery failed. Check your details and try again." };

let ipCounter = 0;
const freshIp = () => `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.${(ipCounter++ % 250) + 1}`;

async function mkUser(opts: { totp?: boolean; codes?: number } = {}) {
  const { dek, wrapped } = createWrappedDEKForPassword(OLD_PW);
  const email = `u${crypto.randomUUID().slice(0, 12)}@example.com`;
  const u = await createUser({
    username: "fin" + crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(OLD_PW),
    kekSalt: wrapped.salt.toString("base64"),
    dekWrapped: wrapped.wrapped.toString("base64"),
    dekWrappedIv: wrapped.iv.toString("base64"),
    dekWrappedTag: wrapped.tag.toString("base64"),
  } as Parameters<typeof createUser>[0]);
  const id = u.id as string;
  let totpSecret: string | undefined;
  if (opts.totp) {
    const { secret } = generateMfaSecret(email);
    await enableUserMfa(id, secret, dek);
    totpSecret = secret;
  }
  const codes = generateRecoveryCodes(opts.codes ?? 0);
  for (const def of codes) {
    await db.insert(s.userRecoveryCodes).values({
      userId: id,
      codeHash: hashRecoveryCode(def.canonical),
      dekWrapped: wrapDEKWithRecoveryCode(dek, def.canonical),
      usedAt: null,
      createdAt: new Date().toISOString(),
    });
  }
  return { id, dek, email, codes, totpSecret };
}

const totpNow = (secret: string) => new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();

function codeReq(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/auth/recovery/code/reset", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-real-ip": freshIp(), ...headers },
  });
}
function devReq(body: unknown, cookie?: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/auth/recovery/device/reset", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "x-real-ip": freshIp(), ...(cookie ? { cookie: `pf_device=${cookie}` } : {}), ...headers },
  });
}
const codeRoute = () => import("@/app/api/auth/recovery/code/reset/route");
const devRoute = () => import("@/app/api/auth/recovery/device/reset/route");
const checkRoute = () => import("@/app/api/auth/recovery/device/check/route");

const unusedCodes = async (uid: string) =>
  (await db.select().from(s.userRecoveryCodes).where(and(eq(s.userRecoveryCodes.userId, uid), isNull(s.userRecoveryCodes.usedAt)))).length;

async function passwordUnwrapsTo(uid: string, pw: string): Promise<Buffer | null> {
  const u = await getUserById(uid);
  if (!u || !(await verifyPassword(pw, u.passwordHash as string))) return null;
  const kek = deriveKEK(pw, Buffer.from(u.kekSalt as string, "base64"), (u.pepperVersion as number | null) ?? 1);
  return unwrapDEK(kek, {
    wrapped: Buffer.from(u.dekWrapped as string, "base64"),
    iv: Buffer.from(u.dekWrappedIv as string, "base64"),
    tag: Buffer.from(u.dekWrappedTag as string, "base64"),
  } as never);
}

describe.skipIf(!HAS_DB)("recovery B4 e2e (real Postgres)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
    _clearSessionCutoffCache();
    _clearRevokedJtiCache();
  });

  describe("code/reset end to end", () => {
    it("old pw dead, new pw works, DEK unchanged + data decrypts, code burned, old sessions rejected, OAuth revoked, session+device cookies set", async () => {
      const { POST } = await codeRoute();
      const u = await mkUser({ codes: 3 });
      const ct = encryptField(u.dek, "payee-secret")!;
      const old = await createSessionToken(u.id, true);
      const otherDevice = await issueDevice(u.id, u.dek);
      const now = new Date().toISOString();
      await db.insert(s.oauthAccessTokens).values({
        userId: u.id, token: "t" + crypto.randomUUID(), refreshToken: "r" + crypto.randomUUID(), clientId: "c",
        expiresAt: now, refreshExpiresAt: now, createdAt: now,
      });

      const res = await POST(codeReq({ identifier: u.email, recoveryCode: u.codes[0].display, newPassword: NEW_PW }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      expect(await passwordUnwrapsTo(u.id, OLD_PW)).toBeNull();
      const dek = await passwordUnwrapsTo(u.id, NEW_PW);
      expect(dek && dek.equals(u.dek)).toBe(true);
      expect(decryptField(dek!, ct)).toBe("payee-secret");

      expect(await unusedCodes(u.id)).toBe(2);
      const burned = (await db.select().from(s.userRecoveryCodes).where(eq(s.userRecoveryCodes.codeHash, hashRecoveryCode(u.codes[0].canonical))))[0];
      expect(burned.usedAt).not.toBeNull();
      expect(burned.dekWrapped).toBeNull();

      expect(await verifySessionToken(old.token)).toBeNull(); // cutoff
      const live = (await db.select().from(s.oauthAccessTokens).where(and(eq(s.oauthAccessTokens.userId, u.id), isNull(s.oauthAccessTokens.revokedAt)))).length;
      expect(live).toBe(0);
      const od = (await db.select().from(s.userDevices).where(eq(s.userDevices.id, otherDevice!.id)))[0];
      expect(od.revokedAt).not.toBeNull();

      const sess = res.cookies.get("pf_session");
      expect(sess?.value).toBeTruthy();
      expect(await verifySessionToken(sess!.value)).not.toBeNull();
      const dc = res.cookies.get("pf_device");
      expect(dc?.value).toMatch(/^[0-9a-f-]{36}\./);
      expect(dc?.httpOnly).toBe(true);
      expect(dc?.path).toBe("/api/auth");
    });

    it("unknown email, wrong code, used code, malformed code, weak password: byte-identical 400", async () => {
      const { POST } = await codeRoute();
      const u = await mkUser({ codes: 2 });
      const other = await mkUser({ codes: 1 });
      // used code
      const uname = ((await getUserById(u.id))!.username as string);
      expect((await POST(codeReq({ identifier: uname, recoveryCode: u.codes[0].display, newPassword: NEW_PW }))).status).toBe(200);
      const bodies: string[] = [];
      const cases = [
        { identifier: `nobody-${crypto.randomUUID()}@example.com`, recoveryCode: u.codes[1].display, newPassword: NEW_PW }, // unknown email
        { identifier: u.email, recoveryCode: generateRecoveryCodes(1)[0].display, newPassword: NEW_PW },                    // wrong code
        { identifier: u.email, recoveryCode: u.codes[0].display, newPassword: NEW_PW },                                     // used code
        { identifier: u.email, recoveryCode: other.codes[0].display, newPassword: NEW_PW },                                 // other user's code
        { identifier: u.email, recoveryCode: "short", newPassword: NEW_PW },                                                // malformed
        { identifier: u.email, recoveryCode: u.codes[1].display, newPassword: "weak" },                                     // weak pw
      ];
      for (const c of cases) {
        const r = await POST(codeReq(c));
        expect(r.status).toBe(400);
        bodies.push(await r.text());
      }
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0])).toEqual(GENERIC);
      // weak password and cross-user attempts burned nothing
      expect(await unusedCodes(u.id)).toBe(1);
      expect(await unusedCodes(other.id)).toBe(1);
    });

    it("unknown-email path does the same DB work (consume query) as a known email", async () => {
      const { POST } = await codeRoute();
      const u = await mkUser({ codes: 1 });
      const q = await import("@/lib/auth/queries");
      const spy = vi.spyOn(q, "consumeRecoveryCode");
      await POST(codeReq({ identifier: `nobody-${crypto.randomUUID()}@example.com`, recoveryCode: u.codes[0].display, newPassword: NEW_PW }));
      await POST(codeReq({ identifier: u.email, recoveryCode: generateRecoveryCodes(1)[0].display, newPassword: NEW_PW }));
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it("concurrent double reset with the same code: exactly one success", async () => {
      const { POST } = await codeRoute();
      const u = await mkUser({ codes: 1 });
      const mk = (pw: string) => codeReq({ identifier: u.email, recoveryCode: u.codes[0].display, newPassword: pw });
      const rs = await Promise.all([POST(mk(NEW_PW)), POST(mk("Qw3!tYu8#Lp5mNb7")), POST(mk("Aa9!kJh4#Rt2vXc6"))]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 400, 400]);
    });

    it("per-IP limit (5/15min) and per-identifier limit (5/h, case-insensitive) trip", async () => {
      const { POST } = await codeRoute();
      const ip = freshIp();
      const bad = { identifier: "x@example.com", recoveryCode: "short", newPassword: NEW_PW };
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await POST(codeReq({ ...bad, identifier: `ip${i}@e.com` }, { "x-real-ip": ip }))).status);
      expect(statuses).toEqual([400, 400, 400, 400, 400, 429]);

      const id = `Ident${crypto.randomUUID().slice(0, 8)}@Example.com`;
      const st2: number[] = [];
      for (let i = 0; i < 7; i++) {
        const variant = i % 2 ? id.toUpperCase() : id.toLowerCase();
        st2.push((await POST(codeReq({ ...bad, identifier: variant }))).status);
      }
      expect(st2).toEqual([400, 400, 400, 400, 400, 429, 429]);
    });

    it("session cookies go through commitSession: an inactive account stashed in pf_accounts is preserved", async () => {
      const { POST } = await codeRoute();
      const u = await mkUser({ codes: 1 });
      const b = await mkUser();
      const bs = await createSessionToken(b.id, true);
      putDEK(bs.jti, b.dek, 60_000, b.id);
      const stash = Buffer.from(JSON.stringify([{ t: bs.token }]), "utf-8").toString("base64url");
      const res = await POST(codeReq({ identifier: u.email, recoveryCode: u.codes[0].display, newPassword: NEW_PW }, { cookie: `pf_accounts=${stash}` }));
      expect(res.status).toBe(200);
      const out = res.cookies.get("pf_accounts")?.value ?? "";
      expect(Buffer.from(out, "base64url").toString("utf-8")).toContain(bs.token);
    });

    it("CSRF: not in bypass list; cross-origin POST riding a session cookie -> 403 for all three routes", async () => {
      const src = fs.readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
      const block = src.slice(src.indexOf("const CSRF_BYPASS_PATHS"), src.indexOf("]);", src.indexOf("const CSRF_BYPASS_PATHS")));
      expect(block).not.toContain("/api/auth/recovery");
      for (const p of ["code/reset", "device/reset", "device/check"]) {
        const bad = middleware(new NextRequest(`http://localhost:3000/api/auth/recovery/${p}`, {
          method: "POST", headers: { cookie: "pf_session=stale.cookie.x", origin: "https://evil.example" },
        }));
        expect(bad.status, p).toBe(403);
        const ok = middleware(new NextRequest(`http://localhost:3000/api/auth/recovery/${p}`, {
          method: "POST", headers: { cookie: "pf_session=stale.cookie.x", origin: "http://localhost:3000" },
        }));
        expect(ok.status, p).not.toBe(403);
      }
    });
  });

  describe("device/reset 2FA gate matrix (plan 1.4)", () => {
    it("device alone (user with NEITHER TOTP nor codes): refused 400, nothing changes", async () => {
      const { POST } = await devRoute();
      const u = await mkUser();
      const d = (await issueDevice(u.id, u.dek))!;
      for (const body of [{ newPassword: NEW_PW }, { newPassword: NEW_PW, proof: { type: "code", value: "AAAAA-AAAAA-AAAAA-AAAAA" } }]) {
        const r = await POST(devReq(body, d.cookieValue));
        expect(r.status).toBe(400);
        expect(await r.json()).toEqual(GENERIC);
      }
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
    });

    it("device alone (user WITH codes, no TOTP): 401 proof-required, no state change; code proof then succeeds and burns the code", async () => {
      const { POST } = await devRoute();
      const u = await mkUser({ codes: 2 });
      const d = (await issueDevice(u.id, u.dek))!;
      const r1 = await POST(devReq({ newPassword: NEW_PW }, d.cookieValue));
      expect(r1.status).toBe(401);
      expect((await r1.json()).code).toBe("proof-required");
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
      expect(await unusedCodes(u.id)).toBe(2);

      const r2 = await POST(devReq({ newPassword: NEW_PW, proof: { type: "code", value: u.codes[0].display } }, d.cookieValue));
      expect(r2.status).toBe(200);
      expect(await unusedCodes(u.id)).toBe(1); // burned
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).toBeNull();
      expect((await passwordUnwrapsTo(u.id, NEW_PW))!.equals(u.dek)).toBe(true);
      // same code cannot be reused (new device cookie, other proof route)
      const nd = r2.cookies.get("pf_device")!.value;
      const r3 = await POST(devReq({ newPassword: "Qw3!tYu8#Lp5mNb7", proof: { type: "code", value: u.codes[0].display } }, nd));
      expect(r3.status).toBe(400);
    });

    it("TOTP user: device alone 401; wrong TOTP 400; TOTP rejected when user has no TOTP; correct TOTP succeeds; recovery code also accepted", async () => {
      const { POST } = await devRoute();
      const u = await mkUser({ totp: true, codes: 1 });
      const d = (await issueDevice(u.id, u.dek))!;
      expect((await POST(devReq({ newPassword: NEW_PW }, d.cookieValue))).status).toBe(401);
      expect((await POST(devReq({ newPassword: NEW_PW, proof: { type: "totp", value: "000000" } }, d.cookieValue))).status).toBe(400);
      const ok = await POST(devReq({ newPassword: NEW_PW, proof: { type: "totp", value: totpNow(u.totpSecret!) } }, d.cookieValue));
      expect(ok.status).toBe(200);
      expect(await unusedCodes(u.id)).toBe(1); // totp proof does not burn codes

      const noTotp = await mkUser({ codes: 1 });
      const d2 = (await issueDevice(noTotp.id, noTotp.dek))!;
      expect((await POST(devReq({ newPassword: NEW_PW, proof: { type: "totp", value: "123456" } }, d2.cookieValue))).status).toBe(400);

      const t2 = await mkUser({ totp: true, codes: 1 });
      const d3 = (await issueDevice(t2.id, t2.dek))!;
      expect((await POST(devReq({ newPassword: NEW_PW, proof: { type: "code", value: t2.codes[0].display } }, d3.cookieValue))).status).toBe(200);
      expect(await unusedCodes(t2.id)).toBe(0);
    });

    it("full effects: other devices + sessions + OAuth die, THIS device kept (rotated), DEK intact, new session cookie", async () => {
      const { POST } = await devRoute();
      const u = await mkUser({ codes: 1 });
      const d = (await issueDevice(u.id, u.dek))!;
      const other = (await issueDevice(u.id, u.dek))!;
      const old = await createSessionToken(u.id, true);
      const now = new Date().toISOString();
      await db.insert(s.oauthAccessTokens).values({ userId: u.id, token: "t" + crypto.randomUUID(), refreshToken: "r" + crypto.randomUUID(), clientId: "c", expiresAt: now, refreshExpiresAt: now, createdAt: now });
      const r = await POST(devReq({ newPassword: NEW_PW, proof: { type: "code", value: u.codes[0].display } }, d.cookieValue));
      expect(r.status).toBe(200);
      expect(await verifySessionToken(old.token)).toBeNull();
      expect(await verifySessionToken(r.cookies.get("pf_session")!.value)).not.toBeNull();
      const rows = await db.select().from(s.userDevices).where(eq(s.userDevices.userId, u.id));
      const byId = new Map(rows.map((x) => [x.id, x]));
      expect(byId.get(other.id)!.revokedAt).not.toBeNull();
      expect(byId.get(d.id)!.revokedAt).not.toBeNull(); // old secret dead (rotated)
      const newCookie = r.cookies.get("pf_device")!.value;
      expect(newCookie).not.toBe(d.cookieValue);
      const newId = newCookie.split(".")[0];
      expect(byId.get(newId)!.revokedAt).toBeNull();
      expect((await db.select().from(s.oauthAccessTokens).where(and(eq(s.oauthAccessTokens.userId, u.id), isNull(s.oauthAccessTokens.revokedAt)))).length).toBe(0);
    });

    it("weak password never burns the code", async () => {
      const { POST } = await devRoute();
      const u = await mkUser({ codes: 1 });
      const d = (await issueDevice(u.id, u.dek))!;
      const r = await POST(devReq({ newPassword: "weak", proof: { type: "code", value: u.codes[0].display } }, d.cookieValue));
      expect(r.status).toBe(400);
      expect(await unusedCodes(u.id)).toBe(1);
    });

    it("enumeration: garbage / unknown-id / wrong-secret / revoked cookies all give the identical generic 400 (no proof-required without a valid secret)", async () => {
      const { POST } = await devRoute();
      const u = await mkUser({ totp: true });
      const d = (await issueDevice(u.id, u.dek))!;
      const id = d.cookieValue.split(".")[0];
      const cookies = [undefined, "garbage", `${crypto.randomUUID()}.${crypto.randomBytes(32).toString("base64url")}`, `${id}.${crypto.randomBytes(32).toString("base64url")}`];
      const bodies: string[] = [];
      for (const c of cookies) {
        const r = await POST(devReq({ newPassword: NEW_PW }, c));
        expect(r.status).toBe(400);
        bodies.push(await r.text());
      }
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0])).toEqual(GENERIC);
      // wrong secret must not have revoked the real device (no DoS by device id)
      expect((await POST(devReq({ newPassword: NEW_PW }, d.cookieValue))).status).toBe(401);
    });

    it("per-device (5/h) and per-IP (5/15min) limits trip", async () => {
      const { POST } = await devRoute();
      const u = await mkUser({ totp: true });
      const d = (await issueDevice(u.id, u.dek))!;
      const st: number[] = [];
      for (let i = 0; i < 7; i++) st.push((await POST(devReq({ newPassword: NEW_PW, proof: { type: "totp", value: "000000" } }, d.cookieValue))).status);
      expect(st).toEqual([400, 400, 400, 400, 400, 429, 429]);

      const ip = freshIp();
      const st2: number[] = [];
      for (let i = 0; i < 6; i++) st2.push((await POST(devReq({ newPassword: NEW_PW }, undefined, { "x-real-ip": ip }))).status);
      expect(st2).toEqual([400, 400, 400, 400, 400, 429]);
    });
  });

  describe("device/check enumeration", () => {
    const chk = (cookie?: string) => new NextRequest("http://localhost/api/auth/recovery/device/check", {
      method: "POST", body: "{}", headers: { "x-real-ip": freshIp(), ...(cookie ? { cookie: `pf_device=${cookie}` } : {}) },
    });
    it("no cookie / garbage / unknown id / wrong secret for a real device: identical body; valid secret reveals state", async () => {
      const { POST } = await checkRoute();
      const u = await mkUser({ totp: true });
      const d = (await issueDevice(u.id, u.dek))!;
      const id = d.cookieValue.split(".")[0];
      const outs: string[] = [];
      for (const c of [undefined, "garbage", `${crypto.randomUUID()}.abc`, `${id}.${crypto.randomBytes(32).toString("base64url")}`]) {
        const r = await POST(chk(c));
        outs.push(r.status + (await r.text()));
      }
      expect(new Set(outs).size).toBe(1);
      const ok = await (await POST(chk(d.cookieValue))).json();
      expect(ok).toMatchObject({ available: true, needs: "totp" });
    });
  });
});
