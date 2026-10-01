/**
 * Admin > Integrations > Email — DB-backed route tests (real Postgres).
 * Skipped unless DATABASE_URL names a `*_test` database, e.g.
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/intg_test npx vitest run tests/admin-integrations-email.db.test.ts
 * Apply scripts/migrations first (node scripts/run-migrations.mjs).
 *
 * Only `requireAuth` (JWT/cookie layer) is mocked. requireAdmin, step-up, the
 * rate limiter, the envelope, the store, the audit helper and the DB are real.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { TOTP } from "otpauth";
import { sql, eq, inArray, asc } from "drizzle-orm";
import { NextRequest } from "next/server";

const DB_URL = process.env.DATABASE_URL || process.env.PF_DATABASE_URL || "";
const HAS_TEST_DB = /\/[^/]*_test([?#]|$)/.test(DB_URL);

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));

import { requireAuth } from "@/lib/auth/require-auth";
import { bootstrapTestDb, shutdownTestDb } from "./helpers/portfolio-fixtures";
import { db, schema } from "@/db";
import { putDEK, deleteDEK } from "@/lib/crypto/dek-cache";
import { encryptField } from "@/lib/crypto/envelope";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { encryptSystemSetting, decryptSystemSetting } from "@/lib/crypto/system-settings-envelope";
import { invalidateEmailOverrides, loadEmailOverrides } from "@/lib/system-settings";
import { resolveEmailConfig } from "@/lib/email";
import { GET, POST } from "@/app/api/admin/integrations/email/route";
import { PUT } from "@/app/api/admin/integrations/email/settings/route";
import { POST as REVERT } from "@/app/api/admin/integrations/email/settings/revert/route";

const STAGING = "db-test-staging-key-0123456789abcdef";
const DEK = Buffer.alloc(32, 0xaa);
const PW = "correct horse battery";
const BREVO_ENV = "xkeysib-SECRET123";
const RESEND_ENV = "re_ENVSECRET456";
const SMTP_PASS_ENV = "smtp-ENVPASS789";
const BREVO_DB = "xkeysib-DBSECRET321";
const RESEND_DB = "re_DBSECRET654";
const ALL_SECRETS = [BREVO_ENV, RESEND_ENV, SMTP_PASS_ENV, BREVO_DB, RESEND_DB, "smtp-DBPASS987", "dbuser-SECRET"];
const ENV_KEYS = ["PF_STAGING_KEY", "RESEND_API_KEY", "BREVO_API_KEY", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"];

const envSaved: Record<string, string | undefined> = {};
const createdUsers: string[] = [];
let consoleText = "";
const mockedAuth = vi.mocked(requireAuth);

type Who = { id: string; session: string; totp?: string };

async function mkUser(role: "admin" | "user", mfa = false): Promise<Who> {
  const id = randomUUID();
  const now = new Date().toISOString();
  let mfaSecret: string | null = null;
  let totp: string | undefined;
  if (mfa) {
    totp = generateMfaSecret("x@y.z").secret;
    mfaSecret = encryptField(DEK, totp);
  }
  await db.insert(schema.users).values({
    id, username: `u-${id.slice(0, 8)}`, email: `${id.slice(0, 8)}@t.local`,
    passwordHash: bcrypt.hashSync(PW, 4), role, mfaEnabled: mfa ? 1 : 0, mfaSecret,
    createdAt: now, updatedAt: now,
  });
  createdUsers.push(id);
  const session = `sess-${id}`;
  putDEK(session, DEK, 60_000, id);
  return { id, session, totp };
}

function actAs(w: Who, over: { method?: "account" | "api_key" | "oauth"; sessionId?: string | null } = {}) {
  mockedAuth.mockResolvedValue({
    authenticated: true,
    context: {
      userId: w.id, method: over.method ?? "account", mfaVerified: false, dek: null,
      sessionId: over.sessionId === undefined ? w.session : over.sessionId,
    },
  } as never);
}

const code = (secret: string) =>
  new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  } as never);
const put = (b: unknown) => PUT(req("PUT", "/api/admin/integrations/email/settings", b));
const revert = (b: unknown = { password: PW }) => REVERT(req("POST", "/api/admin/integrations/email/settings/revert", b));
const getStatus = () => GET(req("GET", "/api/admin/integrations/email"));
const sendTest = (b: unknown = { to: "dest@example.com" }) => POST(req("POST", "/api/admin/integrations/email", b));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const j = async (r: Response) => ({ status: r.status, text: await r.clone().text(), body: await r.json() as Record<string, any> });
const rows = async () => {
  const res = (await db.execute(sql`SELECT key, value_ct FROM system_settings WHERE key LIKE 'email.%' AND key <> 'email._backup' ORDER BY key`)) as unknown as
    | { key: string; value_ct: string }[]
    | { rows: { key: string; value_ct: string }[] };
  return Array.isArray(res) ? res : res.rows;
};
/** Whole table incl. the one-step backup row. */
const allRows = async () => {
  const res = (await db.execute(sql`SELECT * FROM system_settings`)) as unknown as unknown[] | { rows: unknown[] };
  return Array.isArray(res) ? res : res.rows;
};
const sentHeaders = (fm: ReturnType<typeof vi.fn>, i = -1) => {
  const call = fm.mock.calls.at(i) as unknown as [string, RequestInit];
  return { url: call[0], headers: call[1].headers as Record<string, string> };
};

describe.skipIf(!HAS_TEST_DB)("admin integrations email (DB)", () => {
  let admin: Who;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    await bootstrapTestDb();
  });
  afterAll(async () => {
    if (createdUsers.length) {
      await db.delete(schema.adminAudit).where(inArray(schema.adminAudit.adminUserId, createdUsers));
      await db.delete(schema.users).where(inArray(schema.users.id, createdUsers));
    }
    await db.execute(sql`DELETE FROM system_settings WHERE key LIKE 'email.%'`);
    await shutdownTestDb();
  });

  beforeEach(async () => {
    for (const k of ENV_KEYS) { envSaved[k] = process.env[k]; delete process.env[k]; }
    process.env.PF_STAGING_KEY = STAGING;
    await db.execute(sql`DELETE FROM system_settings WHERE key LIKE 'email.%'`);
    invalidateEmailOverrides();
    consoleText = "";
    for (const m of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        consoleText += a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n";
      });
    }
    fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    admin = await mkUser("admin");
    actAs(admin);
  });
  afterEach(() => {
    // Console must never contain a stored or env secret.
    for (const s of ALL_SECRETS) expect(consoleText).not.toContain(s);
    for (const k of ENV_KEYS) { if (envSaved[k] === undefined) delete process.env[k]; else process.env[k] = envSaved[k]; }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    deleteDEK(admin.session);
  });

  // ─── status ────────────────────────────────────────────────────────────────
  describe("GET status", () => {
    it("reports provider/from/configured/source and never returns env key material", async () => {
      process.env.BREVO_API_KEY = BREVO_ENV;
      process.env.SMTP_HOST = "smtp.example.com";
      process.env.SMTP_PASS = SMTP_PASS_ENV;
      process.env.EMAIL_FROM = "Acme <noreply@acme.test>";
      const r = await j(await getStatus());
      expect(r.status).toBe(200);
      expect(r.body.provider).toBe("brevo");
      expect(r.body.from).toEqual({ name: "Acme", address: "noreply@acme.test" });
      expect(r.body.configured).toEqual({ brevo: true, resend: false, smtp: true });
      expect(r.body.sources).toMatchObject({
        brevoApiKey: "env", resendApiKey: "none", smtpHost: "env", smtpPass: "env", from: "env", provider: "none",
      });
      for (const s of ALL_SECRETS) expect(r.text).not.toContain(s);
    });

    it("empty table matches today's env-only behaviour (precedence resend > brevo > smtp)", async () => {
      expect((await j(await getStatus())).body.provider).toBe("none");
      process.env.SMTP_HOST = "h.test";
      invalidateEmailOverrides();
      expect((await j(await getStatus())).body.provider).toBe("smtp");
      process.env.BREVO_API_KEY = BREVO_ENV;
      expect((await j(await getStatus())).body.provider).toBe("brevo");
      process.env.RESEND_API_KEY = RESEND_ENV;
      const r = await j(await getStatus());
      expect(r.body.provider).toBe("resend");
      expect(r.body.sources.resendApiKey).toBe("env");
      expect(await rows()).toHaveLength(0);
    });

    it("never returns a DB-stored secret either", async () => {
      expect((await put({ brevoApiKey: BREVO_DB, smtpPass: "smtp-DBPASS987", smtpUser: "dbuser-SECRET", password: PW })).status).toBe(200);
      const r = await j(await getStatus());
      expect(r.body.sources).toMatchObject({ brevoApiKey: "db", smtpPass: "db", smtpUser: "db" });
      for (const s of ALL_SECRETS) expect(r.text).not.toContain(s);
    });
  });

  // ─── access control ────────────────────────────────────────────────────────
  describe("access control", () => {
    it("non-admin gets 403 on GET, POST, PUT and revert; nothing stored", async () => {
      const user = await mkUser("user");
      actAs(user);
      expect((await getStatus()).status).toBe(403);
      expect((await sendTest()).status).toBe(403);
      expect((await put({ brevoApiKey: BREVO_DB, password: PW })).status).toBe(403);
      expect((await revert()).status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await rows()).toHaveLength(0);
    });

    it("API key / OAuth auth (no session) gets 403 on every endpoint, even for an admin", async () => {
      for (const over of [{ method: "api_key" as const, sessionId: null }, { method: "oauth" as const, sessionId: null }]) {
        actAs(admin, over);
        expect((await getStatus()).status).toBe(403);
        expect((await sendTest()).status).toBe(403);
        expect((await put({ brevoApiKey: BREVO_DB, password: PW })).status).toBe(403);
        expect((await revert()).status).toBe(403);
      }
      expect(await rows()).toHaveLength(0);
    });

    it("unauthenticated passes the 401 through", async () => {
      mockedAuth.mockResolvedValue({ authenticated: false, response: new Response(JSON.stringify({ error: "no" }), { status: 401 }) } as never);
      expect((await put({ brevoApiKey: BREVO_DB, password: PW })).status).toBe(401);
    });

    it("missing step-up is 403 and stores nothing (password admin)", async () => {
      const r = await j(await put({ brevoApiKey: BREVO_DB }));
      expect(r.status).toBe(403);
      expect(r.body.code).toBe("PASSWORD_REQUIRED");
      expect(await rows()).toHaveLength(0);
      expect((await revert({})).status).toBe(403);
    });

    it("wrong password is 401 and stores nothing", async () => {
      expect((await put({ brevoApiKey: BREVO_DB, password: "nope" })).status).toBe(401);
      expect(await rows()).toHaveLength(0);
    });

    it("MFA admin: missing code 403 MFA_REQUIRED, wrong code 401, valid code 200", async () => {
      const m = await mkUser("admin", true);
      actAs(m);
      const miss = await j(await put({ brevoApiKey: BREVO_DB, password: PW }));
      expect(miss.status).toBe(403);
      expect(miss.body.code).toBe("MFA_REQUIRED");
      expect((await put({ brevoApiKey: BREVO_DB, mfaCode: "000000" })).status).toBe(401);
      expect(await rows()).toHaveLength(0);
      expect((await revert({})).status).toBe(403);
      expect((await put({ brevoApiKey: BREVO_DB, mfaCode: code(m.totp!) })).status).toBe(200);
      expect((await rows()).map((r) => r.key)).toContain("email.brevoApiKey");
      deleteDEK(m.session);
    });

    it("MFA admin without a live session DEK gets 423", async () => {
      const m = await mkUser("admin", true);
      deleteDEK(m.session);
      actAs(m);
      expect((await put({ brevoApiKey: BREVO_DB, mfaCode: code(m.totp!) })).status).toBe(423);
    });
  });

  // ─── PUT semantics ─────────────────────────────────────────────────────────
  describe("PUT settings", () => {
    it("response is only {set, source} per field; ciphertext at rest differs from plaintext and round-trips", async () => {
      const r = await j(await put({
        provider: "brevo", from: "Acme <noreply@acme.test>", brevoApiKey: BREVO_DB, smtpHost: "smtp.acme.test",
        smtpPort: 587, smtpUser: "dbuser-SECRET", smtpPass: "smtp-DBPASS987", password: PW,
      }));
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(["canRevert", "fields"]);
      expect(Object.keys(r.body.fields).sort()).toEqual(
        ["brevoApiKey", "from", "provider", "resendApiKey", "smtpHost", "smtpPass", "smtpPort", "smtpUser"],
      );
      for (const v of Object.values(r.body.fields) as Record<string, unknown>[]) {
        expect(Object.keys(v).sort()).toEqual(["set", "source"]);
      }
      expect(r.body.fields.brevoApiKey).toEqual({ set: true, source: "db" });
      expect(r.body.fields.resendApiKey).toEqual({ set: false, source: "none" });
      for (const s of ALL_SECRETS) expect(r.text).not.toContain(s);
      expect(r.text).not.toContain("acme.test"); // not even non-secret values

      const stored = await rows();
      const dump = JSON.stringify(await allRows()); // includes the backup row
      for (const s of ALL_SECRETS) expect(dump).not.toContain(s);
      const brevo = stored.find((x) => x.key === "email.brevoApiKey")!;
      expect(brevo.value_ct).not.toBe(BREVO_DB);
      expect(brevo.value_ct.startsWith("ss1:")).toBe(true);
      expect(decryptSystemSetting("email.brevoApiKey", brevo.value_ct)).toBe(BREVO_DB);
      expect(stored.every((x) => x.value_ct.startsWith("ss1:"))).toBe(true); // even non-secret fields
    });

    it("DB overrides env; null clears and falls back to env; omitted keeps", async () => {
      process.env.BREVO_API_KEY = BREVO_ENV;
      expect((await put({ brevoApiKey: BREVO_DB, password: PW })).status).toBe(200);
      expect((await sendTest()).status).toBe(200);
      expect(sentHeaders(fetchMock).headers["api-key"]).toBe(BREVO_DB);

      // omitted keeps
      expect((await put({ from: "Acme <noreply@acme.test>", password: PW })).status).toBe(200);
      expect((await j(await getStatus())).body.sources.brevoApiKey).toBe("db");
      await sendTest();
      expect(sentHeaders(fetchMock).headers["api-key"]).toBe(BREVO_DB);

      // null clears -> env again
      const cleared = await j(await put({ brevoApiKey: null, password: PW }));
      expect(cleared.body.fields.brevoApiKey).toEqual({ set: true, source: "env" });
      await sendTest();
      expect(sentHeaders(fetchMock).headers["api-key"]).toBe(BREVO_ENV);
      expect((await rows()).map((r) => r.key)).not.toContain("email.brevoApiKey");
    });

    it("explicit provider vs automatic precedence", async () => {
      process.env.RESEND_API_KEY = RESEND_ENV;
      process.env.BREVO_API_KEY = BREVO_ENV;
      await sendTest();
      expect(sentHeaders(fetchMock).url).toContain("api.resend.com");
      expect((await put({ provider: "brevo", password: PW })).status).toBe(200);
      expect((await j(await getStatus())).body.provider).toBe("brevo");
      await sendTest();
      expect(sentHeaders(fetchMock).url).toContain("api.brevo.com");
      // explicit provider that is not configured: never silently switches
      expect((await put({ provider: "smtp", password: PW })).status).toBe(200);
      expect((await j(await getStatus())).body.provider).toBe("none");
      fetchMock.mockClear();
      const t = await j(await sendTest());
      expect(t.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
      // back to auto
      await put({ provider: "auto", password: PW });
      expect((await j(await getStatus())).body.provider).toBe("resend");
    });

    it("cache is invalidated on save and revert; entries also expire after 60s", async () => {
      process.env.BREVO_API_KEY = BREVO_ENV;
      expect((await j(await getStatus())).body.sources.brevoApiKey).toBe("env"); // primes the cache
      await put({ brevoApiKey: BREVO_DB, password: PW });
      expect((await j(await getStatus())).body.sources.brevoApiKey).toBe("db");
      await revert();
      expect((await j(await getStatus())).body.sources.brevoApiKey).toBe("env");

      // TTL: out-of-band write is invisible until 60s passed or invalidation
      vi.useFakeTimers({ toFake: ["Date"] });
      invalidateEmailOverrides();
      await loadEmailOverrides();
      await db.execute(sql`INSERT INTO system_settings (key, value_ct) VALUES ('email.smtpHost', ${encryptSystemSetting("email.smtpHost", "late.example.com")})`);
      expect((await loadEmailOverrides()).smtpHost).toBeUndefined();
      vi.setSystemTime(Date.now() + 61_000);
      expect((await loadEmailOverrides()).smtpHost).toBe("late.example.com");
    });

    it("decrypt failure warns without values and falls back to env", async () => {
      process.env.BREVO_API_KEY = BREVO_ENV;
      await put({ brevoApiKey: BREVO_DB, password: PW });
      process.env.PF_STAGING_KEY = "rotated-staging-key-0123456789abcdef!";
      invalidateEmailOverrides();
      const cfg = await resolveEmailConfig();
      expect(cfg.brevoApiKey).toEqual({ value: BREVO_ENV, source: "env" });
      expect(consoleText).toContain("[system-settings] cannot decrypt email.brevoApiKey");
      const stored = (await rows()).find((r) => r.key === "email.brevoApiKey")!;
      expect(consoleText).not.toContain(stored.value_ct);
    });

    it("rejects invalid input with 400 and stores nothing", async () => {
      const bad: unknown[] = [
        { from: "not-an-address", password: PW },
        { from: "a@b.co\r\nBcc: evil@x.co", password: PW },
        { smtpPort: 70000, password: PW },
        { smtpHost: "bad host!", password: PW },
        { brevoApiKey: "", password: PW },
        { brevoApiKey: "has space", password: PW },
        { provider: "mailgun", password: PW },
        { unknownField: 1, password: PW },
      ];
      for (const b of bad) expect((await put(b)).status, JSON.stringify(b)).toBe(400);
      expect((await PUT(new NextRequest("http://localhost:3000/x", { method: "PUT", body: "{nope" }))).status).toBe(400);
      expect(await rows()).toHaveLength(0);
    });

    it("refuses to store a secret without a server key (no plaintext fallback)", async () => {
      delete process.env.PF_STAGING_KEY;
      expect((await put({ brevoApiKey: BREVO_DB, password: PW })).status).toBe(500);
      expect(await rows()).toHaveLength(0);
    });

    it("optional testTo sends via the NEW config and reports a sanitized result", async () => {
      const ok = await j(await put({ brevoApiKey: BREVO_DB, testTo: "dest@example.com", password: PW }));
      expect(ok.body.test).toEqual({ ok: true, provider: "brevo" });
      expect(sentHeaders(fetchMock).headers["api-key"]).toBe(BREVO_DB);

      fetchMock.mockResolvedValueOnce(new Response(`{"message":"bad key ${BREVO_DB}"}`, { status: 401 }));
      const bad = await j(await put({ from: "a@acme.test", testTo: "dest@example.com", password: PW }));
      expect(bad.body.test.ok).toBe(false);
      expect(bad.text).not.toContain(BREVO_DB);
    });
  });

  // ─── test send ─────────────────────────────────────────────────────────────
  describe("POST test send", () => {
    it("sends and returns the provider; rejects a bad address", async () => {
      process.env.RESEND_API_KEY = RESEND_ENV;
      const r = await j(await sendTest({ to: "dest@example.com" }));
      expect(r.body).toEqual({ ok: true, provider: "resend" });
      expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).to).toBe("dest@example.com");
      expect((await sendTest({ to: "nope" })).status).toBe(400);
    });

    it("503 when nothing is configured", async () => {
      expect((await sendTest()).status).toBe(503);
    });

    it("errors are sanitized: no stored/env key, bearer token or raw upstream body", async () => {
      process.env.RESEND_API_KEY = RESEND_ENV;
      fetchMock.mockResolvedValueOnce(new Response(
        `{"error":"invalid ${RESEND_ENV} Bearer ${RESEND_ENV}","pad":"${"x".repeat(3000)}"}`, { status: 401 },
      ));
      const r = await j(await sendTest());
      expect(r.status).toBe(502);
      expect(r.body.ok).toBe(false);
      expect(r.text).not.toContain(RESEND_ENV);
      expect(r.text.length).toBeLessThan(500);

      // a DB secret that matches no known key shape is scrubbed by exact value
      await put({ resendApiKey: "opaque-key-VALUE-xyz", password: PW });
      fetchMock.mockResolvedValueOnce(new Response("denied for opaque-key-VALUE-xyz", { status: 403 }));
      const r2 = await j(await sendTest());
      expect(r2.text).not.toContain("opaque-key-VALUE-xyz");
    });

    it("5 per 10 minutes per admin; another admin is unaffected", async () => {
      process.env.RESEND_API_KEY = RESEND_ENV;
      for (let i = 0; i < 5; i++) expect((await sendTest()).status).toBe(200);
      const blocked = await sendTest();
      expect(blocked.status).toBe(429);
      expect(fetchMock).toHaveBeenCalledTimes(5);
      actAs(await mkUser("admin"));
      expect((await sendTest()).status).toBe(200);
    });
  });

  // ─── rate limit / revert / audit ───────────────────────────────────────────
  describe("limits, revert, audit", () => {
    it("PUT is limited to 10 per hour per admin (attempts count, incl. failed step-up)", async () => {
      for (let i = 0; i < 5; i++) expect((await put({ from: `a${i}@acme.test`, password: "wrong" })).status).toBe(401);
      for (let i = 0; i < 5; i++) expect((await put({ from: `b${i}@acme.test`, password: PW })).status).toBe(200);
      expect((await put({ from: "c@acme.test", password: PW })).status).toBe(429);
      expect((await revert()).status).toBe(429); // shared budget
    });

    it("revert restores the pre-save state (one step) and is consumed", async () => {
      process.env.BREVO_API_KEY = BREVO_ENV;
      await put({ brevoApiKey: "xkeysib-FIRSTKEY1", password: PW });
      await put({ brevoApiKey: BREVO_DB, provider: "brevo", password: PW });
      const r = await j(await revert());
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(["canRevert", "fields"]);
      expect(r.text).not.toContain("FIRSTKEY1");
      await sendTest();
      expect(sentHeaders(fetchMock).headers["api-key"]).toBe("xkeysib-FIRSTKEY1");
      expect((await rows()).map((x) => x.key)).toEqual(["email.brevoApiKey"]); // provider row gone again
      expect((await revert()).status).toBe(404);
    });

    it("revert after a first save returns to env-only; 404 with nothing to revert", async () => {
      expect((await revert()).status).toBe(404);
      process.env.BREVO_API_KEY = BREVO_ENV;
      await put({ brevoApiKey: BREVO_DB, password: PW });
      expect((await j(await getStatus())).body.canRevert).toBe(true);
      await revert();
      expect((await j(await getStatus())).body).toMatchObject({ canRevert: false, sources: { brevoApiKey: "env" } });
      expect(await rows()).toHaveLength(0);
    });

    it("writes an audit entry per save/revert with field names and sources, never values", async () => {
      process.env.BREVO_API_KEY = BREVO_ENV;
      await put({ brevoApiKey: BREVO_DB, from: "Acme <noreply@acme.test>", password: PW });
      await put({ brevoApiKey: null, password: PW });
      await revert();
      const audit = (await db.select().from(schema.adminAudit).where(eq(schema.adminAudit.adminUserId, admin.id)).orderBy(asc(schema.adminAudit.id))) as {
        action: string; beforeJson: string | null; afterJson: string | null;
      }[];
      expect(audit.map((a) => a.action)).toEqual(["email_settings_update", "email_settings_update", "email_settings_revert"]);
      const first = JSON.parse(audit[0].afterJson!);
      expect(first.changed.sort()).toEqual(["brevoApiKey", "from"]);
      expect(JSON.parse(audit[1].afterJson!).cleared).toEqual(["brevoApiKey"]);
      const dump = JSON.stringify(audit);
      for (const s of ALL_SECRETS) expect(dump).not.toContain(s);
      expect(dump).not.toContain("acme.test");
    });
  });
});
