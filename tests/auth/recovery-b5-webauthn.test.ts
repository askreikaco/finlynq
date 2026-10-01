/**
 * Recovery B5 — WebAuthn core, passkey management, passkey as 2FA.
 * REAL Postgres (*_test DB) and REAL @simplewebauthn/server verification
 * against a software authenticator (tests/helpers/soft-authenticator.ts).
 * Nothing about the verification itself is mocked.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { SignJWT } from "jose";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.PF_TRUSTED_DEVICE_DAYS = "30";
process.env.PF_PEPPER = process.env.PF_PEPPER || "test-pepper-at-least-32-chars-long-ok-yes";
process.env.APP_URL = "https://money.example.test";
delete process.env.PF_WEBAUTHN_RP_ID;
delete process.env.PF_WEBAUTHN_ORIGINS;

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { SoftAuthenticator } from "../helpers/soft-authenticator";
import { db, schema as s } from "@/db";
import { createUser, enableUserMfa, getUserById, insertPasskey } from "@/lib/auth/queries";
import { createWrappedDEKForPassword } from "@/lib/crypto/envelope";
import { hashPassword } from "@/lib/auth";
import { createSessionToken, verifySessionToken, isJtiRevoked, signShortLived, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";
import { putDEK, getDEK } from "@/lib/crypto/dek-cache";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { redeemDevice } from "@/lib/auth/trusted-device";
import { issueSessionForDek } from "@/lib/auth/finish-login";
import { apiKeyStrategy, accountStrategy } from "@/lib/auth/require-auth";
import { middleware } from "@/middleware";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const PW = "Hr4$yBn8@Cp6sGe1";
const ORIGIN = "https://money.example.test";
const RP = "money.example.test";
const K = { origin: ORIGIN, rpId: RP };

let ipc = 0;
const freshIp = () => `10.9.${(ipc >> 8) & 255}.${(ipc++ % 250) + 1}`;

async function mkUser(opts: { totp?: boolean } = {}) {
  const { dek, wrapped } = createWrappedDEKForPassword(PW);
  const email = `p${crypto.randomUUID().slice(0, 12)}@example.com`;
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

async function pending(u: U) {
  const { token, jti } = await createSessionToken(u.id, false, { pending: true, expirationTime: "5m" });
  putDEK(jti, Buffer.from(u.dek), 5 * 60_000, u.id);
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
  list: () => import("@/app/api/settings/passkeys/route"),
  regOptions: () => import("@/app/api/settings/passkeys/register/options/route"),
  regVerify: () => import("@/app/api/settings/passkeys/register/verify/route"),
  byId: () => import("@/app/api/settings/passkeys/[id]/route"),
  mfaOptions: () => import("@/app/api/auth/mfa/webauthn/options/route"),
  mfaVerify: () => import("@/app/api/auth/mfa/webauthn/verify/route"),
};
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

async function regOptions(sessTok: string, body: unknown = {}) {
  const { POST } = await routes.regOptions();
  const res = await POST(sreq("POST", "/api/settings/passkeys/register/options", sessTok, body));
  return { res, json: res.status === 200 ? await res.clone().json() : null };
}
async function regVerify(sessTok: string, token: string, response: unknown, label?: string) {
  const { POST } = await routes.regVerify();
  return POST(sreq("POST", "/api/settings/passkeys/register/verify", sessTok, { token, response, label }));
}
/** Full happy-path registration for `u`; returns the authenticator. */
async function enroll(u: U, label = "My key", auth = new SoftAuthenticator()) {
  const { token } = await session(u.id, u.dek);
  const { json } = await regOptions(token);
  const res = await regVerify(token, json.token, auth.attest(json.options.challenge, K), label);
  expect(res.status).toBe(200);
  return auth;
}
const passkeyRows = (uid: string) => db.select().from(s.userPasskeys).where(eq(s.userPasskeys.userId, uid));
const eventsOf = async (uid: string, event: string) =>
  (await db.select().from(s.userSecurityEvents).where(and(eq(s.userSecurityEvents.userId, uid), eq(s.userSecurityEvents.event, event)))).length;
const flush = () => new Promise((r) => setTimeout(r, 50));

async function mfaOptions(p: { token: string }) {
  const { POST } = await routes.mfaOptions();
  const res = await POST(areq("/api/auth/mfa/webauthn/options", { mfaPendingToken: p.token }));
  return { res, json: res.status === 200 ? await res.clone().json() : null };
}
async function mfaVerify(p: { token: string }, token: string, response: unknown, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const { POST } = await routes.mfaVerify();
  return POST(areq("/api/auth/mfa/webauthn/verify", { mfaPendingToken: p.token, token, response, ...extra }, headers));
}

describe.skipIf(!HAS_DB)("recovery B5 WebAuthn (real Postgres, real verification)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => { _clearSessionCutoffCache(); _clearRevokedJtiCache(); });

  // ───────────────────────── registration + management ─────────────────────────
  describe("passkey registration + list", () => {
    it("register -> list shows it; stored row has UV key, counter, no PRF wrap; list never leaks key material", async () => {
      const u = await mkUser();
      const auth = await enroll(u, "Laptop");
      const { token } = await session(u.id, u.dek);
      const { GET } = await routes.list();
      const res = await GET(sreq("GET", "/api/settings/passkeys", token));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.passkeys).toHaveLength(1);
      expect(body.passkeys[0]).toMatchObject({ id: auth.id, label: "Laptop", prfSupported: false });
      expect(Object.keys(body.passkeys[0]).sort()).toEqual(["backedUp", "createdAt", "id", "label", "lastUsedAt", "prfSupported", "transports"]);
      const rows = await passkeyRows(u.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].publicKey.length).toBeGreaterThan(40);
      expect(rows[0].dekWrappedPrf).toBeNull();
      expect(rows[0].prfSupported).toBe(0);
      await flush();
      expect(await eventsOf(u.id, "passkey_added")).toBe(1);
    });

    it("register/verify: missing label -> generated name (UA), dup -> (2); provided label wins as-is", async () => {
      const u = await mkUser();
      const { token } = await session(u.id, u.dek);
      const { POST } = await routes.regVerify();
      const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
      const add = async (label: string | undefined, a = new SoftAuthenticator()) => {
        const { json } = await regOptions(token);
        const res = await POST(sreq("POST", "/api/settings/passkeys/register/verify", token, { token: json.token, response: a.attest(json.options.challenge, K), label }, { "user-agent": MAC }));
        expect(res.status).toBe(200);
        return (await res.json()).label as string;
      };
      expect(await add(undefined)).toBe("Mac · Chrome");
      expect(await add(undefined)).toBe("Mac · Chrome (2)");
      expect(await add("My YubiKey")).toBe("My YubiKey");
      expect(await add("My YubiKey")).toBe("My YubiKey"); // provided wins, no suffix
      expect((await passkeyRows(u.id)).map((r) => r.label).sort()).toEqual(["Mac · Chrome", "Mac · Chrome (2)", "My YubiKey", "My YubiKey"]);
    });

    it("register/verify: no label and no usable UA -> \"Passkey\"", async () => {
      const u = await mkUser();
      const { token } = await session(u.id, u.dek);
      const { json } = await regOptions(token);
      const { POST } = await routes.regVerify();
      const res = await POST(sreq("POST", "/api/settings/passkeys/register/verify", token, { token: json.token, response: new SoftAuthenticator().attest(json.options.challenge, K) }, { "user-agent": "curl/8" }));
      expect((await res.json()).label).toBe("Passkey");
    });

    it("options: no session DEK -> 423; stale session needs password (missing 401, wrong 401, right 200)", async () => {
      const u = await mkUser();
      const noDek = await session(u.id, u.dek, { noDek: true });
      expect((await regOptions(noDek.token)).res.status).toBe(423);
      const stale = await session(u.id, u.dek, { ageSec: 3600 });
      expect((await regOptions(stale.token)).res.status).toBe(401);
      expect((await regOptions(stale.token, { currentPassword: "Wr0ng!Passw0rd#x" })).res.status).toBe(401);
      const ok = await regOptions(stale.token, { currentPassword: PW });
      expect(ok.res.status).toBe(200);
      expect(ok.json.options.authenticatorSelection.userVerification).toBe("required");
      expect(ok.json.options.attestation).toBe("none");
      expect(ok.json.options.rp.id).toBe(RP);
      // userHandle = users.id
      expect(Buffer.from(ok.json.options.user.id, "base64url").toString()).toBe(u.id);
      expect(await passkeyRows(u.id)).toHaveLength(0);
    });

    it("rejections store nothing: wrong challenge, wrong origin, wrong rpID, UV=false, garbage", async () => {
      const u = await mkUser();
      const { token } = await session(u.id, u.dek);
      const cases: Array<[string, (c: string) => unknown]> = [
        ["wrong challenge", () => new SoftAuthenticator().attest(crypto.randomBytes(32).toString("base64url"), K)],
        ["wrong origin", (c) => new SoftAuthenticator().attest(c, { origin: "https://evil.example", rpId: RP })],
        ["wrong rpID", (c) => new SoftAuthenticator().attest(c, { origin: ORIGIN, rpId: "evil.example" })],
        ["UV=false", (c) => new SoftAuthenticator().attest(c, { ...K, uv: false })],
        ["garbage", () => ({ id: "x", rawId: "x", type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: "AAAA", attestationObject: "AAAA" } })],
      ];
      for (const [name, mk] of cases) {
        const { json } = await regOptions(token);
        const res = await regVerify(token, json.token, mk(json.options.challenge));
        expect(res.status, name).toBe(400);
      }
      expect(await passkeyRows(u.id)).toHaveLength(0);
    });

    it("challenge is single use: replay of a verified token fails; failed attempt also burns it", async () => {
      const u = await mkUser();
      const { token } = await session(u.id, u.dek);
      const { json } = await regOptions(token);
      const a = new SoftAuthenticator();
      const resp = a.attest(json.options.challenge, K);
      expect((await regVerify(token, json.token, resp)).status).toBe(200);
      expect((await regVerify(token, json.token, resp)).status).toBe(400); // replay
      expect(await passkeyRows(u.id)).toHaveLength(1);

      const second = await regOptions(token);
      const b = new SoftAuthenticator();
      // failed attempt (wrong origin) burns the challenge...
      expect((await regVerify(token, second.json.token, b.attest(second.json.options.challenge, { origin: "https://evil.example", rpId: RP }))).status).toBe(400);
      // ...so even the correct response with the same token is refused
      expect((await regVerify(token, second.json.token, b.attest(second.json.options.challenge, K))).status).toBe(400);
      expect(await passkeyRows(u.id)).toHaveLength(1);
    });

    it("token binding: other user's token, other session's token, wrong purpose, expired token are all rejected", async () => {
      const u = await mkUser(); const v = await mkUser();
      const su = await session(u.id, u.dek); const sv = await session(v.id, v.dek);
      const { json } = await regOptions(su.token);
      const a = new SoftAuthenticator();
      // other user
      expect((await regVerify(sv.token, json.token, a.attest(json.options.challenge, K))).status).toBe(400);
      // same user, different session
      const su2 = await session(u.id, u.dek);
      expect((await regVerify(su2.token, json.token, a.attest(json.options.challenge, K))).status).toBe(400);
      // wrong purpose (a 2FA-purpose token for the same user/challenge)
      const wrongPurpose = await signShortLived({ challenge: json.options.challenge, userId: u.id, sid: su.jti, jti: crypto.randomUUID() }, 300, "passkey-2fa");
      expect((await regVerify(su.token, wrongPurpose, a.attest(json.options.challenge, K))).status).toBe(400);
      // expired
      const expired = await signShortLived({ challenge: json.options.challenge, userId: u.id, sid: su.jti, jti: crypto.randomUUID() }, -30, "passkey-register");
      expect((await regVerify(su.token, expired, a.attest(json.options.challenge, K))).status).toBe(400);
      // garbage
      expect((await regVerify(su.token, "x".repeat(40), a.attest(json.options.challenge, K))).status).toBe(400);
      expect(await passkeyRows(u.id)).toHaveLength(0);
      expect(await passkeyRows(v.id)).toHaveLength(0);
      // the legit token still works exactly once afterwards (rejections above did not consume it)
      expect((await regVerify(su.token, json.token, a.attest(json.options.challenge, K))).status).toBe(200);
    });

    it("a credential id already registered (any account) is never adopted or overwritten", async () => {
      const u = await mkUser(); const v = await mkUser();
      const a = await enroll(u);
      const before = (await passkeyRows(u.id))[0];
      const { token } = await session(v.id, v.dek);
      const { json } = await regOptions(token);
      const clone = new SoftAuthenticator();
      Object.defineProperty(clone, "credentialId", { value: a.credentialId });
      expect((await regVerify(token, json.token, clone.attest(json.options.challenge, K))).status).toBe(400);
      expect(await passkeyRows(v.id)).toHaveLength(0);
      const after = (await passkeyRows(u.id))[0];
      expect(after.publicKey).toBe(before.publicKey);
    });

    it("excludeCredentials lists existing passkeys; cap of 20 enforced", async () => {
      const u = await mkUser();
      const a = await enroll(u);
      const { token } = await session(u.id, u.dek);
      const { json } = await regOptions(token);
      expect(json.options.excludeCredentials.map((c: { id: string }) => c.id)).toEqual([a.id]);
      for (let i = 0; i < 19; i++) {
        await insertPasskey({ id: crypto.randomUUID(), userId: u.id, publicKey: "AAAA", counter: 0, backedUp: 0, prfSupported: 0, createdAt: new Date().toISOString() });
      }
      expect((await regOptions(token)).res.status).toBe(400);
    });
  });

  describe("rename / delete / ownership / auth methods", () => {
    it("rename: owner ok, label validated, other user's passkey is 404 and untouched", async () => {
      const u = await mkUser(); const v = await mkUser();
      const a = await enroll(u, "Old");
      const { PATCH } = await routes.byId();
      const st = await session(u.id, u.dek);
      const ok = await PATCH(sreq("PATCH", `/api/settings/passkeys/${a.id}`, st.token, { label: "New" }), idCtx(a.id));
      expect(ok.status).toBe(200);
      expect((await passkeyRows(u.id))[0].label).toBe("New");
      expect((await PATCH(sreq("PATCH", "/x", st.token, { label: "" }), idCtx(a.id))).status).toBe(400);
      expect((await PATCH(sreq("PATCH", "/x", st.token, { label: "x".repeat(61) }), idCtx(a.id))).status).toBe(400);
      const sv = await session(v.id, v.dek);
      expect((await PATCH(sreq("PATCH", "/x", sv.token, { label: "Pwned" }), idCtx(a.id))).status).toBe(404);
      expect((await passkeyRows(u.id))[0].label).toBe("New");
    });

    it("delete requires step-up: stale session without/with wrong password refused (row stays), right password deletes; fresh session ok", async () => {
      const u = await mkUser();
      const a = await enroll(u);
      const { DELETE } = await routes.byId();
      const stale = await session(u.id, u.dek, { ageSec: 3600 });
      const del = (tok: string, body?: unknown) => DELETE(sreq("DELETE", `/api/settings/passkeys/${a.id}`, tok, body ?? {}), idCtx(a.id));
      expect((await del(stale.token)).status).toBe(401);
      expect((await del(stale.token, { currentPassword: "Wr0ng!Passw0rd#x" })).status).toBe(401);
      expect(await passkeyRows(u.id)).toHaveLength(1);
      const ok = await del(stale.token, { currentPassword: PW });
      expect(ok.status).toBe(200);
      expect((await ok.json()).warning).toMatch(/No two-factor/);
      expect(await passkeyRows(u.id)).toHaveLength(0);
      await flush();
      expect(await eventsOf(u.id, "passkey_removed")).toBe(1);

      const b = await enroll(u);
      const fresh = await session(u.id, u.dek);
      expect((await DELETE(sreq("DELETE", `/api/settings/passkeys/${b.id}`, fresh.token, {}), idCtx(b.id))).status).toBe(200);
    });

    it("another user's passkey cannot be deleted (404, row intact) even with that user's own valid step-up", async () => {
      const u = await mkUser(); const v = await mkUser();
      const a = await enroll(u);
      const { DELETE } = await routes.byId();
      const sv = await session(v.id, v.dek, { ageSec: 3600 });
      const res = await DELETE(sreq("DELETE", `/api/settings/passkeys/${a.id}`, sv.token, { currentPassword: PW }), idCtx(a.id));
      expect(res.status).toBe(404);
      expect(await passkeyRows(u.id)).toHaveLength(1);
      const { GET } = await routes.list();
      expect((await (await GET(sreq("GET", "/api/settings/passkeys", sv.token))).json()).passkeys).toEqual([]);
    });

    it("delete warning absent when TOTP remains", async () => {
      const u = await mkUser({ totp: true });
      const a = await enroll(u);
      const { DELETE } = await routes.byId();
      const st = await session(u.id, u.dek);
      const body = await (await DELETE(sreq("DELETE", "/x", st.token, {}), idCtx(a.id))).json();
      expect(body).toEqual({ success: true });
    });

    it("api_key and oauth contexts are refused (403) on every settings passkey route; nothing changes", async () => {
      const u = await mkUser();
      const a = await enroll(u);
      for (const method of ["api_key", "oauth"] as const) {
        const spy = vi.spyOn(method === "api_key" ? apiKeyStrategy : accountStrategy, "authenticate").mockResolvedValue({
          authenticated: true,
          context: { userId: u.id, method, mfaVerified: true, dek: Buffer.from(u.dek), sessionId: "s", iat: Math.floor(Date.now() / 1000) },
        });
        const hdr: Record<string, string> = method === "api_key" ? { "x-api-key": "pf_whatever" } : { cookie: "pf_session=x" };
        const [l, ro, rv, bi] = await Promise.all([routes.list(), routes.regOptions(), routes.regVerify(), routes.byId()]);
        const mk = (m: string, p: string, body?: unknown) =>
          new NextRequest(`http://localhost:3000${p}`, { method: m, headers: { "content-type": "application/json", "x-real-ip": freshIp(), ...hdr }, body: body === undefined ? undefined : JSON.stringify(body) });
        expect((await l.GET(mk("GET", "/api/settings/passkeys"))).status, method).toBe(403);
        expect((await ro.POST(mk("POST", "/api/settings/passkeys/register/options", {}))).status, method).toBe(403);
        expect((await rv.POST(mk("POST", "/api/settings/passkeys/register/verify", {}))).status, method).toBe(403);
        expect((await bi.PATCH(mk("PATCH", `/api/settings/passkeys/${a.id}`, { label: "x" }), idCtx(a.id))).status, method).toBe(403);
        expect((await bi.DELETE(mk("DELETE", `/api/settings/passkeys/${a.id}`, {}), idCtx(a.id))).status, method).toBe(403);
        spy.mockRestore();
      }
      expect(await passkeyRows(u.id)).toHaveLength(1);
      expect((await passkeyRows(u.id))[0].label).toBe("My key");
    });

    it("unauthenticated requests are 401; a PENDING token is refused (401 mfa-pending) on settings routes", async () => {
      const u = await mkUser();
      const a = await enroll(u);
      const p = await pending(u);
      const [l, ro, rv, bi] = await Promise.all([routes.list(), routes.regOptions(), routes.regVerify(), routes.byId()]);
      expect((await l.GET(sreq("GET", "/api/settings/passkeys", null))).status).toBe(401);
      for (const res of [
        await l.GET(sreq("GET", "/api/settings/passkeys", p.token)),
        await ro.POST(sreq("POST", "/api/settings/passkeys/register/options", p.token, {})),
        await rv.POST(sreq("POST", "/api/settings/passkeys/register/verify", p.token, {})),
        await bi.DELETE(sreq("DELETE", `/api/settings/passkeys/${a.id}`, p.token, {}), idCtx(a.id)),
        await bi.PATCH(sreq("PATCH", `/api/settings/passkeys/${a.id}`, p.token, { label: "x" }), idCtx(a.id)),
      ]) {
        expect(res.status).toBe(401);
        expect((await res.json()).code).toBe("mfa-pending");
      }
      // bearer variant too
      const res = await l.GET(new NextRequest("http://localhost:3000/api/settings/passkeys", { headers: { authorization: `Bearer ${p.token}` } }));
      expect(res.status).toBe(401);
      expect(await passkeyRows(u.id)).toHaveLength(1);
    });

    it("CSRF: settings + mfa/webauthn routes are NOT in the bypass list; cross-origin cookie POST -> 403", () => {
      const src = fs.readFileSync(path.join(process.cwd(), "src/middleware.ts"), "utf8");
      const block = src.slice(src.indexOf("const CSRF_BYPASS_PATHS"), src.indexOf("]);", src.indexOf("const CSRF_BYPASS_PATHS")));
      expect(block).not.toContain("passkeys");
      expect(block).not.toContain("webauthn");
      for (const p of ["/api/settings/passkeys/register/options", "/api/settings/passkeys/register/verify", "/api/auth/mfa/webauthn/options", "/api/auth/mfa/webauthn/verify"]) {
        const bad = middleware(new NextRequest(`http://localhost:3000${p}`, { method: "POST", headers: { cookie: "pf_session=stale.cookie.x", origin: "https://evil.example" } }));
        expect(bad.status, p).toBe(403);
      }
    });
  });

  // ───────────────────────── passkey as 2FA ─────────────────────────
  describe("passkey counts as MFA at the login gate", () => {
    it("passkey-only user -> pending (kind mfa); no passkey/no TOTP -> session; delete last passkey -> back to session", async () => {
      const u = await mkUser();
      const dek = Buffer.from(u.dek);
      const user = (await getUserById(u.id))!;
      expect((await issueSessionForDek(user as never, dek)).kind).toBe("session");
      const a = await enroll(u);
      const r = await issueSessionForDek((await getUserById(u.id))! as never, dek);
      expect(r.kind).toBe("mfa");
      const payload = await verifySessionToken(r.kind === "mfa" ? r.token : "");
      expect(payload?.pending).toBe(true);
      const { DELETE } = await routes.byId();
      const st = await session(u.id, u.dek);
      await DELETE(sreq("DELETE", "/x", st.token, {}), idCtx(a.id));
      expect((await issueSessionForDek((await getUserById(u.id))! as never, dek)).kind).toBe("session");
    });
    it("TOTP-only user still gets pending (unchanged)", async () => {
      const u = await mkUser({ totp: true });
      expect((await issueSessionForDek((await getUserById(u.id))! as never, Buffer.from(u.dek))).kind).toBe("mfa");
    });
  });

  describe("mfa/webauthn options + verify", () => {
    it("happy path: assertion promotes pending -> full session via commitSession; DEK moved; pending revoked; counter + last_used advanced; device issued; pf_unlock cleared", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const p = await pending(u);
      const { res, json } = await mfaOptions(p);
      expect(res.status).toBe(200);
      expect(json.options.userVerification).toBe("required");
      expect(json.options.rpId).toBe(RP);
      expect(json.options.allowCredentials.map((c: { id: string }) => c.id)).toEqual([auth.id]);

      const out = await mfaVerify(p, json.token, auth.assert(json.options.challenge, K));
      expect(out.status).toBe(200);
      const cookie = out.cookies.get("pf_session")!;
      expect(cookie.value).toBeTruthy();
      expect(cookie.httpOnly).toBe(true);
      const payload = await verifySessionToken(cookie.value);
      expect(payload?.sub).toBe(u.id);
      expect(payload?.mfa).toBe(true);
      expect(payload?.pending).toBeFalsy();
      expect(getDEK(payload!.jti as string, u.id)?.equals(u.dek)).toBe(true);
      expect(await isJtiRevoked(p.jti)).toBe(true);
      expect(getDEK(p.jti, u.id)).toBeNull();
      expect(out.cookies.get("pf_device")?.value).toBeTruthy();
      // the trusted-device wrap holds the REAL DEK (not a zeroed pending buffer)
      const redeemed = await redeemDevice(out.cookies.get("pf_device")!.value, u.id);
      expect(redeemed?.dek.equals(u.dek)).toBe(true);
      expect(out.cookies.get("pf_unlock")?.maxAge).toBe(0);
      const row = (await passkeyRows(u.id))[0];
      expect(row.counter).toBe(1);
      expect(row.lastUsedAt).not.toBeNull();
      await flush();
      expect(await eventsOf(u.id, "passkey_2fa_success")).toBe(1);
      // the pending token cannot be used again
      const again = await mfaOptions(p);
      expect(again.res.status).toBe(401);
    });

    it("trustDevice:false issues no pf_device; pending taken from pf_unlock cookie works", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const p = await pending(u);
      const { POST: opt } = await routes.mfaOptions();
      const ores = await opt(areq("/api/auth/mfa/webauthn/options", {}, { cookie: `pf_unlock=${p.token}` }));
      expect(ores.status).toBe(200);
      const oj = await ores.json();
      const { POST: ver } = await routes.mfaVerify();
      const out = await ver(areq("/api/auth/mfa/webauthn/verify", { token: oj.token, response: auth.assert(oj.options.challenge, K), trustDevice: false }, { cookie: `pf_unlock=${p.token}` }));
      expect(out.status).toBe(200);
      expect(out.cookies.get("pf_device")).toBeUndefined();
      expect(out.cookies.get("pf_session")?.value).toBeTruthy();
    });

    it("wrong key (same credential id, attacker's private key) -> rejected, no session, counter untouched, pending still alive", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const attacker = new SoftAuthenticator();
      const p = await pending(u);
      const { json } = await mfaOptions(p);
      const out = await mfaVerify(p, json.token, auth.assert(json.options.challenge, K, { signWith: attacker }));
      expect(out.status).toBe(400);
      expect(out.cookies.get("pf_session")).toBeUndefined();
      expect((await passkeyRows(u.id))[0].counter).toBe(0);
      expect(await isJtiRevoked(p.jti)).toBe(false);
      await flush();
      expect(await eventsOf(u.id, "passkey_2fa_failed")).toBeGreaterThanOrEqual(1);
    });

    it("wrong challenge / wrong origin / wrong rpID / UV=false are rejected", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const p = await pending(u);
      const cases: Array<[string, (c: string) => unknown]> = [
        ["challenge", () => auth.assert(crypto.randomBytes(32).toString("base64url"), K)],
        ["origin", (c) => auth.assert(c, { origin: "https://evil.example", rpId: RP })],
        ["origin subdomain", (c) => auth.assert(c, { origin: "https://x.money.example.test", rpId: RP })],
        ["rpID", (c) => auth.assert(c, { origin: ORIGIN, rpId: "evil.example" })],
        ["UV=false", (c) => auth.assert(c, { ...K, uv: false })],
      ];
      for (const [name, mk] of cases) {
        const { json } = await mfaOptions(p);
        const out = await mfaVerify(p, json.token, mk(json.options.challenge));
        expect(out.status, name).toBe(400);
        expect(out.cookies.get("pf_session"), name).toBeUndefined();
      }
      expect((await passkeyRows(u.id))[0].counter).toBe(0);
    });

    it("replayed challenge: a failed attempt burns the token; the correct response with that token is refused; a verified response cannot be replayed", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const p = await pending(u);
      const { json } = await mfaOptions(p);
      const bad = auth.assert(json.options.challenge, K, { signWith: new SoftAuthenticator(), counter: 5 });
      expect((await mfaVerify(p, json.token, bad)).status).toBe(400);
      const good = auth.assert(json.options.challenge, K, { counter: 6 });
      expect((await mfaVerify(p, json.token, good)).status).toBe(400); // same token: consumed
      // fresh options on the same pending token succeed
      const second = await mfaOptions(p);
      const resp = auth.assert(second.json.options.challenge, K, { counter: 7 });
      expect((await mfaVerify(p, second.json.token, resp)).status).toBe(200);
      // replay of the successful exchange (pending now revoked) and with a NEW pending token
      expect((await mfaVerify(p, second.json.token, resp)).status).toBe(401);
      const p2 = await pending(u);
      expect((await mfaVerify(p2, second.json.token, resp)).status).toBe(400);
    });

    it("counter regression: rejected, no session, security event, stored counter unchanged; equal counter also rejected; 0/0 authenticators work", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      await db.update(s.userPasskeys).set({ counter: 5 }).where(eq(s.userPasskeys.userId, u.id));
      const p = await pending(u);
      for (const c of [3, 5]) {
        const { json } = await mfaOptions(p);
        const out = await mfaVerify(p, json.token, auth.assert(json.options.challenge, K, { counter: c }));
        expect(out.status, `counter ${c}`).toBe(400);
        expect(out.cookies.get("pf_session")).toBeUndefined();
      }
      expect((await passkeyRows(u.id))[0].counter).toBe(5);
      await flush();
      expect(await eventsOf(u.id, "passkey_counter_regression")).toBe(2);

      // counterless authenticator (always 0, stored 0) is accepted
      const w = await mkUser();
      const zero = await enroll(w, "sync", new SoftAuthenticator({ counters: false }));
      const pw = await pending(w);
      const o = await mfaOptions(pw);
      expect((await mfaVerify(pw, o.json.token, zero.assert(o.json.options.challenge, K))).status).toBe(200);
    });

    it("another user's passkey cannot satisfy this user's 2FA (and has no oracle: same 400)", async () => {
      const u = await mkUser(); const v = await mkUser();
      await enroll(u);
      const theirs = await enroll(v);
      const p = await pending(u);
      const { json } = await mfaOptions(p);
      const out = await mfaVerify(p, json.token, theirs.assert(json.options.challenge, K));
      expect(out.status).toBe(400);
      expect(await out.json()).toEqual({ error: "Passkey verification failed." });
      expect(out.cookies.get("pf_session")).toBeUndefined();
      // unknown credential id: identical response
      const unknown = new SoftAuthenticator();
      const { json: j2 } = await mfaOptions(p);
      const out2 = await mfaVerify(p, j2.token, unknown.assert(j2.options.challenge, K));
      expect(out2.status).toBe(400);
      expect(await out2.json()).toEqual({ error: "Passkey verification failed." });
      // userHandle of a different user is refused even with u's credential
      const au = await (async () => { const x = await mkUser(); return { x, a: await enroll(x) }; })();
      const px = await pending(au.x);
      const { json: j3 } = await mfaOptions(px);
      const out3 = await mfaVerify(px, j3.token, au.a.assert(j3.options.challenge, K, { userHandle: Buffer.from(v.id).toString("base64url") }));
      expect(out3.status).toBe(400);
    });

    it("verifyPasskeyAssertion itself refuses a credential owned by someone else (wrong_owner), independent of the route's CAS", async () => {
      const { beginAuthentication2fa, verifyPasskeyAssertion } = await import("@/lib/auth/webauthn");
      const u = await mkUser(); const v = await mkUser();
      await enroll(u);
      const theirs = await enroll(v);
      const row = (await passkeyRows(v.id))[0];
      const { options, token } = await beginAuthentication2fa({ userId: u.id, pendingJti: "pj", credentials: [] });
      const r = await verifyPasskeyAssertion({
        token, purpose: "passkey-2fa", binding: { userId: u.id, pendingJti: "pj" },
        response: theirs.assert(options.challenge, K),
        passkey: { id: row.id, userId: row.userId, publicKey: row.publicKey, counter: row.counter, transports: row.transports },
      });
      expect(r).toEqual({ ok: false, reason: "wrong_owner" });
    });

    it("pending-token handling: full session token rejected at both routes; passkey-register token not accepted as 2FA token; 2FA token bound to its pending jti; user without passkeys gets 400 at options", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const full = await session(u.id, u.dek);
      const { POST: opt } = await routes.mfaOptions();
      expect((await opt(areq("/api/auth/mfa/webauthn/options", { mfaPendingToken: full.token }))).status).toBe(401);
      expect((await mfaVerify({ token: full.token }, "x".repeat(40), auth.assert("AAAA", K))).status).toBe(401);
      expect((await opt(areq("/api/auth/mfa/webauthn/options", {}))).status).toBe(401);

      const p = await pending(u);
      const { json: reg } = await regOptions(full.token);
      expect((await mfaVerify(p, reg.token, auth.assert(reg.options.challenge, K))).status).toBe(400);
      const p2 = await pending(u);
      const { json } = await mfaOptions(p);
      expect((await mfaVerify(p2, json.token, auth.assert(json.options.challenge, K))).status).toBe(400);

      const none = await mkUser();
      const pn = await pending(none);
      expect((await mfaOptions(pn)).res.status).toBe(400);
    });

    it("attempt cap: 6th verify on one pending token revokes it (429) even with a valid assertion", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const p = await pending(u);
      for (let i = 0; i < 5; i++) {
        const { json } = await mfaOptions(p);
        expect((await mfaVerify(p, json.token, auth.assert(json.options.challenge, K, { signWith: new SoftAuthenticator(), counter: 10 + i }))).status).toBe(400);
      }
      const { json } = await mfaOptions(p);
      const out = await mfaVerify(p, json.token, auth.assert(json.options.challenge, K, { counter: 50 }));
      expect(out.status).toBe(429);
      expect(out.cookies.get("pf_session")).toBeUndefined();
      expect(await isJtiRevoked(p.jti)).toBe(true);
    });

    it("concurrent double-submit of one valid assertion yields exactly one session", async () => {
      const u = await mkUser();
      const auth = await enroll(u);
      const p = await pending(u);
      const { json } = await mfaOptions(p);
      const resp = auth.assert(json.options.challenge, K);
      const [a, b] = await Promise.all([mfaVerify(p, json.token, resp), mfaVerify(p, json.token, resp)]);
      expect([a.status, b.status].sort()).toEqual([200, 400]);
    });

    it("every pf_session writer still goes through commitSession (static)", () => {
      const f = fs.readFileSync(path.join(process.cwd(), "src/app/api/auth/mfa/webauthn/verify/route.ts"), "utf8");
      expect(f).toMatch(/commitSession\(/);
      expect(f).not.toMatch(/cookies\s*\.\s*set\(\s*["']pf_session["']/);
      expect(f).toMatch(/applyTrustedDevicePolicy\(/);
    });
  });

  describe("one definition of MFA: login gate and Family overview gate agree", () => {
    const overview = async (token: string) => {
      const { GET } = await import("@/app/api/family/overview/route");
      const res = await GET(new NextRequest("http://localhost:3000/api/family/overview", { headers: { cookie: `pf_session=${token}`, "x-real-ip": freshIp() } }));
      return { status: res.status, json: await res.json().catch(() => null) };
    };

    it("userHasSecondFactor: TOTP-only, passkey-only -> true; neither -> false", async () => {
      const { userHasSecondFactor } = await import("@/lib/auth/second-factor");
      const none = await mkUser(); const totp = await mkUser({ totp: true }); const pk = await mkUser();
      await enroll(pk);
      expect(await userHasSecondFactor(none.id)).toBe(false);
      expect(await userHasSecondFactor(totp.id)).toBe(true);
      expect(await userHasSecondFactor(pk.id)).toBe(true);
      expect(await userHasSecondFactor(pk.id, 0)).toBe(true);
    });

    it("passkey-only user: session minted by passkey 2FA passes the Family gate; a session that never passed 2FA does not; mfa claim without any factor does not", async () => {
      const u = await mkUser();
      const auth = await enroll(u);

      // session minted before/without the second factor (password-only login; mfa claim false)
      const noMfa = await createSessionToken(u.id, false);
      putDEK(noMfa.jti, Buffer.from(u.dek), 60_000, u.id);
      const denied = await overview(noMfa.token);
      expect(denied.status).toBe(403);
      expect(denied.json.error).toBe("mfa_required");

      // login gate agrees: password step now yields a pending token, and passkey 2FA mints the mfa claim
      const gate = await issueSessionForDek((await getUserById(u.id))! as never, Buffer.from(u.dek));
      expect(gate.kind).toBe("mfa");
      const p = await pending(u);
      const { json } = await mfaOptions(p);
      const out = await mfaVerify(p, json.token, auth.assert(json.options.challenge, K));
      expect(out.status).toBe(200);
      const tok = out.cookies.get("pf_session")!.value;
      expect((await verifySessionToken(tok))?.mfa).toBe(true);
      const allowed = await overview(tok);
      expect(allowed.status).not.toBe(403);
      expect(allowed.json?.error).not.toBe("mfa_required");

      // a user with NO second factor never passes, even with an mfa=true session
      const bare = await mkUser();
      const bs = await session(bare.id, bare.dek); // mfa claim true
      const bd = await overview(bs.token);
      expect(bd.status).toBe(403);
      expect(bd.json.error).toBe("mfa_required");

      // removing the last passkey withdraws the factor (the gate recomputes per request)
      const { DELETE } = await routes.byId();
      const st = await session(u.id, u.dek);
      expect((await DELETE(sreq("DELETE", "/x", st.token, {}), idCtx(auth.id))).status).toBe(200);
      expect((await overview(tok)).status).toBe(403);
    });
  });

  describe("wipe (email reset) removes passkeys so a lost passkey cannot lock the user out", () => {
    it("passkey user -> wipeUserDataAndRewrap -> no passkey rows, login is no longer gated by a passkey", async () => {
      const { wipeUserDataAndRewrap } = await import("@/lib/auth/queries");
      const u = await mkUser();
      await enroll(u);
      await db.update(s.userPasskeys).set({ dekWrappedPrf: "wrap" }).where(eq(s.userPasskeys.userId, u.id));
      const other = await mkUser();
      await enroll(other);
      expect((await issueSessionForDek((await getUserById(u.id))! as never, Buffer.from(u.dek))).kind).toBe("mfa");
      await wipeUserDataAndRewrap(u.id, "newhash", { kekSalt: "a", dekWrapped: "b", dekWrappedIv: "c", dekWrappedTag: "d" });
      expect(await passkeyRows(u.id)).toHaveLength(0);
      expect(await passkeyRows(other.id)).toHaveLength(1); // other accounts untouched
      expect((await issueSessionForDek((await getUserById(u.id))! as never, Buffer.from(u.dek))).kind).toBe("session");
    });
  });

  describe("RP config", () => {
    it("derives rpID/origin from APP_URL; refuses wildcard / http / foreign-host origins", async () => {
      const { getRpConfig } = await import("@/lib/auth/webauthn");
      expect(getRpConfig()).toEqual({ rpID: RP, origins: [ORIGIN] });
      const save = { ...process.env };
      try {
        process.env.PF_WEBAUTHN_ORIGINS = "https://*.example.test";
        expect(() => getRpConfig()).toThrow();
        process.env.PF_WEBAUTHN_ORIGINS = "http://money.example.test";
        expect(() => getRpConfig()).toThrow();
        process.env.PF_WEBAUTHN_ORIGINS = "https://evil.example";
        expect(() => getRpConfig()).toThrow();
        process.env.PF_WEBAUTHN_ORIGINS = "https://app.money.example.test";
        expect(getRpConfig().origins).toEqual([ORIGIN, "https://app.money.example.test"]);
      } finally {
        delete process.env.PF_WEBAUTHN_ORIGINS;
        process.env.APP_URL = save.APP_URL;
      }
    });
  });
});
