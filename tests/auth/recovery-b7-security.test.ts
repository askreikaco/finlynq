/**
 * Recovery B7 — security follow-ups + device account picker.
 * REAL Postgres (*_test DB) and REAL @simplewebauthn/server verification
 * against the software authenticator.
 *  (a) passkey-only users need a passkey assertion for delete-account,
 *      wipe-account, admin email-integration and admin user PATCH
 *  (b) removing a passkey needs a second-factor proof on non-mfa sessions
 *  (c) passkey_login_failed is emitted
 *  (d) device/check lists VALID entries only (masked), device/reset takes deviceId
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { TOTP } from "otpauth";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.PF_TRUSTED_DEVICE_DAYS = "30";
process.env.PF_PEPPER = process.env.PF_PEPPER || "test-pepper-at-least-32-chars-long-ok-yes";
process.env.APP_URL = "https://money.example.test";
process.env.PF_STAGING_KEY = process.env.PF_STAGING_KEY || "b7-test-staging-key-0123456789abcdef!";
delete process.env.PF_WEBAUTHN_RP_ID;
delete process.env.PF_WEBAUTHN_ORIGINS;

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { SoftAuthenticator } from "../helpers/soft-authenticator";
import { db, schema as s } from "@/db";
import { createUser, enableUserMfa, getUserById } from "@/lib/auth/queries";
import { createWrappedDEKForPassword } from "@/lib/crypto/envelope";
import { hashPassword } from "@/lib/auth";
import { createSessionToken, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";
import { putDEK } from "@/lib/crypto/dek-cache";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { issueDevice } from "@/lib/auth/trusted-device";
import { maskIdentity } from "@/lib/auth/mask-identity";
import { prfSaltB64url } from "@/lib/auth/passkey-prf";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const PW = "Hr4$yBn8@Cp6sGe1";
const NEW_PW = "Zq7!vLm3#Xt9wKd2";
const K = { origin: "https://money.example.test", rpId: "money.example.test" };

let ipc = 0;
const freshIp = () => `10.17.${(ipc >> 8) & 255}.${(ipc++ % 250) + 1}`;

async function mkUser(opts: { totp?: boolean; admin?: boolean } = {}) {
  const { dek, wrapped } = createWrappedDEKForPassword(PW);
  const email = `b7${crypto.randomUUID().slice(0, 12)}@example.com`;
  const u = await createUser({
    username: "fin" + crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(PW),
    kekSalt: wrapped.salt.toString("base64"),
    dekWrapped: wrapped.wrapped.toString("base64"),
    dekWrappedIv: wrapped.iv.toString("base64"),
    dekWrappedTag: wrapped.tag.toString("base64"),
  } as Parameters<typeof createUser>[0]);
  const id = u.id as string;
  let totpSecret: string | undefined;
  if (opts.totp) {
    totpSecret = generateMfaSecret(email).secret;
    await enableUserMfa(id, totpSecret, dek);
  }
  if (opts.admin) await db.update(s.users).set({ role: "admin" }).where(eq(s.users.id, id));
  return { id, dek, email, totpSecret };
}
type U = Awaited<ReturnType<typeof mkUser>>;

async function session(u: U, mfa = true) {
  const { token, jti } = await createSessionToken(u.id, mfa);
  putDEK(jti, Buffer.from(u.dek), 60_000, u.id);
  return { token, jti };
}

const sreq = (method: string, urlPath: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost:3000${urlPath}`, {
    method,
    headers: { "content-type": "application/json", "x-real-ip": freshIp(), ...(token ? { cookie: `pf_session=${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
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
  byId: () => import("@/app/api/settings/passkeys/[id]/route"),
  stepOptions: () => import("@/app/api/auth/step-up/passkey/options/route"),
  del: () => import("@/app/api/auth/delete-account/route"),
  wipe: () => import("@/app/api/auth/wipe-account/route"),
  adminUsers: () => import("@/app/api/admin/users/route"),
  adminEmail: () => import("@/app/api/admin/integrations/email/settings/route"),
  loginOptions: () => import("@/app/api/auth/passkey/login/options/route"),
  loginVerify: () => import("@/app/api/auth/passkey/login/verify/route"),
  devCheck: () => import("@/app/api/auth/recovery/device/check/route"),
  devReset: () => import("@/app/api/auth/recovery/device/reset/route"),
};
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function enroll(u: U, auth = new SoftAuthenticator()) {
  const { token } = await session(u);
  const o = await (await routes.regOptions()).POST(sreq("POST", "/api/settings/passkeys/register/options", token, {}));
  const oj = await o.json();
  const v = await (await routes.regVerify()).POST(
    sreq("POST", "/api/settings/passkeys/register/verify", token, { token: oj.token, response: auth.attest(oj.options.challenge, K), label: "k" })
  );
  expect(v.status).toBe(200);
  return auth;
}

/** Step-up assertion for `action` minted in session `sess`. */
async function stepUp(sess: { token: string }, action: string, auth: SoftAuthenticator) {
  const r = await (await routes.stepOptions()).POST(sreq("POST", "/api/auth/step-up/passkey/options", sess.token, { action }));
  expect(r.status).toBe(200);
  const j = await r.json();
  return { token: j.token as string, response: auth.assert(j.options.challenge, K) };
}

const eventsOf = async (uid: string, event: string) =>
  (await db.select().from(s.userSecurityEvents).where(and(eq(s.userSecurityEvents.userId, uid), eq(s.userSecurityEvents.event, event)))).length;
const flush = () => new Promise((r) => setTimeout(r, 80));
const userExists = async (id: string) => (await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, id))).length === 1;
const totpNow = (secret: string) => new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();

describe("maskIdentity", () => {
  it("masks email local part with a fixed star run; usernames too; never the full value", () => {
    expect(maskIdentity("alice@example.com")).toBe("a***@example.com");
    expect(maskIdentity("al@x.io")).toBe("a***@x.io");
    expect(maskIdentity(null, "alice")).toBe("a***");
    expect(maskIdentity(null, null)).toBe("***");
  });
});

describe.skipIf(!HAS_DB)("recovery B7 security follow-ups (real Postgres, real verification)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => { _clearSessionCutoffCache(); _clearRevokedJtiCache(); });

  // ───────────────────────── (a) passkey-only step-up ─────────────────────────
  describe("step-up options route", () => {
    it("needs a web session, a known action, and a registered passkey; token is single use and bound to action + session", async () => {
      const { POST } = await routes.stepOptions();
      expect((await POST(sreq("POST", "/api/auth/step-up/passkey/options", null, { action: "delete-account" }))).status).toBe(401);
      const none = await mkUser();
      const ns = await session(none);
      expect((await POST(sreq("POST", "/api/auth/step-up/passkey/options", ns.token, { action: "delete-account" }))).status).toBe(400);
      const u = await mkUser();
      await enroll(u);
      const st = await session(u);
      expect((await POST(sreq("POST", "/api/auth/step-up/passkey/options", st.token, { action: "nope" }))).status).toBe(400);
      const ok = await POST(sreq("POST", "/api/auth/step-up/passkey/options", st.token, { action: "delete-account" }));
      expect(ok.status).toBe(200);
      const j = await ok.json();
      expect(j.options.userVerification).toBe("required");
      expect(j.options.allowCredentials).toHaveLength(1);
    });
  });

  describe("delete-account", () => {
    const delBody = (extra: Record<string, unknown> = {}) => ({ password: PW, confirmation: "DELETE", ...extra });
    // delete-account is limited to 3 attempts/h per (user, x-forwarded-for): vary the IP per call.
    const dreq = (tok: string, body: unknown) => sreq("POST", "/api/auth/delete-account", tok, body, { "x-forwarded-for": freshIp() });

    it("passkey-only user: password alone is refused (401 passkey-required) and the account survives", async () => {
      const u = await mkUser();
      await enroll(u);
      const st = await session(u);
      const { POST } = await routes.del();
      const res = await POST(dreq(st.token, delBody()));
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe("passkey-required");
      expect(await userExists(u.id)).toBe(true);
    });

    it("passkey-only user: valid assertion deletes; token bound to another action / another session / replay / other user's passkey all refused", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const st = await session(u);
      const other = await session(u);
      const { POST } = await routes.del();
      const wrongAction = await stepUp(st, "wipe-account", auth);
      expect((await POST(dreq(st.token, delBody({ passkeyStepUp: wrongAction })))).status).toBe(401);
      const otherSess = await stepUp(other, "delete-account", auth);
      expect((await POST(dreq(st.token, delBody({ passkeyStepUp: otherSess })))).status).toBe(401);
      // someone else's passkey
      const intruder = await mkUser();
      const iAuth = await enroll(intruder);
      const iSess = await session(intruder);
      const foreign = await stepUp(iSess, "delete-account", iAuth);
      expect((await POST(dreq(st.token, delBody({ passkeyStepUp: foreign })))).status).toBe(401);
      expect(await userExists(u.id)).toBe(true);

      const good = await stepUp(st, "delete-account", auth);
      const okRes = await POST(dreq(st.token, delBody({ passkeyStepUp: good })));
      expect(okRes.status).toBe(200);
      expect(await userExists(u.id)).toBe(false);
      // replay of the consumed token is dead
      const again = await POST(dreq(st.token, delBody({ passkeyStepUp: good })));
      expect(again.status).not.toBe(200);
    });

    it("user with NO second factor is unchanged (password + DELETE deletes)", async () => {
      const u = await mkUser();
      const st = await session(u);
      const res = await (await routes.del()).POST(dreq(st.token, delBody()));
      expect(res.status).toBe(200);
      expect(await userExists(u.id)).toBe(false);
    });

    it("TOTP user is still TOTP-gated (no passkey assertion needed)", async () => {
      const u = await mkUser({ totp: true });
      const st = await session(u);
      const { POST } = await routes.del();
      expect((await (await POST(dreq(st.token, delBody()))).json()).code).toBe("mfa-required");
      expect((await POST(dreq(st.token, delBody({ mfaCode: totpNow(u.totpSecret!) })))).status).toBe(200);
    });
  });

  describe("wipe-account", () => {
    it("passkey-only user: password alone refused; wrong-action token refused; valid assertion wipes (user row stays)", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const st = await session(u);
      const { POST } = await routes.wipe();
      const body = (extra: Record<string, unknown> = {}) => ({ password: PW, confirmation: "WIPE", ...extra });
      const r1 = await POST(sreq("POST", "/api/auth/wipe-account", st.token, body()));
      expect(r1.status).toBe(401);
      expect((await r1.json()).code).toBe("passkey-required");
      const wrong = await stepUp(st, "delete-account", auth);
      expect((await POST(sreq("POST", "/api/auth/wipe-account", st.token, body({ passkeyStepUp: wrong })))).status).toBe(401);
      const good = await stepUp(st, "wipe-account", auth);
      expect((await POST(sreq("POST", "/api/auth/wipe-account", st.token, body({ passkeyStepUp: good })))).status).toBe(200);
      expect(await userExists(u.id)).toBe(true);
    });
  });

  describe("admin email integration + admin user PATCH", () => {
    it("stepUpKindFor: passkey-only -> passkey, TOTP -> mfa, none -> password", async () => {
      const { stepUpKindFor } = await import("@/lib/admin/email-integration");
      const pk = await mkUser({ admin: true }); await enroll(pk);
      const tp = await mkUser({ admin: true, totp: true });
      const no = await mkUser({ admin: true });
      expect(await stepUpKindFor(pk.id)).toBe("passkey");
      expect(await stepUpKindFor(tp.id)).toBe("mfa");
      expect(await stepUpKindFor(no.id)).toBe("password");
    });

    it("email settings PUT: passkey-only admin cannot use a password; assertion for the right action passes, wrong action refused", async () => {
      const admin = await mkUser({ admin: true });
      const auth = await enroll(admin);
      const st = await session(admin);
      const { PUT } = await routes.adminEmail();
      const put = (extra: Record<string, unknown>) =>
        PUT(sreq("PUT", "/api/admin/integrations/email/settings", st.token, { provider: "auto", ...extra }));
      const pw = await put({ password: PW });
      expect(pw.status).toBe(403);
      expect((await pw.json()).code).toBe("PASSKEY_REQUIRED");
      const wrong = await stepUp(st, "admin-user-update", auth);
      expect((await put({ passkeyStepUp: wrong })).status).toBe(401);
      const good = await stepUp(st, "admin-email-integration", auth);
      expect((await put({ passkeyStepUp: good })).status).toBe(200);
    });

    it("admin users PATCH: role change by a passkey-only admin needs an assertion; non-sensitive edit does not", async () => {
      const admin = await mkUser({ admin: true });
      const auth = await enroll(admin);
      const target = await mkUser();
      const st = await session(admin);
      const { PATCH } = await routes.adminUsers();
      const patch = (b: Record<string, unknown>) => PATCH(sreq("PATCH", "/api/admin/users", st.token, { userId: target.id, ...b }));
      expect((await patch({ displayName: "Plain Edit" })).status).toBe(200);
      const r = await patch({ role: "admin" });
      expect(r.status).toBe(403);
      expect((await r.json()).code).toBe("PASSKEY_REQUIRED");
      expect((await getUserById(target.id))!.role).toBe("user");
      const wrong = await stepUp(st, "delete-account", auth);
      expect((await patch({ role: "admin", passkeyStepUp: wrong })).status).toBe(401);
      const good = await stepUp(st, "admin-user-update", auth);
      expect((await patch({ role: "admin", passkeyStepUp: good })).status).toBe(200);
      expect((await getUserById(target.id))!.role).toBe("admin");
    });
  });

  // ───────────────────────── (b) passkey removal ─────────────────────────
  describe("passkey removal needs a second factor when the session is not mfa-verified", () => {
    it("non-mfa session, no proof -> 401 second-factor-required, passkey kept; mfa session needs none", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const { DELETE } = await routes.byId();
      const weak = await session(u, false);
      const res = await DELETE(sreq("DELETE", "/x", weak.token, {}), idCtx(auth.id));
      expect(res.status).toBe(401);
      const j = await res.json();
      expect(j.code).toBe("second-factor-required");
      expect(j.methods).toContain("passkey");
      expect(await db.select().from(s.userPasskeys).where(eq(s.userPasskeys.userId, u.id))).toHaveLength(1);

      const strong = await session(u, true);
      expect((await DELETE(sreq("DELETE", "/x", strong.token, {}), idCtx(auth.id))).status).toBe(200);
    });

    it("non-mfa session: passkey assertion (bound to passkey-remove) removes; wrong-action assertion does not", async () => {
      const u = await mkUser();
      const keep = await enroll(u);
      const victim = await enroll(u);
      const weak = await session(u, false);
      const { DELETE } = await routes.byId();
      const wrong = await stepUp(weak, "delete-account", keep);
      expect((await DELETE(sreq("DELETE", "/x", weak.token, { passkeyStepUp: wrong }), idCtx(victim.id))).status).toBe(401);
      const good = await stepUp(weak, "passkey-remove", keep);
      expect((await DELETE(sreq("DELETE", "/x", weak.token, { passkeyStepUp: good }), idCtx(victim.id))).status).toBe(200);
      expect(await db.select().from(s.userPasskeys).where(eq(s.userPasskeys.userId, u.id))).toHaveLength(1);
    });

    it("non-mfa session: TOTP code removes; wrong code does not; TOTP is not offered to a user without it", async () => {
      const u = await mkUser({ totp: true });
      const a = await enroll(u);
      const weak = await session(u, false);
      const { DELETE } = await routes.byId();
      expect((await DELETE(sreq("DELETE", "/x", weak.token, { totpCode: "000000" }), idCtx(a.id))).status).toBe(401);
      expect((await DELETE(sreq("DELETE", "/x", weak.token, { totpCode: totpNow(u.totpSecret!) }), idCtx(a.id))).status).toBe(200);

      const nt = await mkUser();
      const b = await enroll(nt);
      const w2 = await session(nt, false);
      const res = await DELETE(sreq("DELETE", "/x", w2.token, { totpCode: "123456" }), idCtx(b.id));
      expect(res.status).toBe(401);
      expect(await db.select().from(s.userPasskeys).where(eq(s.userPasskeys.userId, nt.id))).toHaveLength(1);
    });
  });

  // ───────────────────────── (c) passkey_login_failed ─────────────────────────
  describe("passkey_login_failed", () => {
    it("emitted when a known credential fails sign-in (bad PRF); not emitted for success", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      // give the credential a PRF wrap so a wrong PRF output reaches the unwrap
      const { wrapDekWithPrf } = await import("@/lib/auth/passkey-prf");
      const prf = Buffer.from(auth.prf(prfSaltB64url(auth.id))!, "base64url");
      await db.update(s.userPasskeys).set({
        prfSupported: 1,
        dekWrappedPrf: wrapDekWithPrf(Buffer.from(u.dek), prf, { userId: u.id, credentialId: auth.id, version: 1 }),
      }).where(eq(s.userPasskeys.userId, u.id));

      const attempt = async (prfOutput: string) => {
        const o = await (await routes.loginOptions()).POST(areq("/api/auth/passkey/login/options", { credentialId: auth.id }));
        const oj = await o.json();
        return (await routes.loginVerify()).POST(
          areq("/api/auth/passkey/login/verify", { token: oj.token, response: auth.assert(oj.options.challenge, K), prfOutput })
        );
      };
      const bad = await attempt(crypto.randomBytes(32).toString("base64url"));
      expect(bad.status).toBe(400);
      await flush();
      expect(await eventsOf(u.id, "passkey_login_failed")).toBe(1);

      const ok = await attempt(auth.prf(prfSaltB64url(auth.id))!);
      expect(ok.status).toBe(200);
      await flush();
      expect(await eventsOf(u.id, "passkey_login_failed")).toBe(1);
      expect(await eventsOf(u.id, "passkey_login_success")).toBe(1);
    });

    it("emitted on a counter regression (cloned authenticator) for sign-in", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      await db.update(s.userPasskeys).set({ counter: 50 }).where(eq(s.userPasskeys.userId, u.id));
      const o = await (await routes.loginOptions()).POST(areq("/api/auth/passkey/login/options", { credentialId: auth.id }));
      const oj = await o.json();
      const res = await (await routes.loginVerify()).POST(
        areq("/api/auth/passkey/login/verify", { token: oj.token, response: auth.assert(oj.options.challenge, K, { counter: 3 }) })
      );
      expect(res.status).toBe(400);
      await flush();
      expect(await eventsOf(u.id, "passkey_login_failed")).toBe(1);
    });
  });

  // ───────────────────────── (d) device account picker ─────────────────────────
  describe("device/check account picker", () => {
    const chk = (cookie?: string) =>
      areq("/api/auth/recovery/device/check", {}, cookie ? { cookie: `pf_device=${cookie}` } : {});

    async function twoAccounts() {
      const a = await mkUser({ totp: true });
      const b = await mkUser({ totp: true });
      const da = (await issueDevice(a.id, a.dek))!;
      const db2 = (await issueDevice(b.id, b.dek, undefined, undefined, da.cookieList))!;
      return { a, b, da, db2, cookie: db2.cookieList };
    }

    it("lists every VALID entry with a masked account, never the raw email", async () => {
      const { a, b, da, db2, cookie } = await twoAccounts();
      const { POST } = await routes.devCheck();
      const res = await POST(chk(cookie));
      const j = await res.json();
      expect(j.available).toBe(true);
      expect(j.accounts).toHaveLength(2);
      expect(j.accounts.map((x: { deviceId: string }) => x.deviceId).sort()).toEqual([da.id, db2.id].sort());
      const text = JSON.stringify(j);
      expect(text).not.toContain(a.email);
      expect(text).not.toContain(b.email);
      expect(j.accounts[0].account).toBe(maskIdentity(b.email)); // newest first
      expect(j.accounts.every((x: { needs: string }) => x.needs === "totp")).toBe(true);
    });

    it("entries without a valid secret / revoked / unknown contribute nothing; no valid entry = the uniform {available:false}", async () => {
      const { a, da, db2 } = await twoAccounts();
      const { POST } = await routes.devCheck();
      const forged = `${da.id}.${crypto.randomBytes(32).toString("base64url")}`;
      const unknown = `${crypto.randomUUID()}.abc`;
      const onlyForged = await (await POST(chk(`${forged},${unknown}`))).text();
      const none = await (await POST(chk())).text();
      expect(onlyForged).toBe(none);
      expect(JSON.parse(none)).toEqual({ available: false });
      // one valid + one forged: only the valid one is listed
      const mixed = await (await POST(chk(`${forged},${db2.cookieValue}`))).json();
      expect(mixed.accounts).toHaveLength(1);
      expect(mixed.accounts[0].deviceId).toBe(db2.id);
      // revoke it: gone
      await db.update(s.userDevices).set({ revokedAt: new Date().toISOString() }).where(eq(s.userDevices.id, db2.id));
      expect(await (await POST(chk(db2.cookieValue))).text()).toBe(none);
      expect(a.id).toBeTruthy();
    });

    it("an account without TOTP/codes shows available:false setup_required in the list", async () => {
      const a = await mkUser({ totp: true });
      const b = await mkUser();
      const da = (await issueDevice(a.id, a.dek))!;
      const dbb = (await issueDevice(b.id, b.dek, undefined, undefined, da.cookieList))!;
      const j = await (await (await routes.devCheck()).POST(chk(dbb.cookieList))).json();
      expect(j.available).toBe(false); // first (newest) entry is not usable
      const byId = Object.fromEntries(j.accounts.map((x: { deviceId: string }) => [x.deviceId, x]));
      expect(byId[dbb.id]).toMatchObject({ available: false, needs: null, reason: "setup_required" });
      expect(byId[da.id]).toMatchObject({ available: true, needs: "totp" });
    });

    it("device/reset with deviceId resets THAT account (not the first); a deviceId without a valid secret fails uniformly", async () => {
      const { a, b, da, cookie } = await twoAccounts();
      const { POST } = await routes.devReset();
      const reset = (body: Record<string, unknown>, c = cookie) =>
        POST(areq("/api/auth/recovery/device/reset", { newPassword: NEW_PW, ...body }, { cookie: `pf_device=${c}` }));
      const forgedList = `${da.id}.${crypto.randomBytes(32).toString("base64url")},${cookie.split(",")[0]}`;
      const forged = await reset({ deviceId: da.id, proof: { type: "totp", value: totpNow(a.totpSecret!) } }, forgedList);
      expect(forged.status).toBe(400);
      expect(await forged.json()).toEqual({ error: "Recovery failed. Check your details and try again." });

      const res = await reset({ deviceId: da.id, proof: { type: "totp", value: totpNow(a.totpSecret!) } });
      expect(res.status).toBe(200);
      const ua = await getUserById(a.id);
      const ub = await getUserById(b.id);
      const { verifyPassword } = await import("@/lib/auth");
      expect(await verifyPassword(NEW_PW, ua!.passwordHash as string)).toBe(true);
      expect(await verifyPassword(NEW_PW, ub!.passwordHash as string)).toBe(false);
    });
  });
});
