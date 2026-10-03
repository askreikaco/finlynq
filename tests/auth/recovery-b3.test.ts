/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recovery B3 — recovery codes API, code-as-2FA, device issuance, OAuth revoke.
 * REAL Postgres (*_test DB); skipped otherwise.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
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
// Background jobs touch tables unrelated to this suite.
vi.mock("@/lib/securities/backfill", () => ({ enqueueBackfillSecurities: vi.fn() }));
vi.mock("@/lib/email-import/upgrade-staging-encryption", () => ({ enqueueUpgradeStagingEncryption: vi.fn() }));
vi.mock("@/lib/email-import/process-pending-inbox", () => ({ enqueueProcessPendingInbox: vi.fn() }));
vi.mock("@/lib/crypto/upgrade-user-fields", () => ({ enqueueUpgradeUserFieldEncryption: vi.fn() }));
// Controllable device-issuance failure.
const deviceFlags = { failIssue: false };
vi.mock("@/lib/auth/trusted-device", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/trusted-device")>();
  return {
    ...real,
    issueDevice: async (...a: Parameters<typeof real.issueDevice>) => {
      if (deviceFlags.failIssue) throw new Error("device issuance boom");
      return real.issueDevice(...a);
    },
  };
});

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { db, schema as s } from "@/db";
import { createUser, getUserById, consumeRecoveryCode, enableUserMfa, applyRecoveryRewrapTx } from "@/lib/auth/queries";
import { createWrappedDEKForPassword } from "@/lib/crypto/envelope";
import { finalizeRecoveryReset } from "@/lib/auth/recovery";
import { createSessionToken, verifySessionToken, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";
import { putDEK } from "@/lib/crypto/dek-cache";
import { hashPassword } from "@/lib/auth";
import { generateMfaSecret } from "@/lib/auth/mfa";
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode,
  wrapDEKWithRecoveryCode,
} from "@/lib/auth/recovery-codes";
import { passwordChangedEmail } from "@/lib/email";
import { createAccessToken, validateOauthToken, createAuthCode } from "@/lib/oauth";
import { requireAuth, apiKeyStrategy, accountStrategy } from "@/lib/auth/require-auth";
import { issueDevice } from "@/lib/auth/trusted-device";
import * as settingsRoute from "@/app/api/settings/recovery-codes/route";
import * as mfaRecoveryRoute from "@/app/api/auth/mfa/recovery/verify/route";
import { _clearRecoveryVerifyAttempts } from "@/lib/auth/mfa-recovery-attempts";
import * as loginRoute from "@/app/api/auth/login/route";
import * as mfaVerifyRoute from "@/app/api/auth/mfa/verify/route";
import * as authorizeRoute from "@/app/api/oauth/authorize/route";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const OLD_PW = "Hr4$yBn8@Cp6sGe1";
const NEW_PW = "Zq7!vLm3#Xt9wKd2";
const GENERIC = { error: "Recovery failed. Check your details and try again." };
const CODE_RE = /^[A-Z2-7]{5}(-[A-Z2-7]{5}){3}$/;

let ipSeq = 0;
const freshIp = () => `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq++ & 255}`;

async function mkUser(opts: { email?: string; mfa?: boolean } = {}) {
  const { dek, wrapped } = createWrappedDEKForPassword(OLD_PW);
  const username = "b3" + crypto.randomUUID();
  const u = await createUser({
    username,
    email: opts.email,
    passwordHash: await hashPassword(OLD_PW),
    kekSalt: wrapped.salt.toString("base64"),
    dekWrapped: wrapped.wrapped.toString("base64"),
    dekWrappedIv: wrapped.iv.toString("base64"),
    dekWrappedTag: wrapped.tag.toString("base64"),
  } as any);
  let mfaSecret: string | undefined;
  if (opts.mfa) {
    mfaSecret = generateMfaSecret("x@example.com").secret;
    await enableUserMfa(u.id, mfaSecret, dek);
  }
  return { id: u.id as string, dek, username, mfaSecret };
}

async function session(id: string, dek: Buffer, opts: { ageSec?: number; noDek?: boolean } = {}) {
  if (!opts.ageSec) {
    const { token, jti } = await createSessionToken(id, true);
    if (!opts.noDek) putDEK(jti, Buffer.from(dek), 60_000, id);
    return token;
  }
  const iat = Math.floor(Date.now() / 1000) - opts.ageSec;
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ mfa: true, gen: "0" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id).setJti(jti).setIssuer("pf-auth").setAudience("pf-app")
    .setIssuedAt(iat).setExpirationTime(iat + 86_400)
    .sign(new TextEncoder().encode(process.env.PF_JWT_SECRET!));
  if (!opts.noDek) putDEK(jti, Buffer.from(dek), 60_000, id);
  return token;
}

async function pending(id: string, dek: Buffer) {
  const { token, jti } = await createSessionToken(id, false, { pending: true, expirationTime: "5m" });
  putDEK(jti, Buffer.from(dek), 5 * 60_000, id);
  return { token, jti };
}

const settingsReq = (method: "GET" | "POST", token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/api/settings/recovery-codes", {
    method,
    headers: { "content-type": "application/json", ...(token ? { cookie: `pf_session=${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const recReq = (body: unknown, opts: { ip?: string; cookie?: string } = {}) =>
  new NextRequest("http://localhost:3000/api/auth/mfa/recovery/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": opts.ip ?? freshIp(),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: JSON.stringify(body),
  });

async function generate(id: string, dek: Buffer) {
  const res = await settingsRoute.POST(settingsReq("POST", await session(id, dek), {}));
  expect(res.status).toBe(200);
  return ((await res.json()) as { codes: string[] }).codes;
}

const rows = (id: string) => db.select().from(s.userRecoveryCodes).where(eq(s.userRecoveryCodes.userId, id));
const setCookie = (res: Response) => res.headers.getSetCookie?.() ?? [];

describe("recovery-codes lib: format / normalization", () => {
  it("generates 10 unique codes, base32 only (no 0/1/8/9), display round-trips to canonical", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes.map((c) => c.canonical)).size).toBe(10);
    for (const c of codes) {
      expect(c.display).toMatch(CODE_RE);
      expect(c.display).not.toMatch(/[0189]/);
      expect(`pfrc1:${normalizeRecoveryCode(c.display)}`).toBe(c.canonical);
    }
  });
  it("normalization is case/separator-insensitive and never collapses two distinct generated codes", () => {
    const codes = generateRecoveryCodes(500);
    expect(new Set(codes.map((c) => normalizeRecoveryCode(c.display))).size).toBe(500);
    const c = codes[0].display;
    expect(normalizeRecoveryCode(c.toLowerCase().replace(/-/g, " "))).toBe(normalizeRecoveryCode(c));
  });
  it("0->O and 1->I are lossless because the alphabet has no 0/1; 8,9, and wrong lengths reject", () => {
    expect(normalizeRecoveryCode("0".repeat(20))).toBe("O".repeat(20));
    expect(normalizeRecoveryCode("1".repeat(20))).toBe("I".repeat(20));
    expect(() => normalizeRecoveryCode("8".repeat(20))).toThrow();
    expect(() => normalizeRecoveryCode("A".repeat(19))).toThrow();
    expect(() => normalizeRecoveryCode("A".repeat(21))).toThrow();
    expect(() => normalizeRecoveryCode("")).toThrow();
  });
  it("hash is not the wrap key material", () => {
    const c = generateRecoveryCodes(1)[0].canonical;
    expect(hashRecoveryCode(c)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe.skipIf(!HAS_DB)("recovery B3 (real Postgres)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => {
    sendEmailMock.mockReset(); sendEmailMock.mockResolvedValue(undefined);
    _clearSessionCutoffCache(); _clearRevokedJtiCache(); _clearRecoveryVerifyAttempts();
    deviceFlags.failIssue = false;
  });
  afterEach(() => { vi.restoreAllMocks(); });

  // ─── settings route: generate / list ──────────────────────────────────────
  describe("/api/settings/recovery-codes", () => {
    it("codes are shown once: 10 display codes returned; DB holds only hash+wrap, never plaintext", async () => {
      const { id, dek } = await mkUser();
      const res = await settingsRoute.POST(settingsReq("POST", await session(id, dek), {}));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");
      const { codes } = (await res.json()) as { codes: string[] };
      expect(codes).toHaveLength(10);
      codes.forEach((c) => expect(c).toMatch(CODE_RE));
      const r = await rows(id);
      expect(r).toHaveLength(10);
      const dump = JSON.stringify(r);
      for (const c of codes) {
        expect(dump).not.toContain(c);
        expect(dump).not.toContain(normalizeRecoveryCode(c));
      }
      for (const row of r) {
        expect(row.codeHash).toMatch(/^sha256:/);
        expect(row.dekWrapped).toBeTruthy();
        expect(row.usedAt).toBeNull();
      }
    });

    it("GET never returns codes/hashes/wraps: exactly {unused,total,createdAt}", async () => {
      const { id, dek } = await mkUser();
      const codes = await generate(id, dek);
      const res = await settingsRoute.GET(settingsReq("GET", await session(id, dek)));
      expect(res.status).toBe(200);
      const text = await res.text();
      const body = JSON.parse(text);
      expect(Object.keys(body).sort()).toEqual(["createdAt", "total", "unused"]);
      expect(body.unused).toBe(10);
      expect(body.total).toBe(10);
      for (const row of await rows(id)) {
        expect(text).not.toContain(row.codeHash);
        expect(text).not.toContain(row.dekWrapped!);
      }
      for (const c of codes) expect(text).not.toContain(normalizeRecoveryCode(c));
    });

    it("regenerate invalidates every old code; new codes work", async () => {
      const { id, dek } = await mkUser();
      const oldCodes = await generate(id, dek);
      const newCodes = await generate(id, dek);
      expect(await rows(id)).toHaveLength(10);
      for (const c of oldCodes) {
        expect(await consumeRecoveryCode(id, hashRecoveryCode(`pfrc1:${normalizeRecoveryCode(c)}`))).toBeNull();
      }
      expect(await consumeRecoveryCode(id, hashRecoveryCode(`pfrc1:${normalizeRecoveryCode(newCodes[0])}`))).toBeTruthy();
    });

    it("concurrent regenerations serialize: exactly 10 live codes, never 20", async () => {
      const { id, dek } = await mkUser();
      const t1 = await session(id, dek), t2 = await session(id, dek);
      const [a, b] = await Promise.all([
        settingsRoute.POST(settingsReq("POST", t1, {})),
        settingsRoute.POST(settingsReq("POST", t2, {})),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await rows(id)).toHaveLength(10);
    });

    it("no live DEK -> 423 and nothing stored", async () => {
      const { id, dek } = await mkUser();
      const res = await settingsRoute.POST(settingsReq("POST", await session(id, dek, { noDek: true }), {}));
      expect(res.status).toBe(423);
      expect(await rows(id)).toHaveLength(0);
    });

    it("step-up: stale session without password -> 401 and nothing stored", async () => {
      const { id, dek } = await mkUser();
      const stale = await session(id, dek, { ageSec: 3600 });
      const res = await settingsRoute.POST(settingsReq("POST", stale, {}));
      expect(res.status).toBe(401);
      expect(await rows(id)).toHaveLength(0);
    });

    it("step-up: stale session + WRONG password -> 401; + correct password -> 200", async () => {
      const { id, dek } = await mkUser();
      const stale = await session(id, dek, { ageSec: 3600 });
      expect((await settingsRoute.POST(settingsReq("POST", stale, { currentPassword: "Wr0ng!Passw0rd#x" }))).status).toBe(401);
      expect(await rows(id)).toHaveLength(0);
      const ok = await settingsRoute.POST(settingsReq("POST", stale, { currentPassword: OLD_PW }));
      expect(ok.status).toBe(200);
      expect(await rows(id)).toHaveLength(10);
    });

    it("fresh session needs no password", async () => {
      const { id, dek } = await mkUser();
      expect((await settingsRoute.POST(settingsReq("POST", await session(id, dek, { ageSec: 30 }), {}))).status).toBe(200);
    });

    it("rate limit: 6th generation within the hour -> 429", async () => {
      const { id, dek } = await mkUser();
      const t = await session(id, dek);
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await settingsRoute.POST(settingsReq("POST", t, {}))).status);
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    });

    it("api_key and oauth auth are rejected (403) on GET and POST; nothing stored", async () => {
      const { id, dek } = await mkUser();
      for (const method of ["api_key", "oauth"] as const) {
        const strat = method === "api_key" ? apiKeyStrategy : accountStrategy;
        vi.spyOn(strat, "authenticate").mockResolvedValue({
          authenticated: true,
          context: { userId: id, method, mfaVerified: true, dek: Buffer.from(dek), sessionId: "s", iat: Math.floor(Date.now() / 1000) },
        } as any);
        // header set only selects which strategy requireAuth uses (spied above)
        const hdr: Record<string, string> = method === "api_key" ? { "x-api-key": "pf_whatever" } : { cookie: "pf_session=x" };
        const p = await settingsRoute.POST(settingsReq("POST", null, {}, hdr));
        const g = await settingsRoute.GET(settingsReq("GET", null, undefined, hdr));
        expect(p.status, method).toBe(403);
        expect(g.status, method).toBe(403);
        vi.restoreAllMocks();
      }
      expect(await rows(id)).toHaveLength(0);
    });

    it("real opaque Bearer (oauth-style) token and unauthenticated -> 401; pending token -> 401", async () => {
      const { id, dek } = await mkUser();
      expect((await settingsRoute.POST(settingsReq("POST", null, {}, { authorization: "Bearer pf_oauth_notreal" }))).status).toBe(401);
      expect((await settingsRoute.POST(settingsReq("POST", null, {}))).status).toBe(401);
      const p = await pending(id, dek);
      expect((await settingsRoute.POST(settingsReq("POST", p.token, {}))).status).toBe(401);
      expect((await settingsRoute.GET(settingsReq("GET", p.token))).status).toBe(401);
      expect(await rows(id)).toHaveLength(0);
    });
  });

  // ─── code as 2FA ─────────────────────────────────────────────────────────
  describe("/api/auth/mfa/recovery/verify", () => {
    it("code satisfies 2FA (any case/separators), burns the code, promotes session, kills the pending token", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const codes = await generate(id, dek);
      const p = await pending(id, dek);
      const res = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p.token, code: codes[3].toLowerCase().replace(/-/g, " ") }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      const ck = setCookie(res).find((c) => c.startsWith("pf_session="))!;
      expect(ck).toBeTruthy();
      const payload = await verifySessionToken(ck.split(";")[0].slice("pf_session=".length));
      expect(payload?.sub).toBe(id);
      expect(payload?.pending).toBeFalsy();
      expect(payload?.mfa).toBe(true);
      // burned
      const burned = (await rows(id)).filter((r) => r.usedAt != null);
      expect(burned).toHaveLength(1);
      expect(burned[0].dekWrapped).toBeNull();
      // pending token is dead
      _clearRevokedJtiCache();
      const again = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p.token, code: codes[4] }));
      expect(again.status).toBe(400);
      expect(await again.json()).toEqual(GENERIC);
    });

    it("used code cannot be reused (fresh pending token)", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const codes = await generate(id, dek);
      const p1 = await pending(id, dek);
      expect((await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p1.token, code: codes[0] }))).status).toBe(200);
      const p2 = await pending(id, dek);
      const res = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p2.token, code: codes[0] }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(GENERIC);
    });

    it("burn is atomic: two concurrent uses of one code via the route -> exactly one 200", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const codes = await generate(id, dek);
      const [p1, p2] = [await pending(id, dek), await pending(id, dek)];
      const rs = await Promise.all([
        mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p1.token, code: codes[0] })),
        mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p2.token, code: codes[0] })),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 400]);
    });

    it("burn is atomic at the query level: 12 concurrent consumeRecoveryCode -> exactly one wrap returned", async () => {
      const { id, dek } = await mkUser();
      const codes = await generate(id, dek);
      const h = hashRecoveryCode(`pfrc1:${normalizeRecoveryCode(codes[0])}`);
      const results = await Promise.all(Array.from({ length: 12 }, () => consumeRecoveryCode(id, h)));
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });

    it("wrong code / bad format / other user's code / full session / garbage / missing token -> byte-identical generic 400", async () => {
      const a = await mkUser({ mfa: true });
      const b = await mkUser({ mfa: true });
      await generate(a.id, a.dek);
      const bCodes = await generate(b.id, b.dek);
      const pa = await pending(a.id, a.dek);
      const full = await session(a.id, a.dek);
      const wrong = generateRecoveryCodes(1)[0].display;
      const attempts: Array<[string, any]> = [
        ["wrong code", { mfaPendingToken: pa.token, code: wrong }],
        ["bad format", { mfaPendingToken: pa.token, code: "abc" }],
        ["other user's valid code", { mfaPendingToken: pa.token, code: bCodes[0] }],
        ["full session token", { mfaPendingToken: full, code: wrong }],
        ["garbage token", { mfaPendingToken: "x.y.z", code: wrong }],
        ["missing token", { code: wrong }],
      ];
      const seen: string[] = [];
      for (const [label, body] of attempts) {
        const res = await mfaRecoveryRoute.POST(recReq(body));
        expect(res.status, label).toBe(400);
        seen.push(await res.text());
      }
      expect(new Set(seen).size).toBe(1);
      expect(JSON.parse(seen[0])).toEqual(GENERIC);
      // other user's code was NOT burned by the attempt
      expect((await rows(b.id)).every((r) => r.usedAt == null)).toBe(true);
    });

    it("per-pending-jti cap: 5 wrong attempts then even the CORRECT code is refused and the pending token is revoked", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const codes = await generate(id, dek);
      const p = await pending(id, dek);
      const wrong = generateRecoveryCodes(1)[0].display;
      const ip = freshIp();
      for (let i = 0; i < 5; i++) {
        expect((await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p.token, code: wrong }, { ip }))).status).toBe(400);
      }
      const res = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p.token, code: codes[0] }, { ip }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(GENERIC);
      expect((await rows(id)).every((r) => r.usedAt == null)).toBe(true);
      _clearRevokedJtiCache();
      const p2 = await pending(id, dek);
      expect((await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p2.token, code: codes[0] }, { ip }))).status).toBe(200);
    });

    it("per-IP rate limit: 11th request from one IP -> 429", async () => {
      const ip = freshIp();
      const st: number[] = [];
      for (let i = 0; i < 11; i++) st.push((await mfaRecoveryRoute.POST(recReq({ code: "x" }, { ip }))).status);
      expect(st.slice(0, 10).every((s_) => s_ === 400)).toBe(true);
      expect(st[10]).toBe(429);
    });

    it("code wrapping a different DEK than the pending session is refused", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const [c] = generateRecoveryCodes(1);
      await db.insert(s.userRecoveryCodes).values({
        userId: id, codeHash: hashRecoveryCode(c.canonical),
        dekWrapped: wrapDEKWithRecoveryCode(crypto.randomBytes(32), c.canonical),
        usedAt: null, createdAt: new Date().toISOString(),
      } as any);
      const p = await pending(id, dek);
      const res = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p.token, code: c.display }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual(GENERIC);
    });

    it("failures write security events without the code or hash", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      await generate(id, dek);
      const p = await pending(id, dek);
      const wrong = generateRecoveryCodes(1)[0];
      await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p.token, code: wrong.display }));
      await new Promise((r) => setTimeout(r, 150));
      const ev = await db.select().from(s.userSecurityEvents).where(eq(s.userSecurityEvents.userId, id));
      const dump = JSON.stringify(ev);
      expect(dump).toContain("recovery_proof_failed");
      expect(dump).not.toContain(normalizeRecoveryCode(wrong.display));
      expect(dump).not.toContain(hashRecoveryCode(wrong.canonical));
    });

    it("device: default issues pf_device; trustDevice:false issues none, revokes this browser's device and clears the cookie", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const codes = await generate(id, dek);
      const p1 = await pending(id, dek);
      const r1 = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p1.token, code: codes[0] }));
      const dev = setCookie(r1).find((c) => c.startsWith("pf_device=") && !/Max-Age=0/i.test(c));
      expect(dev).toBeTruthy();

      const old = (await issueDevice(id, dek, "ua"))!;
      const p2 = await pending(id, dek);
      const r2 = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p2.token, code: codes[1], trustDevice: false }, { cookie: `pf_device=${old.cookieValue}` }));
      expect(r2.status).toBe(200);
      const ck = setCookie(r2).filter((c) => c.startsWith("pf_device="));
      expect(ck).toHaveLength(1);
      expect(ck[0]).toMatch(/Max-Age=0/i);
      const row = (await db.select().from(s.userDevices).where(eq(s.userDevices.id, old.id)))[0];
      expect(row.revokedAt).toBeTruthy();
    });

    it("device issuance failure does not fail the 2FA", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const codes = await generate(id, dek);
      const p = await pending(id, dek);
      deviceFlags.failIssue = true;
      const res = await mfaRecoveryRoute.POST(recReq({ mfaPendingToken: p.token, code: codes[0] }));
      expect(res.status).toBe(200);
      expect(setCookie(res).some((c) => c.startsWith("pf_session="))).toBe(true);
      expect(setCookie(res).some((c) => c.startsWith("pf_device=") && !/Max-Age=0/i.test(c))).toBe(false);
    });
  });

  // ─── login + mfa/verify device policy ────────────────────────────────────
  describe("trusted device at login", () => {
    const loginReq = (identifier: string, extra: Record<string, unknown> = {}, cookie?: string) =>
      new NextRequest("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": freshIp(), ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ identifier, password: OLD_PW, ...extra }),
      });
    const live = (res: Response) => setCookie(res).find((c) => c.startsWith("pf_device=") && !/Max-Age=0/i.test(c));

    it("default login issues a pf_device (row exists, DEK-wrapped)", async () => {
      const u = await mkUser();
      const res = await loginRoute.POST(loginReq(u.username));
      expect(res.status).toBe(200);
      expect(live(res)).toBeTruthy();
      const devs = await db.select().from(s.userDevices).where(eq(s.userDevices.userId, u.id));
      expect(devs).toHaveLength(1);
      expect(devs[0].dekWrapped).toBeTruthy();
    });

    it("trustDevice:false issues no device, revokes this browser's existing one and clears the cookie", async () => {
      const u = await mkUser();
      const old = (await issueDevice(u.id, u.dek, "ua"))!;
      const res = await loginRoute.POST(loginReq(u.username, { trustDevice: false }, `pf_device=${old.cookieValue}`));
      expect(res.status).toBe(200);
      expect(live(res)).toBeUndefined();
      expect(setCookie(res).find((c) => c.startsWith("pf_device="))).toMatch(/Max-Age=0/i);
      const devs = await db.select().from(s.userDevices).where(eq(s.userDevices.userId, u.id));
      expect(devs.filter((d) => d.revokedAt == null)).toHaveLength(0);
    });

    it("trustDevice:false with another user's device cookie does not revoke that device", async () => {
      const a = await mkUser(), b = await mkUser();
      const bDev = (await issueDevice(b.id, b.dek, "ua"))!;
      await loginRoute.POST(loginReq(a.username, { trustDevice: false }, `pf_device=${bDev.cookieValue}`));
      const row = (await db.select().from(s.userDevices).where(eq(s.userDevices.id, bDev.id)))[0];
      expect(row.revokedAt).toBeNull();
    });

    it("default login replaces this browser's old device (no pile-up)", async () => {
      const u = await mkUser();
      const old = (await issueDevice(u.id, u.dek, "ua"))!;
      const res = await loginRoute.POST(loginReq(u.username, {}, `pf_device=${old.cookieValue}`));
      expect(live(res)).toBeTruthy();
      const row = (await db.select().from(s.userDevices).where(eq(s.userDevices.id, old.id)))[0];
      expect(row.revokedAt).toBeTruthy();
    });

    it("device issuance failure does not fail the login", async () => {
      const u = await mkUser();
      deviceFlags.failIssue = true;
      const res = await loginRoute.POST(loginReq(u.username));
      expect(res.status).toBe(200);
      expect(setCookie(res).some((c) => c.startsWith("pf_session="))).toBe(true);
      expect(live(res)).toBeUndefined();
    });

    it("mfa/verify honours trustDevice (true issues, false does not)", async () => {
      const u = await mkUser({ mfa: true });
      const code = () => new TOTP({ secret: u.mfaSecret!, algorithm: "SHA1", digits: 6, period: 30 }).generate();
      const mk = async (trustDevice?: boolean) => {
        const p = await pending(u.id, u.dek);
        return new NextRequest("http://localhost:3000/api/auth/mfa/verify", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
          body: JSON.stringify({ mfaPendingToken: p.token, code: code(), ...(trustDevice === undefined ? {} : { trustDevice }) }),
        });
      };
      const r1 = await mfaVerifyRoute.POST(await mk());
      expect(r1.status).toBe(200);
      expect(live(r1)).toBeTruthy();
      const r2 = await mfaVerifyRoute.POST(await mk(false));
      expect(r2.status).toBe(200);
      expect(live(r2)).toBeUndefined();
    });
  });

  // ─── pending token acceptance ────────────────────────────────────────────
  describe("pending tokens", () => {
    it("cannot mint an OAuth grant via /api/oauth/authorize", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const p = await pending(id, dek);
      const res = await authorizeRoute.POST(new NextRequest("http://localhost:3000/api/oauth/authorize", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `pf_session=${p.token}` },
        body: JSON.stringify({ action: "allow", client_id: "c", redirect_uri: "https://x.example/cb" }),
      }));
      expect(res.status).toBe(401);
    });

    it("requireAuth rejects a pending token on every route but /api/auth/mfa/verify", async () => {
      const { id, dek } = await mkUser({ mfa: true });
      const p = await pending(id, dek);
      for (const path of ["/api/settings/recovery-codes", "/api/auth/mfa/recovery/verify", "/api/accounts"]) {
        const r = await requireAuth(new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: `pf_session=${p.token}` } }));
        expect(r.authenticated, path).toBe(false);
      }
      const ok = await requireAuth(new NextRequest("http://localhost:3000/api/auth/mfa/verify", { headers: { cookie: `pf_session=${p.token}` } }));
      expect(ok.authenticated).toBe(true);
    });
  });

  // ─── finalizeRecoveryReset: OAuth revoke inside the tx ───────────────────
  describe("OAuth revocation on recovery", () => {
    const grant = async (userId: string, dek: Buffer) => {
      const t = await createAccessToken(userId, "client-" + crypto.randomUUID().slice(0, 8), dek);
      return t;
    };
    const live = async (userId: string) =>
      (await db.select().from(s.oauthAccessTokens).where(and(eq(s.oauthAccessTokens.userId, userId)))).filter((r) => r.revokedAt == null).length;

    it("finalizeRecoveryReset revokes ALL of the user's grants (access+refresh) and none of another user's", async () => {
      const a = await mkUser(), b = await mkUser();
      const a1 = await grant(a.id, a.dek), a2 = await grant(a.id, a.dek);
      const b1 = await grant(b.id, b.dek);
      expect(await validateOauthToken(a1.accessToken)).not.toBeNull();
      await finalizeRecoveryReset({ userId: a.id, newPassword: NEW_PW, dek: a.dek, method: "code" });
      expect(await live(a.id)).toBe(0);
      expect(await validateOauthToken(a1.accessToken)).toBeNull();
      expect(await validateOauthToken(a2.accessToken)).toBeNull();
      // the refresh half of the pair is on the same revoked row
      const { refreshAccessToken } = await import("@/lib/oauth");
      await expect(refreshAccessToken(a1.refreshToken, "whatever")).resolves.toBeNull();
      expect(await live(b.id)).toBe(1);
      expect(await validateOauthToken(b1.accessToken)).not.toBeNull();
    }, 30_000);

    it("unexchanged OAuth authorization codes of the user are burned; another user's are not", async () => {
      const a = await mkUser(), b = await mkUser();
      await createAuthCode({ userId: a.id, clientId: "c", redirectUri: "https://x.example/cb", codeChallenge: "ch", codeChallengeMethod: "S256", dek: a.dek } as any);
      await createAuthCode({ userId: b.id, clientId: "c", redirectUri: "https://x.example/cb", codeChallenge: "ch", codeChallengeMethod: "S256", dek: b.dek } as any);
      await finalizeRecoveryReset({ userId: a.id, newPassword: NEW_PW, dek: a.dek });
      const ac = await db.select().from(s.oauthAuthorizationCodes).where(eq(s.oauthAuthorizationCodes.userId, a.id));
      const bc = await db.select().from(s.oauthAuthorizationCodes).where(eq(s.oauthAuthorizationCodes.userId, b.id));
      expect(ac.length).toBeGreaterThan(0);
      expect(ac.every((r) => r.used === 1)).toBe(true);
      expect(bc.every((r) => r.used === 0)).toBe(true);
    }, 30_000);

    it("revocation is inside the recovery tx: a tx failure rolls back EVERYTHING (grants live, password/cutoff unchanged)", async () => {
      const a = await mkUser();
      await grant(a.id, a.dek);
      const before = (await getUserById(a.id))!;
      const wrap = { kekSalt: "s", dekWrapped: "w", dekWrappedIv: "i", dekWrappedTag: "t" };
      // Invalid cutoff makes the users UPDATE throw AFTER the oauth UPDATE ran in the same tx.
      await expect(applyRecoveryRewrapTx(a.id, "NEWHASH", wrap, new Date(NaN))).rejects.toThrow();
      expect(await live(a.id)).toBe(1);
      const after = (await getUserById(a.id))!;
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.dekWrapped).toBe(before.dekWrapped);
    });

    it("a failure inside the real tx (DB trigger on the users UPDATE) makes finalizeRecoveryReset throw and rolls back the OAuth revoke", async () => {
      const a = await mkUser();
      await grant(a.id, a.dek);
      const before = (await getUserById(a.id))!;
      const fn = "b3_fail_" + crypto.randomBytes(4).toString("hex");
      await db.execute(sql.raw(`CREATE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN IF NEW.id = '${a.id}' AND NEW.session_not_before IS NOT NULL THEN RAISE EXCEPTION 'b3 forced failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`));
      await db.execute(sql.raw(`CREATE TRIGGER ${fn} BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION ${fn}()`));
      try {
        await expect(finalizeRecoveryReset({ userId: a.id, newPassword: NEW_PW, dek: a.dek })).rejects.toThrow();
      } finally {
        await db.execute(sql.raw(`DROP TRIGGER ${fn} ON users`));
        await db.execute(sql.raw(`DROP FUNCTION ${fn}()`));
      }
      expect(await live(a.id)).toBe(1);
      const after = (await getUserById(a.id))!;
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.dekWrapped).toBe(before.dekWrapped);
    }, 30_000);

    it("recovery email advises regenerating the API key", async () => {
      const u = await mkUser({ email: `b3-${crypto.randomUUID()}@example.com` });
      await finalizeRecoveryReset({ userId: u.id, newPassword: NEW_PW, dek: u.dek });
      await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalled());
      const m = sendEmailMock.mock.calls[0][0];
      expect(m.html).toMatch(/regenerate your API key/i);
      expect(m.text).toMatch(/regenerate your API key/i);
      const direct = passwordChangedEmail("a@b.co");
      expect(direct.html + direct.text).toMatch(/API key/);
    }, 30_000);
  });
});
