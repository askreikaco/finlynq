/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Multi-account switcher B1 — bundle helper + routes against REAL Postgres
 * (*_test DB; skipped otherwise). Plan §7.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

vi.mock("@/lib/auth/jwt", async (orig) => {
  const real = await orig<typeof import("@/lib/auth/jwt")>();
  return { ...real, createSessionToken: vi.fn(real.createSessionToken) };
});

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { createUser, setSessionNotBefore } from "@/lib/auth/queries";
import { createSessionToken, signShortLived, _clearRevokedJtiCache, isJtiRevoked, SESSION_TTL_MS } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache, bustSessionCutoff } from "@/lib/auth/session-cutoff";
import { commitSession, loadBundle } from "@/lib/auth/session-bundle";
import { putDEK, getDEK } from "@/lib/crypto/dek-cache";
import { requireAuth } from "@/lib/auth/require-auth";
import * as switchRoute from "@/app/api/auth/switch/route";
import { GET as accountsGET } from "@/app/api/auth/accounts/route";
import { POST as addIntentPOST, DELETE as addIntentDELETE } from "@/app/api/auth/add-intent/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { middleware } from "@/middleware";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const SECRET = new TextEncoder().encode(process.env.PF_JWT_SECRET!);

// ─── tiny cookie jar honouring Path ─────────────────────────────────────────
class Jar {
  ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  m = new Map<string, { value: string; path: string }>();
  apply(res: NextResponse) {
    for (const c of res.cookies.getAll()) {
      if (!c.value || c.maxAge === 0) this.m.delete(c.name);
      else this.m.set(c.name, { value: c.value, path: c.path ?? "/" });
    }
  }
  header(pathname: string) {
    return [...this.m.entries()]
      .filter(([, v]) => pathname === v.path || pathname.startsWith(v.path === "/" ? "/" : v.path + "/") || v.path === "/")
      .map(([k, v]) => `${k}=${v.value}`)
      .join("; ");
  }
  get(name: string) { return this.m.get(name)?.value; }
  set(name: string, value: string, p = "/") { this.m.set(name, { value, path: p }); }
  req(pathname: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...(init.headers ?? {}) };
    const ck = this.header(pathname);
    if (ck) headers.cookie = ck;
    if (init.body !== undefined) headers["content-type"] ??= "application/json";
    return new NextRequest(new URL(pathname, "http://localhost"), {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }
}

async function mkUser(role?: string) {
  const u = await createUser({
    username: "mu" + crypto.randomUUID(),
    email: `${crypto.randomUUID()}@ex.test`,
    passwordHash: "h", kekSalt: "a", dekWrapped: "b", dekWrappedIv: "c", dekWrappedTag: "d",
  } as any);
  if (role) await db.update(s.users).set({ role } as any).where(eq(s.users.id, u.id));
  return u.id as string;
}
async function mkSession(userId: string, opts: { dek?: boolean; pending?: boolean } = {}) {
  const dekBuf = crypto.randomBytes(32);
  const { token, jti } = opts.pending
    ? await createSessionToken(userId, false, { expirationTime: "5m", pending: true })
    : await createSessionToken(userId, true);
  if (opts.dek !== false && !opts.pending) putDEK(jti, dekBuf, SESSION_TTL_MS, userId);
  return { token, jti, userId, dek: dekBuf };
}
/** Login-commit helper: performs commitSession on a response, applies to jar. */
async function login(jar: Jar, s: { token: string; jti: string; userId: string }) {
  const res = NextResponse.json({ ok: true });
  await commitSession(jar.req("/api/auth/login", { method: "POST", body: {} }), res, s);
  jar.apply(res);
  return res;
}
async function addIntent(jar: Jar) {
  const r = await addIntentPOST(jar.req("/api/auth/add-intent", { method: "POST" }));
  jar.apply(r as NextResponse);
  return r;
}
async function activeEmailUserId(jar: Jar) {
  const r = await sessionGET(jar.req("/api/auth/session"));
  return (await r.json()).userId as string | null;
}
const post = (jar: Jar, userId: string, extra: Record<string, string> = {}) =>
  switchRoute.POST(jar.req("/api/auth/switch", { method: "POST", body: { userId }, headers: extra }));
const stashUsers = async (jar: Jar) => (await loadBundle(jar.req("/api/auth/accounts"))).stash.map((m) => m.userId);

describe.skipIf(!HAS_DB)("multi-account B1 (real Postgres)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => { _clearRevokedJtiCache(); _clearSessionCutoffCache(); });

  /** Signed in as A, then added B (B active, A stashed). */
  async function twoAccounts() {
    const jar = new Jar();
    const A = await mkSession(await mkUser());
    const B = await mkSession(await mkUser("admin"));
    await login(jar, A);
    expect((await addIntent(jar)).status).toBe(200);
    await login(jar, B);
    return { jar, A, B };
  }

  // ── bundle / commit ───────────────────────────────────────────────────────
  it("plain login: sets pf_session (HttpOnly, Lax, Path=/), no stash; cookie flags", async () => {
    const jar = new Jar();
    const A = await mkSession(await mkUser());
    const res = await login(jar, A);
    const c = res.cookies.get("pf_session")!;
    expect(c.httpOnly).toBe(true); expect(c.sameSite).toBe("lax"); expect(c.path).toBe("/");
    expect(jar.get("pf_accounts")).toBeUndefined();
    expect(await activeEmailUserId(jar)).toBe(A.userId);
  });

  it("add flow: old active -> stash (Path=/api/auth, HttpOnly), new active, pf_add cleared", async () => {
    const { jar, A, B } = await twoAccounts();
    expect(jar.m.get("pf_accounts")!.path).toBe("/api/auth");
    expect(jar.get("pf_add")).toBeUndefined();
    expect(await activeEmailUserId(jar)).toBe(B.userId);
    expect(await stashUsers(jar)).toEqual([A.userId]);
  });

  it("forged / unbound / missing pf_add => legacy replace (old active NOT stashed)", async () => {
    for (const mode of ["garbage", "other-jti", "wrong-purpose"]) {
      const jar = new Jar();
      const A = await mkSession(await mkUser());
      await login(jar, A);
      if (mode === "garbage") jar.set("pf_add", "x.y.z", "/api/auth");
      if (mode === "other-jti") jar.set("pf_add", await signShortLived({ activeJti: "not-mine" }, 600, "add-account"), "/api/auth");
      if (mode === "wrong-purpose") jar.set("pf_add", await signShortLived({ activeJti: A.jti }, 600, "google-link"), "/api/auth");
      const B = await mkSession(await mkUser());
      await login(jar, B);
      expect(await stashUsers(jar), mode).toEqual([]);
      expect(await activeEmailUserId(jar)).toBe(B.userId);
    }
  });

  it("re-login same account REPLACES its entry (no duplicate) and revokes the old jti", async () => {
    const { jar, A, B } = await twoAccounts(); // active B, stash [A]
    expect((await addIntent(jar)).status).toBe(200);
    const A2 = await mkSession(A.userId);
    await login(jar, A2);
    expect(await activeEmailUserId(jar)).toBe(A.userId);
    expect(await stashUsers(jar)).toEqual([B.userId]); // A not duplicated in stash
    expect(await isJtiRevoked(A.jti)).toBe(true);
    // same-user re-login while that user is active also replaces
    expect((await addIntent(jar)).status).toBe(200);
    const A3 = await mkSession(A.userId);
    await login(jar, A3);
    expect(await stashUsers(jar)).toEqual([B.userId]);
    expect(await isJtiRevoked(A2.jti)).toBe(true);
  });

  it("cap: add-intent 409 at 5 accounts; commit race evicts+revokes the OLDEST (stash max 4)", async () => {
    const jar = new Jar();
    const s = [];
    for (let i = 0; i < 5; i++) {
      s.push(await mkSession(await mkUser()));
      if (i > 0) expect((await addIntent(jar)).status).toBe(200);
      await login(jar, s[i]);
    }
    expect((await loadBundle(jar.req("/api/auth/x"))).stash).toHaveLength(4);
    const r = await addIntentPOST(jar.req("/api/auth/add-intent", { method: "POST" }));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("account_cap");
    // forced commit past cap (race): valid pf_add minted earlier
    jar.set("pf_add", await signShortLived({ activeJti: s[4].jti }, 600, "add-account"), "/api/auth");
    const s6 = await mkSession(await mkUser());
    await login(jar, s6);
    const users = await stashUsers(jar);
    expect(users).toHaveLength(4);
    expect(users).not.toContain(s[0].userId);       // oldest evicted
    expect(await isJtiRevoked(s[0].jti)).toBe(true);
    expect(getDEK(s[0].jti, s[0].userId)).toBeNull();
  });

  it("cap: re-sign-in of an account ALREADY in the bundle (locked) is allowed at 5 and replaces its own entry", async () => {
    const jar = new Jar();
    const s: Array<Awaited<ReturnType<typeof mkSession>>> = [];
    for (let i = 0; i < 5; i++) {
      s.push(await mkSession(await mkUser(), { dek: i !== 1 })); // s[1] ends up locked (no DEK)
      if (i > 0) expect((await addIntent(jar)).status).toBe(200);
      await login(jar, s[i]);
    }
    const bundle = await loadBundle(jar.req("/api/auth/x"));
    expect(bundle.stash).toHaveLength(4);
    expect(bundle.stash.find((m) => m.userId === s[1].userId)?.status).toBe("locked");
    // no userId / unknown userId at cap: still blocked
    expect((await addIntentPOST(jar.req("/api/auth/add-intent", { method: "POST" }))).status).toBe(409);
    const stranger = await mkUser();
    expect((await addIntentPOST(jar.req("/api/auth/add-intent", { method: "POST", body: { userId: stranger } }))).status).toBe(409);
    // invalid body
    expect((await addIntentPOST(jar.req("/api/auth/add-intent", { method: "POST", body: { userId: s[1].userId, x: 1 } }))).status).toBe(400);
    // re-login of the locked member
    const r = await addIntentPOST(jar.req("/api/auth/add-intent", { method: "POST", body: { userId: s[1].userId } }));
    expect(r.status).toBe(200);
    jar.apply(r as NextResponse);
    const again = await mkSession(s[1].userId);
    await login(jar, again);
    expect(await activeEmailUserId(jar)).toBe(s[1].userId);
    const users = await stashUsers(jar);
    expect(users).toHaveLength(4);
    expect(new Set(users).size).toBe(4);
    for (const i of [0, 2, 3, 4]) expect(users).toContain(s[i].userId); // nobody evicted
    expect(await isJtiRevoked(s[1].jti)).toBe(true);
    expect(await isJtiRevoked(s[0].jti)).toBe(false);
  });

  it("DELETE add-intent clears pf_add (session-only, CSRF per middleware), sessions untouched", async () => {
    const { jar, A, B } = await twoAccounts();
    expect((await addIntent(jar)).status).toBe(200);
    expect(jar.get("pf_add")).toBeDefined();
    const r = await addIntentDELETE(jar.req("/api/auth/add-intent", { method: "DELETE" }));
    expect(r.status).toBe(200);
    jar.apply(r as NextResponse);
    expect(jar.get("pf_add")).toBeUndefined();
    expect(await activeEmailUserId(jar)).toBe(B.userId);
    expect(await stashUsers(jar)).toEqual([A.userId]);
    // unauthenticated + Bearer rejected
    expect((await addIntentDELETE(new Jar().req("/api/auth/add-intent", { method: "DELETE" }))).status).toBe(401);
    const r2 = await addIntentDELETE(new Jar().req("/api/auth/add-intent", { method: "DELETE", headers: { authorization: `Bearer ${A.token}` } }));
    expect(r2.status).toBe(403);
    // cross-origin cookie DELETE blocked by middleware CSRF
    const mw = middleware(jar.req("/api/auth/add-intent", { method: "DELETE", headers: { origin: "https://evil.example" } }));
    expect(mw?.status).toBe(403);
  });

  it("add-intent: unauthenticated 401; Bearer-authenticated rejected 403", async () => {
    const r = await addIntentPOST(new Jar().req("/api/auth/add-intent", { method: "POST" }));
    expect(r.status).toBe(401);
    const A = await mkSession(await mkUser());
    const r2 = await addIntentPOST(new Jar().req("/api/auth/add-intent", { method: "POST", headers: { authorization: `Bearer ${A.token}` } }));
    expect(r2.status).toBe(403);
  });

  // ── switch ────────────────────────────────────────────────────────────────
  it("switch changes the active user (session route before/after) and moves old active into stash", async () => {
    const { jar, A, B } = await twoAccounts();
    expect(await activeEmailUserId(jar)).toBe(B.userId);
    const r = await post(jar, A.userId);
    expect(r.status).toBe(200);
    jar.apply(r as NextResponse);
    expect(await activeEmailUserId(jar)).toBe(A.userId);
    expect(await stashUsers(jar)).toEqual([B.userId]);
    expect(jar.m.get("pf_session")!.path).toBe("/");
  });

  it("switch to an account NOT in the bundle -> 404 identical to an unknown id", async () => {
    const { jar } = await twoAccounts();
    const other = await mkSession(await mkUser());
    const r1 = await post(jar, other.userId);
    const r2 = await post(jar, crypto.randomUUID());
    expect(r1.status).toBe(404); expect(r2.status).toBe(404);
    expect(await r1.json()).toEqual(await r2.json());
  });

  it("switch never mints a token and never returns one; Set-Cookie only pf_session/pf_accounts", async () => {
    const { jar, A } = await twoAccounts();
    (createSessionToken as any).mockClear();
    const r = await post(jar, A.userId);
    expect(createSessionToken).not.toHaveBeenCalled();
    const body = JSON.stringify(await r.clone().json());
    expect(body).not.toMatch(/eyJ/);
    expect(body).toBe('{"status":"switched"}');
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(new Set((r as NextResponse).cookies.getAll().map((c) => c.name))).toEqual(new Set(["pf_session", "pf_accounts"]));
  });

  it("tampered bundle (garbage / bad signature / foreign secret / alg none) is ignored and cleared", async () => {
    const { jar, A, B } = await twoAccounts();
    const forged = await new SignJWT({ mfa: true, gen: "0" }).setProtectedHeader({ alg: "HS256" })
      .setSubject(A.userId).setJti(crypto.randomUUID()).setIssuer("pf-auth").setAudience("pf-app")
      .setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("a-different-secret-32-chars-minimum!!"));
    const enc = (ts: string[]) => Buffer.from(JSON.stringify(ts.map((t) => ({ t })))).toString("base64url");
    const goodTail = A.token.split(".")[2];
    for (const v of ["!!!notbase64!!!", enc([forged]), enc([A.token.replace(goodTail, "AAAA" + goodTail.slice(4))]), enc(["a.b.c"]), Buffer.from("{}").toString("base64url")]) {
      jar.set("pf_accounts", v, "/api/auth");
      const r = await post(jar, A.userId);
      expect(r.status).toBe(404);
      expect(await stashUsers(jar)).toEqual([]);
      expect(await activeEmailUserId(jar)).toBe(B.userId); // active untouched
    }
  });

  it("dead entries pruned from the cookie: revoked, session_not_before, gen mismatch, pending, expired", async () => {
    const jar = new Jar();
    const act = await mkSession(await mkUser());
    await login(jar, act);
    const mk = async (fn: (u: string) => Promise<string>) => { const u = await mkUser(); return { u, t: await fn(u) }; };
    const cut = await mk(async (u) => (await mkSession(u)).token);
    const rev = await mk(async (u) => { const s = await mkSession(u); const { revokeJti } = await import("@/lib/auth/jwt"); await revokeJti(s.jti, new Date(Date.now() + 3600e3)); return s.token; });
    const gen = await mk(async (u) => { const j = crypto.randomUUID(); putDEK(j, crypto.randomBytes(32), 1e6, u); return new SignJWT({ mfa: true, gen: "stale" }).setProtectedHeader({ alg: "HS256" }).setSubject(u).setJti(j).setIssuer("pf-auth").setAudience("pf-app").setIssuedAt().setExpirationTime("1h").sign(SECRET); });
    const pend = await mk(async (u) => (await mkSession(u, { pending: true })).token);
    const exp = await mk(async (u) => { const j = crypto.randomUUID(); putDEK(j, crypto.randomBytes(32), 1e6, u); return new SignJWT({ mfa: true, gen: "0" }).setProtectedHeader({ alg: "HS256" }).setSubject(u).setJti(j).setIssuer("pf-auth").setAudience("pf-app").setIssuedAt(Math.floor(Date.now() / 1000) - 7200).setExpirationTime(Math.floor(Date.now() / 1000) - 3600).sign(SECRET); });
    const live = await mkSession(await mkUser());
    await setSessionNotBefore(cut.u, new Date(Date.now() + 60_000)); bustSessionCutoff(cut.u);
    const enc = Buffer.from(JSON.stringify([cut.t, rev.t, gen.t, pend.t, exp.t, live.token].map((t) => ({ t })))).toString("base64url");
    jar.set("pf_accounts", enc, "/api/auth");

    for (const target of [cut.u, rev.u, gen.u, pend.u, exp.u]) {
      const r = await post(jar, target);
      expect(r.status).toBe(404);
    }
    const r = await accountsGET(jar.req("/api/auth/accounts"));
    jar.apply(r as NextResponse);
    expect(await stashUsers(jar)).toEqual([live.userId]);
    const list = await r.json();
    expect(list.map((a: any) => a.userId).sort()).toEqual([act.userId, live.userId].sort());
  });

  it("DEK evicted for the target -> 409 needs_login, entry kept, nothing switched, no tokens in body", async () => {
    const { jar, A, B } = await twoAccounts();
    const { deleteDEK } = await import("@/lib/crypto/dek-cache");
    deleteDEK(A.jti);
    const r = await post(jar, A.userId);
    expect(r.status).toBe(409);
    const body = await r.json();
    expect(body.status).toBe("needs_login");
    expect(Object.keys(body).sort()).toEqual(["email", "googleLinked", "hasPassword", "status"]);
    expect(JSON.stringify(body)).not.toMatch(/eyJ/);
    jar.apply(r as NextResponse);
    expect(await activeEmailUserId(jar)).toBe(B.userId);
  });

  it("recovery-style session_not_before on the stashed user: not switchable + pruned", async () => {
    const { jar, A, B } = await twoAccounts();
    await setSessionNotBefore(A.userId, new Date(Date.now() + 60_000)); bustSessionCutoff(A.userId);
    const r = await post(jar, A.userId);
    expect(r.status).toBe(404);
    jar.apply(r as NextResponse);
    expect(jar.get("pf_accounts")).toBeUndefined();
    expect(await activeEmailUserId(jar)).toBe(B.userId);
  });

  it("switch: only POST is exported; non-JSON content-type 415; Bearer/API-key credentials 403", async () => {
    expect(Object.keys(switchRoute).filter((k) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS|POST)$/.test(k))).toEqual(["POST"]);
    const { jar, A } = await twoAccounts();
    const r = await switchRoute.POST(jar.req("/api/auth/switch", { method: "POST", body: { userId: A.userId }, headers: { "content-type": "text/plain" } }));
    expect(r.status).toBe(415);
    const r2 = await post(jar, A.userId, { authorization: "Bearer x" });
    expect([401, 403]).toContain(r2.status);
    const r3 = await post(jar, A.userId, { "x-api-key": "pf_zzz" });
    expect([401, 403]).toContain(r3.status);
  });

  it("switch: strict body (extra key / index rejected)", async () => {
    const { jar, A } = await twoAccounts();
    const r = await switchRoute.POST(jar.req("/api/auth/switch", { method: "POST", body: { userId: A.userId, index: 0 } }));
    expect(r.status).toBe(400);
  });

  it("switch: CSRF — cross-origin POST with session cookie is 403 at middleware; same-origin passes", async () => {
    const { jar } = await twoAccounts();
    const evil = middleware(jar.req("/api/auth/switch", { method: "POST", body: { userId: "x" }, headers: { origin: "https://evil.example" } }));
    expect(evil.status).toBe(403);
    const none = middleware(jar.req("/api/auth/switch", { method: "POST", body: { userId: "x" } }));
    expect(none.status).toBe(403);
    const ok = middleware(jar.req("/api/auth/switch", { method: "POST", body: { userId: "x" }, headers: { origin: "http://localhost" } }));
    expect(ok.status).not.toBe(403);
    // same for add-intent + logout
    for (const p of ["/api/auth/add-intent", "/api/auth/logout"]) {
      expect(middleware(jar.req(p, { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
    }
  });

  it("switch: rate limited (429)", async () => {
    const { jar, A } = await twoAccounts();
    let last = 0;
    for (let i = 0; i < 40; i++) {
      const r = await post(jar, crypto.randomUUID());
      last = r.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
    void A;
  });

  it("list: only {userId,email,displayName,isAdmin,active,status}; no tokens/jti anywhere; no-store", async () => {
    const { jar, A, B } = await twoAccounts();
    const r = await accountsGET(jar.req("/api/auth/accounts"));
    const text = await r.text();
    expect(text).not.toMatch(/eyJ/);
    expect(text).not.toContain(A.jti); expect(text).not.toContain(B.jti);
    const list = JSON.parse(text);
    expect(list).toHaveLength(2);
    for (const a of list) expect(Object.keys(a).sort()).toEqual(["active", "displayName", "email", "isAdmin", "status", "userId"]);
    expect(list.find((a: any) => a.active).userId).toBe(B.userId);
    expect(list.find((a: any) => a.active).isAdmin).toBe(true);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  // ── isolation ─────────────────────────────────────────────────────────────
  it("pf_accounts alone (no pf_session) never authenticates a data route; stash not sent outside /api/auth", async () => {
    const { jar } = await twoAccounts();
    expect(jar.header("/api/accounts")).not.toContain("pf_accounts");
    expect(jar.header("/api/auth/switch")).toContain("pf_accounts");
    const only = new Jar();
    only.set("pf_accounts", jar.get("pf_accounts")!, "/");
    const r = await requireAuth(only.req("/api/accounts"));
    expect(r.authenticated).toBe(false);
  });

  it("DEK of A is never served while B is active (and across a switch round-trip)", async () => {
    const { jar, A, B } = await twoAccounts();
    const ctxB = await requireAuth(jar.req("/api/accounts"));
    expect(ctxB.authenticated && ctxB.context.userId).toBe(B.userId);
    expect(ctxB.authenticated && ctxB.context.dek!.equals(B.dek)).toBe(true);
    expect(ctxB.authenticated && ctxB.context.dek!.equals(A.dek)).toBe(false);
    // cache is keyed (jti,userId): cross-user lookups are null in both directions
    expect(getDEK(A.jti, B.userId)).toBeNull();
    expect(getDEK(B.jti, A.userId)).toBeNull();
    jar.apply((await post(jar, A.userId)) as NextResponse);
    const ctxA = await requireAuth(jar.req("/api/accounts"));
    expect(ctxA.authenticated && ctxA.context.dek!.equals(A.dek)).toBe(true);
    expect(ctxA.authenticated && ctxA.context.dek!.equals(B.dek)).toBe(false);
  });

  it("a session token for user B with A's jti never resolves A's DEK (cache keyed by jti AND userId)", async () => {
    const A = await mkSession(await mkUser());
    const B = await mkUser();
    const forged = await new SignJWT({ mfa: true, gen: "0" }).setProtectedHeader({ alg: "HS256" })
      .setSubject(B).setJti(A.jti).setIssuer("pf-auth").setAudience("pf-app").setIssuedAt().setExpirationTime("1h").sign(SECRET);
    const jar = new Jar(); jar.set("pf_session", forged);
    const r = await requireAuth(jar.req("/api/accounts"));
    expect(r.authenticated && r.context.dek).toBeNull();
  });

  // ── logout ────────────────────────────────────────────────────────────────
  it("logout active -> next account becomes active; old jti revoked + DEK wiped; others valid", async () => {
    const { jar, A, B } = await twoAccounts();
    const r = await logoutPOST(jar.req("/api/auth/logout", { method: "POST" }));
    expect(await r.clone().json()).toEqual({ success: true, activeUserId: A.userId });
    jar.apply(r as NextResponse);
    expect(await activeEmailUserId(jar)).toBe(A.userId);
    expect(await isJtiRevoked(B.jti)).toBe(true);
    expect(getDEK(B.jti, B.userId)).toBeNull();
    expect(await isJtiRevoked(A.jti)).toBe(false);
    expect(getDEK(A.jti, A.userId)).not.toBeNull();
    expect(await stashUsers(jar)).toEqual([]);
    expect(jar.get("pf_accounts")).toBeUndefined();
  });

  it("logout of the LAST account clears everything and revokes its jti", async () => {
    const jar = new Jar();
    const A = await mkSession(await mkUser());
    await login(jar, A);
    const r = await logoutPOST(jar.req("/api/auth/logout", { method: "POST" }));
    expect((await r.clone().json()).activeUserId).toBeNull();
    jar.apply(r as NextResponse);
    expect(jar.get("pf_session")).toBeUndefined();
    expect(jar.get("pf_accounts")).toBeUndefined();
    expect(await isJtiRevoked(A.jti)).toBe(true);
  });

  it("logout all: every jti revoked, every DEK wiped, both cookies cleared", async () => {
    const { jar, A, B } = await twoAccounts();
    const C = await mkSession(await mkUser());
    await addIntent(jar); await login(jar, C);
    const r = await logoutPOST(jar.req("/api/auth/logout?all=1", { method: "POST" }));
    expect((await r.clone().json()).activeUserId).toBeNull();
    jar.apply(r as NextResponse);
    expect(jar.m.size).toBe(0);
    for (const s of [A, B, C]) {
      expect(await isJtiRevoked(s.jti)).toBe(true);
      expect(getDEK(s.jti, s.userId)).toBeNull();
    }
  });

  it("logout active with only a DEK-less (unusable) stash left: clears everything, revokes leftovers", async () => {
    const { jar, A } = await twoAccounts();
    const { deleteDEK } = await import("@/lib/crypto/dek-cache");
    deleteDEK(A.jti);
    const r = await logoutPOST(jar.req("/api/auth/logout", { method: "POST" }));
    expect((await r.clone().json()).activeUserId).toBeNull();
    jar.apply(r as NextResponse);
    expect(jar.m.size).toBe(0);
    expect(await isJtiRevoked(A.jti)).toBe(true);
  });

  it("logout keeps pf_device by default; ?everywhere=1 clears it", async () => {
    const { jar } = await twoAccounts();
    const r = await logoutPOST(jar.req("/api/auth/logout", { method: "POST" }));
    expect((r as NextResponse).cookies.get("pf_device")).toBeUndefined();
    const { jar: j2 } = await twoAccounts();
    const r2 = await logoutPOST(j2.req("/api/auth/logout?everywhere=1", { method: "POST" }));
    expect((r2 as NextResponse).cookies.get("pf_device")?.maxAge).toBe(0);
  });

  // ── wiring ────────────────────────────────────────────────────────────────
  it("zero-click guard: valid active session => no cookie set, no token minted, redirect to next", async () => {
    const { zeroClickLogin } = await import("@/lib/auth/zero-click-login");
    const jar = new Jar();
    const A = await mkSession(await mkUser());
    await login(jar, A);
    (createSessionToken as any).mockClear();
    const res = await zeroClickLogin(jar.req("/try-demo?next=/dashboard"), { slug: "try-demo", identifier: "x", password: "y", seedHint: "", defaultNext: "/dashboard" } as any);
    expect(createSessionToken).not.toHaveBeenCalled();
    expect(res.cookies.getAll()).toHaveLength(0);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });

  it("every session-cookie writer routes through commitSession; nothing else writes pf_session", () => {
    const root = path.resolve(__dirname, "../../src");
    const files: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) files.push(p); } };
    walk(root);
    const offenders = files.filter((f) => {
      const t = fs.readFileSync(f, "utf8");
      return !f.endsWith("session-bundle.ts") && /cookies\s*\.\s*set\(\s*(["']pf_session["']|AUTH_COOKIE)/.test(t);
    });
    expect(offenders).toEqual([]);
    for (const rel of [
      "app/api/auth/login/route.ts", "app/api/auth/mfa/verify/route.ts", "app/api/auth/register/route.ts",
      "app/api/auth/google/callback/route.ts", "app/api/auth/google/unlock/route.ts", "lib/auth/zero-click-login.ts",
    ]) {
      expect(fs.readFileSync(path.join(root, rel), "utf8"), rel).toMatch(/commitSession\(/);
    }
    // Every cookie-writing caller of finalizeRecoveryReset must commitSession (B4: code + device routes).
    const callers = files.filter((f) => !f.endsWith("recovery.ts") && /finalizeRecoveryReset\(/.test(fs.readFileSync(f, "utf8")));
    expect(callers.map((f) => path.relative(root, f)).sort()).toEqual([
      "app/api/auth/recovery/code/reset/route.ts",
      "app/api/auth/recovery/device/reset/route.ts",
    ]);
    for (const f of callers) expect(fs.readFileSync(f, "utf8"), f).toMatch(/commitSession\(/);
  });
});
