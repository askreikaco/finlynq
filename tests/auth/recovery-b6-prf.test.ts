/**
 * Recovery B6 — passkey PRF: register wrap (finish-prf), passkey login/unlock
 * without a password, passkey recovery. REAL Postgres (*_test DB) and REAL
 * @simplewebauthn/server verification against the software authenticator,
 * which emulates PRF deterministically per credential. Nothing about the
 * verification or the wrap is mocked.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { eq, and, isNull } from "drizzle-orm";
import { SignJWT } from "jose";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.PF_TRUSTED_DEVICE_DAYS = "30";
process.env.PF_PEPPER = process.env.PF_PEPPER || "test-pepper-at-least-32-chars-long-ok-yes";
process.env.APP_URL = "https://money.example.test";
delete process.env.PF_WEBAUTHN_RP_ID;
delete process.env.PF_WEBAUTHN_ORIGINS;

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: (...a: unknown[]) => sendEmailMock(...a),
}));

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { SoftAuthenticator } from "../helpers/soft-authenticator";
import { db, schema as s } from "@/db";
import { createUser, enableUserMfa, getUserById, wipeUserDataAndRewrap, clearAllUserData } from "@/lib/auth/queries";
import { createWrappedDEKForPassword, deriveKEK, unwrapDEK, encryptField, decryptField } from "@/lib/crypto/envelope";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createSessionToken, verifySessionToken, verifyShortLived, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";
import { putDEK, getDEK, deleteDEK } from "@/lib/crypto/dek-cache";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { issueDevice } from "@/lib/auth/trusted-device";
import {
  prfSalt,
  prfSaltB64url,
  derivePrfWrapKey,
  wrapDekWithPrf,
  unwrapDekWithPrf,
  parsePrfOutput,
  prfWrapAad,
} from "@/lib/auth/passkey-prf";
import { middleware } from "@/middleware";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const OLD_PW = "Hr4$yBn8@Cp6sGe1";
const NEW_PW = "Zq7!vLm3#Xt9wKd2";
const ORIGIN = "https://money.example.test";
const RP = "money.example.test";
const K = { origin: ORIGIN, rpId: RP };
const GENERIC_LOGIN = { error: "Passkey sign-in failed." };
const GENERIC_RECOVERY = { error: "Recovery failed. Check your details and try again." };

let ipc = 0;
const freshIp = () => `10.7.${(ipc >> 8) & 255}.${(ipc++ % 250) + 1}`;

async function mkUser(opts: { totp?: boolean } = {}) {
  const { dek, wrapped } = createWrappedDEKForPassword(OLD_PW);
  const email = `p${crypto.randomUUID().slice(0, 12)}@example.com`;
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
  if (opts.totp) await enableUserMfa(id, generateMfaSecret(email).secret, dek);
  return { id, dek, email };
}
type U = Awaited<ReturnType<typeof mkUser>>;

async function session(id: string, dek: Buffer, opts: { ageSec?: number; noDek?: boolean } = {}) {
  if (!opts.ageSec) {
    const { token, jti } = await createSessionToken(id, true);
    if (!opts.noDek) putDEK(jti, Buffer.from(dek), 60_000, id);
    return { token, jti };
  }
  const iat = Math.floor(Date.now() / 1000) - opts.ageSec;
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ mfa: true, gen: "0" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id).setJti(jti).setIssuer("pf-auth").setAudience("pf-app")
    .setIssuedAt(iat).setExpirationTime(iat + 86_400)
    .sign(new TextEncoder().encode(process.env.PF_JWT_SECRET!));
  if (!opts.noDek) putDEK(jti, Buffer.from(dek), 60_000, id);
  return { token, jti };
}

const sreq = (urlPath: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${urlPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": freshIp(), ...(token ? { cookie: `pf_session=${token}` } : {}), ...headers },
    body: JSON.stringify(body ?? {}),
  });
const areq = (urlPath: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${urlPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": freshIp(), ...headers },
    body: JSON.stringify(body),
  });

const routes = {
  regOptions: () => import("@/app/api/settings/passkeys/register/options/route"),
  regVerify: () => import("@/app/api/settings/passkeys/register/verify/route"),
  prfOptions: () => import("@/app/api/settings/passkeys/register/prf-options/route"),
  finishPrf: () => import("@/app/api/settings/passkeys/register/finish-prf/route"),
  loginOptions: () => import("@/app/api/auth/passkey/login/options/route"),
  loginVerify: () => import("@/app/api/auth/passkey/login/verify/route"),
  recOptions: () => import("@/app/api/auth/recovery/passkey/options/route"),
  recReset: () => import("@/app/api/auth/recovery/passkey/reset/route"),
};

/** Register a passkey for `u` (no PRF step yet). */
async function register(u: U, auth: SoftAuthenticator, label = "Key") {
  const { token } = await session(u.id, u.dek);
  const o = await (await routes.regOptions()).POST(sreq("/api/settings/passkeys/register/options", token, {}));
  const oj = await o.json();
  const v = await (await routes.regVerify()).POST(sreq("/api/settings/passkeys/register/verify", token, { token: oj.token, response: auth.attest(oj.options.challenge, K), label }));
  expect(v.status).toBe(200);
  return v.json();
}

async function prfOptions(sessTok: string, credentialId: string, extra: Record<string, unknown> = {}) {
  const res = await (await routes.prfOptions()).POST(sreq("/api/settings/passkeys/register/prf-options", sessTok, { credentialId, ...extra }));
  return { res, json: res.status === 200 ? await res.clone().json() : null };
}
async function finishPrf(sessTok: string, body: unknown) {
  return (await routes.finishPrf()).POST(sreq("/api/settings/passkeys/register/finish-prf", sessTok, body));
}

/** Full enrolment incl. the PRF wrap of `u`'s DEK. */
async function enrollPrf(u: U, auth = new SoftAuthenticator(), label = "Key") {
  await register(u, auth, label);
  const { token } = await session(u.id, u.dek);
  const { json } = await prfOptions(token, auth.id);
  const res = await finishPrf(token, {
    token: json.token,
    response: auth.assert(json.options.challenge, K),
    prfOutput: auth.prf(json.prfSalt),
  });
  expect(res.status).toBe(200);
  return auth;
}

async function loginOptions(hint?: string) {
  const res = await (await routes.loginOptions()).POST(areq("/api/auth/passkey/login/options", hint ? { credentialId: hint } : {}));
  return { res, json: res.status === 200 ? await res.clone().json() : null };
}
async function loginVerify(body: unknown, headers: Record<string, string> = {}) {
  return (await routes.loginVerify()).POST(areq("/api/auth/passkey/login/verify", body, headers));
}
/** One-prompt login (hinted): options -> assertion + PRF -> verify. */
async function loginOnce(auth: SoftAuthenticator, over: { prf?: string | null; knobs?: Partial<typeof K & { uv: boolean }>; extra?: Record<string, unknown> } = {}) {
  const { json } = await loginOptions(auth.id);
  const out = await loginVerify({
    token: json.token,
    response: auth.assert(json.options.challenge, { ...K, ...over.knobs }),
    ...(over.prf === null ? {} : { prfOutput: over.prf ?? auth.prf(json.prfSalt) }),
    ...over.extra,
  });
  return out;
}

async function recOptions(hint?: string) {
  const res = await (await routes.recOptions()).POST(areq("/api/auth/recovery/passkey/options", hint ? { credentialId: hint } : {}));
  return { res, json: res.status === 200 ? await res.clone().json() : null };
}
async function recReset(body: unknown, headers: Record<string, string> = {}) {
  return (await routes.recReset()).POST(areq("/api/auth/recovery/passkey/reset", body, headers));
}
async function recoverOnce(auth: SoftAuthenticator, over: { prf?: string | null; pw?: string; knobs?: Partial<typeof K & { uv: boolean }> } = {}) {
  const { json } = await recOptions(auth.id);
  return recReset({
    token: json.token,
    response: auth.assert(json.options.challenge, { ...K, ...over.knobs }),
    ...(over.prf === null ? {} : { prfOutput: over.prf ?? auth.prf(json.prfSalt) }),
    newPassword: over.pw ?? NEW_PW,
  });
}

const passkeyRow = async (id: string) => (await db.select().from(s.userPasskeys).where(eq(s.userPasskeys.id, id)))[0];
const eventsOf = async (uid: string, event: string) =>
  (await db.select().from(s.userSecurityEvents).where(and(eq(s.userSecurityEvents.userId, uid), eq(s.userSecurityEvents.event, event)))).length;
const flush = () => new Promise((r) => setTimeout(r, 60));
const rnd32 = () => crypto.randomBytes(32).toString("base64url");

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

describe("PRF wrap primitives (no DB)", () => {
  const p = { userId: "u1", credentialId: "credA", version: 1 };
  const dek = crypto.randomBytes(32);
  const prf = crypto.randomBytes(32);

  it("roundtrip; wrong PRF fails GCM; wrong user / credential / version fail", () => {
    const w = wrapDekWithPrf(dek, prf, p);
    expect(unwrapDekWithPrf(w, prf, p).equals(dek)).toBe(true);
    expect(() => unwrapDekWithPrf(w, crypto.randomBytes(32), p)).toThrow();
    expect(() => unwrapDekWithPrf(w, prf, { ...p, userId: "u2" })).toThrow();
    expect(() => unwrapDekWithPrf(w, prf, { ...p, credentialId: "credB" })).toThrow();
    expect(() => unwrapDekWithPrf(w, prf, { ...p, version: 2 })).toThrow();
  });

  it("AAD binds user|credential|version: with the RIGHT key, decrypting without / with another AAD fails", () => {
    const w = Buffer.from(wrapDekWithPrf(dek, prf, p), "base64");
    const key = derivePrfWrapKey(prf, p);
    const open = (aad: Buffer | null) => {
      const d = crypto.createDecipheriv("aes-256-gcm", key, w.subarray(0, 12));
      if (aad) d.setAAD(aad);
      d.setAuthTag(w.subarray(w.length - 16));
      return Buffer.concat([d.update(w.subarray(12, w.length - 16)), d.final()]);
    };
    expect(open(prfWrapAad(p)).equals(dek)).toBe(true);
    expect(() => open(null)).toThrow();
    expect(() => open(Buffer.from("u1|credB|1"))).toThrow();
    expect(() => open(Buffer.from("u2|credA|1"))).toThrow();
  });

  it("wrap key is not the plain hash of the PRF output and tampering is detected", () => {
    const w = Buffer.from(wrapDekWithPrf(dek, prf, p), "base64");
    const plain = crypto.createHash("sha256").update(prf).digest();
    const d = crypto.createDecipheriv("aes-256-gcm", plain, w.subarray(0, 12));
    d.setAAD(prfWrapAad(p));
    d.setAuthTag(w.subarray(w.length - 16));
    expect(() => Buffer.concat([d.update(w.subarray(12, w.length - 16)), d.final()])).toThrow();
    const bad = Buffer.from(w);
    bad[20] ^= 1;
    expect(() => unwrapDekWithPrf(bad.toString("base64"), prf, p)).toThrow();
  });

  it("salts: per credential (differ), deterministic, version-separated, 32 bytes", () => {
    const ids = Array.from({ length: 20 }, () => crypto.randomBytes(32).toString("base64url"));
    const salts = new Set(ids.map((i) => prfSalt(i).toString("hex")));
    expect(salts.size).toBe(20);
    expect(prfSalt(ids[0]).equals(prfSalt(ids[0]))).toBe(true);
    expect(prfSalt(ids[0], 1).equals(prfSalt(ids[0], 2))).toBe(false);
    expect(prfSalt(ids[0]).length).toBe(32);
    expect(prfSaltB64url(ids[0])).toHaveLength(43);
  });

  it("parsePrfOutput accepts exactly 32 base64url bytes", () => {
    expect(parsePrfOutput(rnd32())?.length).toBe(32);
    for (const bad of [undefined, 5, "", "short", crypto.randomBytes(31).toString("base64url"), crypto.randomBytes(33).toString("base64url"), rnd32() + "=", rnd32().replace(/^./, "+")]) {
      expect(parsePrfOutput(bad)).toBeNull();
    }
  });
});

describe.skipIf(!HAS_DB)("recovery B6 passkey PRF (real Postgres, real verification)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
    _clearSessionCutoffCache();
    _clearRevokedJtiCache();
  });

  // ───────────────────────── (a) register wrap ─────────────────────────
  describe("finish-prf (register wrap)", () => {
    it("register/verify tells the browser to run the PRF step (unless it said enabled:false); nothing wrapped yet", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator();
      const out = await register(u, a);
      expect(out).toMatchObject({ prfSupported: false, needsPrfAssertion: true });
      const row = await passkeyRow(a.id);
      expect(row.dekWrappedPrf).toBeNull();
      expect(row.prfSupported).toBe(0);
      const b = new SoftAuthenticator({ prf: false });
      const { token } = await session(u.id, u.dek);
      const o = await (await (await routes.regOptions()).POST(sreq("/api/settings/passkeys/register/options", token, {}))).json();
      const att = b.attest(o.options.challenge, K);
      (att.clientExtensionResults as Record<string, unknown>).prf = { enabled: false };
      const v = await (await routes.regVerify()).POST(sreq("/api/settings/passkeys/register/verify", token, { token: o.token, response: att }));
      expect((await v.json()).needsPrfAssertion).toBe(false);
    });

    it("wraps the session DEK: row has prf_supported=1, wrap opens ONLY with the credential's PRF + (user,credential,version)", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const row = await passkeyRow(a.id);
      expect(row.prfSupported).toBe(1);
      expect(row.prfSaltVersion).toBe(1);
      expect(row.dekWrappedPrf).toBeTruthy();
      expect(row.dekWrappedPrf).not.toContain(u.dek.toString("base64"));
      const prf = Buffer.from(a.prf(prfSaltB64url(a.id))!, "base64url");
      const dek = unwrapDekWithPrf(row.dekWrappedPrf!, prf, { userId: u.id, credentialId: a.id, version: 1 });
      expect(dek.equals(u.dek)).toBe(true);
      expect(() => unwrapDekWithPrf(row.dekWrappedPrf!, crypto.randomBytes(32), { userId: u.id, credentialId: a.id, version: 1 })).toThrow();
      await flush();
      expect(await eventsOf(u.id, "passkey_prf_enabled")).toBe(1);
    });

    it("two credentials get DIFFERENT salts (prf-options) and independent wraps", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const b = await enrollPrf(u);
      const { token } = await session(u.id, u.dek);
      const sa = (await prfOptions(token, a.id)).json.prfSalt;
      const sb = (await prfOptions(token, b.id)).json.prfSalt;
      expect(sa).not.toBe(sb);
      expect(sa).toBe(prfSaltB64url(a.id));
      expect((await passkeyRow(a.id)).dekWrappedPrf).not.toBe((await passkeyRow(b.id)).dekWrappedPrf);
    });

    it("needs a live DEK (423) and a fresh session or the password (401 / 200 / wrong 401)", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator();
      await register(u, a);
      const noDek = await session(u.id, u.dek, { noDek: true });
      expect((await prfOptions(noDek.token, a.id)).res.status).toBe(423);
      const stale = await session(u.id, u.dek, { ageSec: 3600 });
      expect((await prfOptions(stale.token, a.id)).res.status).toBe(401);
      expect((await prfOptions(stale.token, a.id, { currentPassword: "Wrong-Password-1!" })).res.status).toBe(401);
      const ok = await prfOptions(stale.token, a.id, { currentPassword: OLD_PW });
      expect(ok.res.status).toBe(200);
      const fin = await finishPrf(noDek.token, { token: ok.json.token, response: a.assert(ok.json.options.challenge, K), prfOutput: a.prf(ok.json.prfSalt) });
      expect(fin.status).toBe(423);
      expect((await passkeyRow(a.id)).dekWrappedPrf).toBeNull();
    });

    it("other user's credential: prf-options 404, finish-prf with a foreign token/credential 400, no row written", async () => {
      const u1 = await mkUser(), u2 = await mkUser();
      const a1 = await enrollPrf(u1);
      const a2 = new SoftAuthenticator();
      await register(u2, a2);
      const s2 = await session(u2.id, u2.dek);
      expect((await prfOptions(s2.token, a1.id)).res.status).toBe(404);
      // u2 mints a token for ITS credential, then presents u1's credential assertion
      const { json } = await prfOptions(s2.token, a2.id);
      const bad = await finishPrf(s2.token, { token: json.token, response: a1.assert(json.options.challenge, K), prfOutput: a1.prf(json.prfSalt) });
      expect(bad.status).toBe(400);
      expect((await passkeyRow(a2.id)).dekWrappedPrf).toBeNull();
      const before = (await passkeyRow(a1.id)).dekWrappedPrf;
      expect(before).toBeTruthy();
    });

    it("token is single use, bound to the session and to the credential; wrong-credential assertion rejected", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator(), b = new SoftAuthenticator();
      await register(u, a);
      await register(u, b);
      const s1 = await session(u.id, u.dek);
      const s2 = await session(u.id, u.dek);
      const { json } = await prfOptions(s1.token, a.id);
      const resp = a.assert(json.options.challenge, K);
      const prf = a.prf(json.prfSalt);
      // other session of the SAME user
      expect((await finishPrf(s2.token, { token: json.token, response: resp, prfOutput: prf })).status).toBe(400);
      // the rightful session completes it ONCE; a replay is dead
      expect((await finishPrf(s1.token, { token: json.token, response: resp, prfOutput: prf })).status).toBe(200);
      expect((await finishPrf(s1.token, { token: json.token, response: resp, prfOutput: prf })).status).toBe(400);
      // credential binding: token for A, assertion by B
      const o2 = await prfOptions(s1.token, a.id);
      expect((await finishPrf(s1.token, { token: o2.json.token, response: b.assert(o2.json.options.challenge, K), prfOutput: b.prf(prfSaltB64url(b.id)) })).status).toBe(400);
      // honest completion works and a replay of it fails
      const o3 = await prfOptions(s1.token, a.id);
      const r3 = a.assert(o3.json.options.challenge, K);
      const body = { token: o3.json.token, response: r3, prfOutput: a.prf(o3.json.prfSalt) };
      expect((await finishPrf(s1.token, body)).status).toBe(200);
      expect((await finishPrf(s1.token, body)).status).toBe(400);
    });

    it("requires UV and a verified assertion; bad prfOutput shapes rejected; nothing written", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator();
      await register(u, a);
      const s1 = await session(u.id, u.dek);
      const attempts: Array<Record<string, unknown>> = [];
      let o = await prfOptions(s1.token, a.id);
      attempts.push({ token: o.json.token, response: a.assert(o.json.options.challenge, { ...K, uv: false }), prfOutput: a.prf(o.json.prfSalt) });
      o = await prfOptions(s1.token, a.id);
      attempts.push({ token: o.json.token, response: a.assert(o.json.options.challenge, K, { signWith: new SoftAuthenticator() }), prfOutput: a.prf(o.json.prfSalt) });
      o = await prfOptions(s1.token, a.id);
      attempts.push({ token: o.json.token, response: a.assert(o.json.options.challenge, K), prfOutput: crypto.randomBytes(16).toString("base64url") });
      o = await prfOptions(s1.token, a.id);
      attempts.push({ token: o.json.token, response: a.assert(o.json.options.challenge, K) }); // missing prfOutput
      for (const b of attempts) expect((await finishPrf(s1.token, b)).status).toBe(400);
      expect((await passkeyRow(a.id)).dekWrappedPrf).toBeNull();
    });

    it("a PRF value smuggled in clientExtensionResults is ignored (only prfOutput is key material)", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator();
      await register(u, a);
      const s1 = await session(u.id, u.dek);
      const o = await prfOptions(s1.token, a.id);
      const resp = a.assert(o.json.options.challenge, K);
      (resp.clientExtensionResults as Record<string, unknown>).prf = { results: { first: a.prf(o.json.prfSalt) } };
      const wrong = rnd32();
      expect((await finishPrf(s1.token, { token: o.json.token, response: resp, prfOutput: wrong })).status).toBe(200);
      // the wrap was made with `wrong`, so the real PRF cannot open it
      const row = await passkeyRow(a.id);
      expect(() => unwrapDekWithPrf(row.dekWrappedPrf!, Buffer.from(a.prf(prfSaltB64url(a.id))!, "base64url"), { userId: u.id, credentialId: a.id, version: 1 })).toThrow();
      expect(unwrapDekWithPrf(row.dekWrappedPrf!, Buffer.from(wrong, "base64url"), { userId: u.id, credentialId: a.id, version: 1 }).equals(u.dek)).toBe(true);
    });
  });

  // ───────────────────────── (b) passkey login ─────────────────────────
  describe("passkey login without password", () => {
    it("hinted one-prompt login: full mfa session; session DEK equals the REAL DEK and decrypts existing data; commitSession cookie; device + event", async () => {
      const u = await mkUser();
      const ct = encryptField(u.dek, "payee-secret")!;
      const a = await enrollPrf(u);
      const before = (await passkeyRow(a.id)).counter;

      const { json } = await loginOptions(a.id);
      expect(json.options.allowCredentials.map((c: { id: string }) => c.id)).toEqual([a.id]);
      expect(json.options.userVerification).toBe("required");
      expect(json.prfSalt).toBe(prfSaltB64url(a.id));
      const res = await loginVerify({ token: json.token, response: a.assert(json.options.challenge, K), prfOutput: a.prf(json.prfSalt) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true }); // nothing secret in the body

      const cookie = res.cookies.get("pf_session")?.value;
      expect(cookie).toBeTruthy();
      const payload = await verifySessionToken(cookie!);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(u.id);
      expect(payload!.mfa).toBe(true);
      const dek = getDEK(payload!.jti as string, u.id);
      expect(dek && dek.equals(u.dek)).toBe(true);
      expect(decryptField(dek!, ct)).toBe("payee-secret");
      expect(res.cookies.get("pf_device")?.value).toMatch(/^[0-9a-f-]{36}\./);
      expect((await passkeyRow(a.id)).counter).toBeGreaterThan(before);
      expect((await passkeyRow(a.id)).lastUsedAt).not.toBeNull();
      await flush();
      expect(await eventsOf(u.id, "passkey_login_success")).toBe(1);
    });

    it("trustDevice:false issues no pf_device", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const res = await loginOnce(a, { extra: { trustDevice: false } });
      expect(res.status).toBe(200);
      expect(res.cookies.get("pf_device")?.value ?? "").toBe("");
    });

    it("discoverable two-step: no session after step 1 (needs_prf + that credential's salt); step 2 with PRF -> session", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      await enrollPrf(u); // a second credential must not confuse identification
      const { json } = await loginOptions();
      expect(json.options.allowCredentials).toEqual([]);
      expect(json.prfSalt).toBeUndefined();
      const r1 = await loginVerify({ token: json.token, response: a.assert(json.options.challenge, K) });
      expect(r1.status).toBe(200);
      const s1 = await r1.json();
      expect(s1.step).toBe("prf");
      expect(s1.credentialId).toBe(a.id);
      expect(s1.prfSalt).toBe(prfSaltB64url(a.id));
      expect(s1.options.allowCredentials.map((c: { id: string }) => c.id)).toEqual([a.id]);
      expect(r1.cookies.get("pf_session")).toBeUndefined();
      // step-1 token is dead (replay) and the step-2 token needs a PRF
      expect((await loginVerify({ token: json.token, response: a.assert(json.options.challenge, K) })).status).toBe(400);
      const noPrf = await loginVerify({ token: s1.token, response: a.assert(s1.options.challenge, K) });
      expect(noPrf.status).toBe(400); // consumed; and would not re-identify anyway
      const r0 = await loginOptions();
      const x = await (await loginVerify({ token: r0.json.token, response: a.assert(r0.json.options.challenge, K) })).json();
      const r2 = await loginVerify({ token: x.token, response: a.assert(x.options.challenge, K), prfOutput: a.prf(x.prfSalt) });
      expect(r2.status).toBe(200);
      const p = await verifySessionToken(r2.cookies.get("pf_session")!.value);
      expect(p!.mfa).toBe(true);
      expect(getDEK(p!.jti as string, u.id)!.equals(u.dek)).toBe(true);
    });

    it("works for a user with TOTP enabled (passkey = possession + UV, mfa claim true) and a locked-out password", async () => {
      const u = await mkUser({ totp: true });
      const a = await enrollPrf(u);
      const res = await loginOnce(a);
      expect(res.status).toBe(200);
      expect((await verifySessionToken(res.cookies.get("pf_session")!.value))!.mfa).toBe(true);
    });

    it("wrong PRF -> generic 400, no session cookie, no DEK cached", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const res = await loginOnce(a, { prf: rnd32() });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(GENERIC_LOGIN);
      expect(res.cookies.get("pf_session")).toBeUndefined();
      expect(res.cookies.get("pf_device")).toBeUndefined();
    });

    it("PRF of ANOTHER credential (same user, or another user) cannot open the wrap -> 400", async () => {
      const u = await mkUser(), v = await mkUser();
      const a = await enrollPrf(u);
      const b = await enrollPrf(u);
      const c = await enrollPrf(v);
      for (const other of [b, c]) {
        const res = await loginOnce(a, { prf: other.prf(prfSaltB64url(a.id))! });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(GENERIC_LOGIN);
        expect(res.cookies.get("pf_session")).toBeUndefined();
        const res2 = await loginOnce(a, { prf: other.prf(prfSaltB64url(other.id))! });
        expect(res2.status).toBe(400);
      }
    });

    it("credential WITHOUT a wrap (or PRF-less authenticator) -> prf_unavailable, no session; password fallback untouched", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator({ prf: false });
      await register(u, a);
      // one-prompt (no prf because the authenticator has none) and with a made-up prf
      for (const prf of [null, rnd32()]) {
        const res = await loginOnce(a, { prf });
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ code: "prf_unavailable" });
        expect(res.cookies.get("pf_session")).toBeUndefined();
      }
      // discoverable step 1 also reports it
      const { json } = await loginOptions();
      const r1 = await loginVerify({ token: json.token, response: a.assert(json.options.challenge, K) });
      expect(r1.status).toBe(400);
      expect((await r1.json()).code).toBe("prf_unavailable");
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
    });

    it("replayed challenge/response -> second use 400 (single-use token, counter)", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const { json } = await loginOptions(a.id);
      const body = { token: json.token, response: a.assert(json.options.challenge, K), prfOutput: a.prf(json.prfSalt) };
      expect((await loginVerify(body)).status).toBe(200);
      const again = await loginVerify(body);
      expect(again.status).toBe(400);
      expect(again.cookies.get("pf_session")).toBeUndefined();
      // concurrent double submit: exactly one wins
      const j2 = (await loginOptions(a.id)).json;
      const b2 = { token: j2.token, response: a.assert(j2.options.challenge, K), prfOutput: a.prf(j2.prfSalt) };
      const [x, y] = await Promise.all([loginVerify(b2), loginVerify(b2)]);
      expect([x.status, y.status].sort()).toEqual([200, 400]);
    });

    it("assertion not verified => correct PRF alone is worthless (forged signature, unknown credential, other user's credential id)", async () => {
      const u = await mkUser(), v = await mkUser();
      const a = await enrollPrf(u);
      const b = await enrollPrf(v);
      const bodies: string[] = [];
      // forged signature, correct PRF (attacker obtained the PRF value somehow)
      let o = (await loginOptions(a.id)).json;
      let res = await loginVerify({ token: o.token, response: a.assert(o.options.challenge, K, { signWith: new SoftAuthenticator() }), prfOutput: a.prf(o.prfSalt) });
      expect(res.status).toBe(400); expect(res.cookies.get("pf_session")).toBeUndefined();
      bodies.push(await res.text());
      // unknown credential id
      const ghost = new SoftAuthenticator();
      o = (await loginOptions(ghost.id)).json;
      res = await loginVerify({ token: o.token, response: ghost.assert(o.options.challenge, K), prfOutput: ghost.prf(o.prfSalt) });
      expect(res.status).toBe(400);
      bodies.push(await res.text());
      // v's credential id, signed by u's key, v's PRF
      o = (await loginOptions(b.id)).json;
      const forged = a.assert(o.options.challenge, K);
      forged.id = b.id; forged.rawId = b.id;
      res = await loginVerify({ token: o.token, response: forged, prfOutput: b.prf(o.prfSalt) });
      expect(res.status).toBe(400); expect(res.cookies.get("pf_session")).toBeUndefined();
      bodies.push(await res.text());
      // userHandle of another user
      o = (await loginOptions(a.id)).json;
      res = await loginVerify({ token: o.token, response: a.assert(o.options.challenge, K, { userHandle: Buffer.from(v.id).toString("base64url") }), prfOutput: a.prf(o.prfSalt) });
      expect(res.status).toBe(400);
      bodies.push(await res.text());
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0])).toEqual(GENERIC_LOGIN);
    });

    it("UV is required: an assertion without the UV flag + correct PRF -> 400", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const res = await loginOnce(a, { knobs: { uv: false } });
      expect(res.status).toBe(400);
      expect(res.cookies.get("pf_session")).toBeUndefined();
    });

    it("wrong origin / rpID / counter regression rejected", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      expect((await loginOnce(a, { knobs: { origin: "https://evil.example" } })).status).toBe(400);
      expect((await loginOnce(a, { knobs: { rpId: "evil.example" } })).status).toBe(400);
      const stored = (await passkeyRow(a.id)).counter;
      const { json } = await loginOptions(a.id);
      const res = await loginVerify({ token: json.token, response: a.assert(json.options.challenge, K, { counter: stored }), prfOutput: a.prf(json.prfSalt) });
      expect(res.status).toBe(400);
      await flush();
      expect(await eventsOf(u.id, "passkey_counter_regression")).toBeGreaterThan(0);
    });

    it("token purposes are not interchangeable (login <-> recovery <-> 2fa/register) and tokens are signed", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const lo = (await loginOptions(a.id)).json;
      const ro = (await recOptions(a.id)).json;
      expect(await verifyShortLived(lo.token, "passkey-recovery")).toBeNull();
      expect(await verifyShortLived(ro.token, "passkey-login")).toBeNull();
      expect(await verifyShortLived(lo.token, "passkey-2fa")).toBeNull();
      expect(await verifyShortLived(lo.token, "passkey-register")).toBeNull();
      expect(await verifyShortLived(lo.token, "passkey-login")).not.toBeNull();
      // recovery token at the login route
      let res = await loginVerify({ token: ro.token, response: a.assert(ro.options.challenge, K), prfOutput: a.prf(ro.prfSalt) });
      expect(res.status).toBe(400);
      // login token at the recovery route: password untouched
      res = await recReset({ token: lo.token, response: a.assert(lo.options.challenge, K), prfOutput: a.prf(lo.prfSalt), newPassword: NEW_PW });
      expect(res.status).toBe(400);
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
      // tampered token
      const o = (await loginOptions(a.id)).json;
      res = await loginVerify({ token: o.token.slice(0, -3) + "AAA", response: a.assert(o.options.challenge, K), prfOutput: a.prf(o.prfSalt) });
      expect(res.status).toBe(400);
    });

    it("hint is neutral: same shape for real and unknown credential ids (no existence oracle)", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const real = (await loginOptions(a.id)).json;
      const ghostId = crypto.randomBytes(32).toString("base64url");
      const ghost = (await loginOptions(ghostId)).json;
      expect(Object.keys(real).sort()).toEqual(Object.keys(ghost).sort());
      expect(Object.keys(real.options).sort()).toEqual(Object.keys(ghost.options).sort());
      expect(real.options.allowCredentials).toEqual([{ id: a.id, type: "public-key" }]);
      expect(ghost.options.allowCredentials).toEqual([{ id: ghostId, type: "public-key" }]);
      expect(ghost.prfSalt).toBe(prfSaltB64url(ghostId));
      const res = await (await routes.loginOptions()).POST(areq("/api/auth/passkey/login/options", { credentialId: "bad id!!" }));
      expect(res.status).toBe(400);
    });

    it("each passkey login session owns its DEK copy: evicting one session (zero-fill) leaves the other intact; unwrap buffer zeroing doesn't leak", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const r1 = await loginOnce(a);
      const r2 = await loginOnce(a);
      const p1 = (await verifySessionToken(r1.cookies.get("pf_session")!.value))!;
      const p2 = (await verifySessionToken(r2.cookies.get("pf_session")!.value))!;
      expect(getDEK(p1.jti as string, u.id)!.equals(u.dek)).toBe(true);
      deleteDEK(p1.jti as string);
      expect(getDEK(p1.jti as string, u.id)).toBeFalsy();
      expect(getDEK(p2.jti as string, u.id)!.equals(u.dek)).toBe(true);
      expect(u.dek.equals(Buffer.alloc(32))).toBe(false);
    });

    it("rate limit: 11th verify from one IP in the window -> 429", async () => {
      const ip = "10.250.1.1";
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await loginVerify({ token: "x".repeat(30), response: { id: "a", rawId: "a", type: "public-key", response: { clientDataJSON: "a", authenticatorData: "a", signature: "a" } } }, { "x-real-ip": ip });
        codes.push(r.status);
      }
      expect(codes.slice(0, 10).every((c) => c === 400)).toBe(true);
      expect(codes[11]).toBe(429);
    });
  });

  // ───────────────────────── (c) passkey recovery ─────────────────────────
  describe("passkey recovery (no wipe)", () => {
    it("new password works, old fails, DEK unchanged + data decrypts, other sessions dead, OAuth grants revoked, other devices revoked, skips TOTP, commitSession cookies, event + email", async () => {
      const u = await mkUser({ totp: true });
      const ct = encryptField(u.dek, "payee-secret")!;
      const a = await enrollPrf(u);
      const old = await createSessionToken(u.id, true);
      const otherDevice = await issueDevice(u.id, u.dek);
      const now = new Date().toISOString();
      await db.insert(s.oauthAccessTokens).values({
        userId: u.id, token: "t" + crypto.randomUUID(), refreshToken: "r" + crypto.randomUUID(), clientId: "c",
        expiresAt: now, refreshExpiresAt: now, createdAt: now,
      });
      const codeHash = "c" + crypto.randomUUID();
      await db.insert(s.oauthAuthorizationCodes).values({
        userId: u.id, code: codeHash, codeChallenge: "x", redirectUri: "https://x.example/cb", clientId: "c", expiresAt: now, createdAt: now,
      });

      const res = await recoverOnce(a);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      expect(await passwordUnwrapsTo(u.id, OLD_PW)).toBeNull();
      const dek = await passwordUnwrapsTo(u.id, NEW_PW);
      expect(dek && dek.equals(u.dek)).toBe(true);
      expect(decryptField(dek!, ct)).toBe("payee-secret");

      expect(await verifySessionToken(old.token)).toBeNull();
      const live = (await db.select().from(s.oauthAccessTokens).where(and(eq(s.oauthAccessTokens.userId, u.id), isNull(s.oauthAccessTokens.revokedAt)))).length;
      expect(live).toBe(0);
      expect((await db.select().from(s.oauthAuthorizationCodes).where(eq(s.oauthAuthorizationCodes.code, codeHash)))[0].used).toBe(1);
      const od = (await db.select().from(s.userDevices).where(eq(s.userDevices.id, otherDevice!.id)))[0];
      expect(od.revokedAt).not.toBeNull();

      const sess = res.cookies.get("pf_session");
      const p = await verifySessionToken(sess!.value);
      expect(p).not.toBeNull();
      expect(p!.mfa).toBe(true);
      expect(getDEK(p!.jti as string, u.id)!.equals(u.dek)).toBe(true);
      expect(res.cookies.get("pf_device")?.value).toMatch(/^[0-9a-f-]{36}\./);
      await flush();
      const ev = (await db.select().from(s.userSecurityEvents).where(and(eq(s.userSecurityEvents.userId, u.id), eq(s.userSecurityEvents.event, "recovery_reset_success"))))[0];
      expect(ev.method).toBe("passkey");
      expect(sendEmailMock).toHaveBeenCalled();
      // the PRF wrap survives (DEK unchanged): the passkey still unlocks, with the NEW password irrelevant
      expect((await passkeyRow(a.id)).dekWrappedPrf).toBeTruthy();
      expect((await loginOnce(a)).status).toBe(200);
    });

    it("discoverable two-step recovery works and changes nothing until the PRF step", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const { json } = await recOptions();
      const r1 = await recReset({ token: json.token, response: a.assert(json.options.challenge, K) });
      expect(r1.status).toBe(200);
      const x = await r1.json();
      expect(x.step).toBe("prf");
      expect(r1.cookies.get("pf_session")).toBeUndefined();
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
      const r2 = await recReset({ token: x.token, response: a.assert(x.options.challenge, K), prfOutput: a.prf(x.prfSalt), newPassword: NEW_PW });
      expect(r2.status).toBe(200);
      expect((await passwordUnwrapsTo(u.id, NEW_PW))!.equals(u.dek)).toBe(true);
    });

    it("requires UV: no-UV assertion + correct PRF -> 400, password unchanged", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const res = await recoverOnce(a, { knobs: { uv: false } });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(GENERIC_RECOVERY);
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
      expect(await passwordUnwrapsTo(u.id, NEW_PW)).toBeNull();
    });

    it("requires a PRF wrap: credential without one cannot recover (prf_unavailable); wrong PRF fails; nothing changes", async () => {
      const u = await mkUser();
      const nowrap = new SoftAuthenticator({ prf: false });
      await register(u, nowrap);
      let res = await recoverOnce(nowrap, { prf: rnd32() });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "prf_unavailable" });
      res = await recoverOnce(nowrap, { prf: null });
      expect(res.status).toBe(400);
      const a = await enrollPrf(u);
      res = await recoverOnce(a, { prf: rnd32() });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(GENERIC_RECOVERY);
      expect(res.cookies.get("pf_session")).toBeUndefined();
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
    });

    it("failures are byte-identical: unknown credential, forged signature, wrong PRF, other user's PRF; weak password burns nothing", async () => {
      const u = await mkUser(), v = await mkUser();
      const a = await enrollPrf(u);
      const b = await enrollPrf(v);
      const bodies: string[] = [];
      const ghost = new SoftAuthenticator();
      let o = (await recOptions(ghost.id)).json;
      bodies.push(await (await recReset({ token: o.token, response: ghost.assert(o.options.challenge, K), prfOutput: ghost.prf(o.prfSalt), newPassword: NEW_PW })).text());
      o = (await recOptions(a.id)).json;
      bodies.push(await (await recReset({ token: o.token, response: a.assert(o.options.challenge, K, { signWith: new SoftAuthenticator() }), prfOutput: a.prf(o.prfSalt), newPassword: NEW_PW })).text());
      o = (await recOptions(a.id)).json;
      bodies.push(await (await recReset({ token: o.token, response: a.assert(o.options.challenge, K), prfOutput: b.prf(prfSaltB64url(a.id)), newPassword: NEW_PW })).text());
      o = (await recOptions(a.id)).json;
      bodies.push(await (await recReset({ token: o.token, response: a.assert(o.options.challenge, K), prfOutput: a.prf(o.prfSalt), newPassword: "weak" })).text());
      for (const t of bodies) expect(JSON.parse(t)).toEqual(GENERIC_RECOVERY);
      expect(new Set(bodies).size).toBe(1);
      // the weak-password attempt did not consume the challenge: retry with a strong one succeeds
      const retry = await recReset({ token: o.token, response: a.assert(o.options.challenge, K), prfOutput: a.prf(o.prfSalt), newPassword: NEW_PW });
      expect(retry.status).toBe(200);
      expect(await passwordUnwrapsTo(v.id, OLD_PW)).not.toBeNull();
    });

    it("replay of a successful recovery fails; challenge is single use", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const { json } = await recOptions(a.id);
      const body = { token: json.token, response: a.assert(json.options.challenge, K), prfOutput: a.prf(json.prfSalt), newPassword: NEW_PW };
      expect((await recReset(body)).status).toBe(200);
      expect((await recReset({ ...body, newPassword: "Another-Str0ng-Pass!9" })).status).toBe(400);
      expect(await passwordUnwrapsTo(u.id, NEW_PW)).not.toBeNull();
    });

    it("rate limit: 6th reset attempt from one IP -> 429", async () => {
      const ip = "10.250.2.2";
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) {
        const r = await recReset({ token: "x".repeat(30), response: { id: "a", rawId: "a", type: "public-key", response: { clientDataJSON: "a", authenticatorData: "a", signature: "a" } } }, { "x-real-ip": ip });
        codes.push(r.status);
      }
      expect(codes[4]).toBe(400);
      expect(codes[6]).toBe(429);
    });
  });

  // ───────────────────────── wraps vs password change / wipe ─────────────────────────
  describe("lifecycle", () => {
    it("password change does NOT invalidate the PRF wrap: DEK unchanged, passkey login still opens the same DEK", async () => {
      const u = await mkUser();
      const ct = encryptField(u.dek, "kept")!;
      const a = await enrollPrf(u);
      const { token } = await session(u.id, u.dek);
      const { POST } = await import("@/app/api/settings/change-password/route");
      const res = await POST(sreq("/api/settings/change-password", token, { currentPassword: OLD_PW, newPassword: NEW_PW }));
      expect(res.status).toBe(200);
      expect((await passwordUnwrapsTo(u.id, NEW_PW))!.equals(u.dek)).toBe(true);
      const login = await loginOnce(a);
      expect(login.status).toBe(200);
      const p = (await verifySessionToken(login.cookies.get("pf_session")!.value))!;
      expect(decryptField(getDEK(p.jti as string, u.id)!, ct)).toBe("kept");
    });

    it("wipe (new DEK) deletes the passkeys + wraps: old PRF can never open anything; clear-all-data nulls the wrap and prf_supported", async () => {
      const u = await mkUser(), v = await mkUser();
      const a = await enrollPrf(u);
      const b = await enrollPrf(v);
      const oldWrap = (await passkeyRow(a.id)).dekWrappedPrf!;
      await wipeUserDataAndRewrap(u.id, await hashPassword(NEW_PW), { kekSalt: "a", dekWrapped: "b", dekWrappedIv: "c", dekWrappedTag: "d" });
      expect(await passkeyRow(a.id)).toBeUndefined();
      expect((await loginOnce(a)).status).toBe(400);
      expect(oldWrap).toBeTruthy();
      await clearAllUserData(v.id);
      const row = await passkeyRow(b.id);
      expect(row.dekWrappedPrf).toBeNull();
      expect(row.prfSupported).toBe(0);
      const res = await loginOnce(b);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "prf_unavailable" });
    });

    it("re-enrolling PRF (e.g. after clear-all-data) re-wraps and logs in again", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      await clearAllUserData(u.id);
      expect((await loginOnce(a)).status).toBe(400);
      const { token } = await session(u.id, u.dek);
      const { json } = await prfOptions(token, a.id);
      expect((await finishPrf(token, { token: json.token, response: a.assert(json.options.challenge, K), prfOutput: a.prf(json.prfSalt) })).status).toBe(200);
      expect((await loginOnce(a)).status).toBe(200);
    });
  });

  // ───────────────────────── adversarial review (step-2 token abuse, concurrency) ─────────────────────────
  describe("adversarial: step-2 token binding", () => {
    async function step2(auth: SoftAuthenticator, route: "login" | "recovery") {
      const o = route === "login" ? (await loginOptions()).json : (await recOptions()).json;
      const body = { token: o.token, response: auth.assert(o.options.challenge, K) };
      const r1 = route === "login" ? await loginVerify(body) : await recReset(body);
      expect(r1.status).toBe(200);
      return r1.json();
    }

    it("a step-2 token (cred A) cannot be answered by another credential: same user or other user, even with that credential's own PRF", async () => {
      const u = await mkUser();
      const other = await mkUser();
      const a1 = await enrollPrf(u);
      const a2 = await enrollPrf(u);
      const b = await enrollPrf(other);
      for (const attacker of [a2, b]) {
        const x = await step2(a1, "login");
        const res = await loginVerify({
          token: x.token,
          response: attacker.assert(x.options.challenge, K),
          prfOutput: attacker.prf(prfSaltB64url(attacker.id)),
        });
        expect(res.status).toBe(400);
        expect(res.cookies.get("pf_session")).toBeUndefined();
      }
      // the legitimate credential still works with a fresh pair
      expect((await loginOnce(a1)).status).toBe(200);
    });

    it("a login step-2 token cannot finish a recovery (and vice versa): password untouched, no session", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const xl = await step2(a, "login");
      const r = await recReset({ token: xl.token, response: a.assert(xl.options.challenge, K), prfOutput: a.prf(xl.prfSalt), newPassword: NEW_PW });
      expect(r.status).toBe(400);
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
      const xr = await step2(a, "recovery");
      const l = await loginVerify({ token: xr.token, response: a.assert(xr.options.challenge, K), prfOutput: a.prf(xr.prfSalt) });
      expect(l.status).toBe(400);
      expect(l.cookies.get("pf_session")).toBeUndefined();
    });

    it("anonymous login/recovery tokens cannot be swapped into the user-bound finish-prf flow (no wrap written)", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator();
      await register(u, a);
      const { token: sess } = await session(u.id, u.dek);
      for (const o of [(await loginOptions(a.id)).json, (await recOptions(a.id)).json]) {
        const res = await finishPrf(sess, { token: o.token, response: a.assert(o.options.challenge, K), prfOutput: a.prf(o.prfSalt) });
        expect(res.status).toBe(400);
      }
      expect((await passkeyRow(a.id)).dekWrappedPrf).toBeNull();
    });

    it("a prf-options token (user+session+credential bound) cannot be used at login/recovery", async () => {
      const u = await mkUser();
      const a = new SoftAuthenticator();
      await register(u, a);
      const { token: sess } = await session(u.id, u.dek);
      const { json } = await prfOptions(sess, a.id);
      const l = await loginVerify({ token: json.token, response: a.assert(json.options.challenge, K), prfOutput: a.prf(json.prfSalt) });
      expect(l.status).toBe(400);
      const json2 = (await prfOptions(sess, a.id)).json;
      const r = await recReset({ token: json2.token, response: a.assert(json2.options.challenge, K), prfOutput: a.prf(json2.prfSalt), newPassword: NEW_PW });
      expect(r.status).toBe(400);
      expect(await passwordUnwrapsTo(u.id, OLD_PW)).not.toBeNull();
    });

    it("concurrent double submit of recovery: exactly one wins; DEK unchanged", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const { json } = await recOptions(a.id);
      const body = { token: json.token, response: a.assert(json.options.challenge, K), prfOutput: a.prf(json.prfSalt), newPassword: NEW_PW };
      const [x, y] = await Promise.all([recReset(body), recReset(body)]);
      expect([x.status, y.status].sort()).toEqual([200, 400]);
      const dek = await passwordUnwrapsTo(u.id, NEW_PW);
      expect(dek && dek.equals(u.dek)).toBe(true);
    });

    it("concurrent double submit of discoverable step 2: exactly one session", async () => {
      const u = await mkUser();
      const a = await enrollPrf(u);
      const x = await step2(a, "login");
      const b2 = { token: x.token, response: a.assert(x.options.challenge, K), prfOutput: a.prf(x.prfSalt) };
      const [p, q] = await Promise.all([loginVerify(b2), loginVerify(b2)]);
      expect([p.status, q.status].sort()).toEqual([200, 400]);
    });
  });

  // ───────────────────────── wiring ─────────────────────────
  describe("wiring", () => {
    it("new routes are NOT in the CSRF bypass list; cross-origin cookie POST -> 403, same-origin passes", () => {
      const src = fs.readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
      const block = src.slice(src.indexOf("const CSRF_BYPASS_PATHS"), src.indexOf("]);", src.indexOf("const CSRF_BYPASS_PATHS")));
      expect(block).not.toContain("passkey");
      for (const p of [
        "/api/auth/passkey/login/options", "/api/auth/passkey/login/verify",
        "/api/auth/recovery/passkey/options", "/api/auth/recovery/passkey/reset",
        "/api/settings/passkeys/register/prf-options", "/api/settings/passkeys/register/finish-prf",
      ]) {
        const bad = middleware(new NextRequest(`http://localhost:3000${p}`, { method: "POST", headers: { cookie: "pf_session=stale.cookie.x", origin: "https://evil.example" } }));
        expect(bad.status, p).toBe(403);
        const ok = middleware(new NextRequest(`http://localhost:3000${p}`, { method: "POST", headers: { cookie: "pf_session=stale.cookie.x", origin: "http://localhost:3000" } }));
        expect(ok.status, p).not.toBe(403);
      }
    });

    it("session cookies only through commitSession (static); PRF never read from extension results; never logged", () => {
      for (const f of ["src/app/api/auth/passkey/login/verify/route.ts", "src/app/api/auth/recovery/passkey/reset/route.ts"]) {
        const t = fs.readFileSync(path.join(process.cwd(), f), "utf8");
        expect(t, f).toMatch(/commitSession\(/);
        expect(t, f).not.toMatch(/cookies\s*\.\s*set\(\s*["']pf_session["']/);
        expect(t, f).not.toMatch(/console\./);
      }
      for (const f of [
        "src/lib/auth/passkey-prf.ts", "src/lib/auth/passkey-session.ts",
        "src/app/api/auth/passkey/login/verify/route.ts", "src/app/api/auth/recovery/passkey/reset/route.ts",
        "src/app/api/settings/passkeys/register/finish-prf/route.ts",
      ]) {
        const t = fs.readFileSync(path.join(process.cwd(), f), "utf8");
        expect(t, f).not.toMatch(/clientExtensionResults\s*\??\.\s*prf/);
        expect(t, f).not.toMatch(/console\./);
      }
    });
  });
});
