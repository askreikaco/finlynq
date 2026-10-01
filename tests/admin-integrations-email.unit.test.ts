/**
 * Admin > Integrations > Email — no-DB tests: envelope, config resolution,
 * error sanitising, route/nav/migration structure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

const overrides = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock("@/lib/system-settings", () => ({
  loadEmailOverrides: async () => overrides.current,
}));

import {
  encryptSystemSetting,
  decryptSystemSetting,
} from "@/lib/crypto/system-settings-envelope";
import { activeEmailProvider, resolveEmailConfig, sendEmail } from "@/lib/email";
import { sanitizeEmailError } from "@/lib/admin/email-integration";
import { navGroups } from "@/components/nav";

const ROOT = path.resolve(__dirname, "..");
const KEY = "unit-test-staging-key-0123456789abcdef";
const ENV_KEYS = [
  "PF_STAGING_KEY", "RESEND_API_KEY", "BREVO_API_KEY", "SMTP_HOST", "SMTP_PORT",
  "SMTP_USER", "SMTP_PASS", "EMAIL_FROM",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.PF_STAGING_KEY = KEY;
  overrides.current = {};
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("system-settings envelope", () => {
  it("ciphertext differs from plaintext and round-trips", () => {
    const ct = encryptSystemSetting("email.brevoApiKey", "xkeysib-SECRET123");
    expect(ct).not.toContain("xkeysib-SECRET123");
    expect(ct.startsWith("ss1:")).toBe(true);
    expect(Buffer.from(ct.slice(4), "base64").toString("utf8")).not.toContain("SECRET123");
    expect(decryptSystemSetting("email.brevoApiKey", ct)).toBe("xkeysib-SECRET123");
  });

  it("uses a fresh IV per encryption", () => {
    expect(encryptSystemSetting("k", "v")).not.toBe(encryptSystemSetting("k", "v"));
  });

  it("is bound to the setting name (row swap fails)", () => {
    const ct = encryptSystemSetting("email.brevoApiKey", "v");
    expect(() => decryptSystemSetting("email.resendApiKey", ct)).toThrow();
  });

  it("fails on tamper, wrong server key, missing marker", () => {
    const ct = encryptSystemSetting("k", "value");
    const buf = Buffer.from(ct.slice(4), "base64");
    buf[buf.length - 1] ^= 1;
    expect(() => decryptSystemSetting("k", "ss1:" + buf.toString("base64"))).toThrow();
    process.env.PF_STAGING_KEY = "a-different-staging-key-0123456789abcdef";
    expect(() => decryptSystemSetting("k", ct)).toThrow();
    expect(() => decryptSystemSetting("k", "plaintext-value")).toThrow();
  });

  it("never stores plaintext without a server key", () => {
    delete process.env.PF_STAGING_KEY;
    expect(() => encryptSystemSetting("k", "v")).toThrow(/PF_STAGING_KEY/);
    process.env.PF_STAGING_KEY = "too-short";
    expect(() => encryptSystemSetting("k", "v")).toThrow(/PF_STAGING_KEY/);
  });

  it("derives a domain-separated key (not the raw/sha256 staging key)", () => {
    // Decrypt with the staging-envelope style key must fail: forge a blob using sha256(secret).
    const k = createHash("sha256").update(KEY, "utf8").digest();
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", k, iv);
    c.setAAD(Buffer.from("k"));
    const ct = Buffer.concat([c.update("v", "utf8"), c.final()]);
    const blob = "ss1:" + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
    expect(() => decryptSystemSetting("k", blob)).toThrow();
  });
});

describe("email config resolution", () => {
  it("empty table = env-only (today's behaviour)", async () => {
    process.env.BREVO_API_KEY = "xkeysib-ENV";
    process.env.EMAIL_FROM = "Acme <a@acme.test>";
    const cfg = await resolveEmailConfig();
    expect(cfg.brevoApiKey).toEqual({ value: "xkeysib-ENV", source: "env" });
    expect(cfg.from).toEqual({ value: "Acme <a@acme.test>", source: "env" });
    expect(cfg.resendApiKey).toEqual({ value: undefined, source: "none" });
    expect(activeEmailProvider(cfg)).toBe("brevo");
  });

  it("DB value overrides env", async () => {
    process.env.BREVO_API_KEY = "xkeysib-ENV";
    overrides.current = { brevoApiKey: "xkeysib-DB" };
    const cfg = await resolveEmailConfig();
    expect(cfg.brevoApiKey).toEqual({ value: "xkeysib-DB", source: "db" });
  });

  it("clearing the DB value falls back to env", async () => {
    process.env.BREVO_API_KEY = "xkeysib-ENV";
    overrides.current = { brevoApiKey: "xkeysib-DB" };
    expect((await resolveEmailConfig()).brevoApiKey.source).toBe("db");
    overrides.current = {};
    expect(await resolveEmailConfig()).toMatchObject({ brevoApiKey: { value: "xkeysib-ENV", source: "env" } });
  });

  it("empty env strings count as unset", async () => {
    process.env.RESEND_API_KEY = "";
    expect((await resolveEmailConfig()).resendApiKey.source).toBe("none");
  });

  it("provider precedence: auto = resend > brevo > smtp; explicit wins; explicit-unconfigured = none", async () => {
    const p = async () => activeEmailProvider(await resolveEmailConfig());
    expect(await p()).toBe("none");
    process.env.SMTP_HOST = "smtp.test";
    expect(await p()).toBe("smtp");
    process.env.BREVO_API_KEY = "b";
    expect(await p()).toBe("brevo");
    process.env.RESEND_API_KEY = "r";
    expect(await p()).toBe("resend");
    overrides.current = { provider: "brevo" };
    expect(await p()).toBe("brevo");
    overrides.current = { provider: "smtp" };
    expect(await p()).toBe("smtp");
    overrides.current = { provider: "auto" };
    expect(await p()).toBe("resend");
    delete process.env.SMTP_HOST;
    overrides.current = { provider: "smtp" };
    expect(await p()).toBe("none");
  });

  it("sendEmail uses the DB key, not the env key, and throws for an unconfigured explicit provider", async () => {
    process.env.BREVO_API_KEY = "xkeysib-ENV";
    overrides.current = { brevoApiKey: "xkeysib-DB" };
    const fetchMock = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p>x</p>" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-DB");

    overrides.current = { provider: "resend" };
    await expect(sendEmail({ to: "a@b.co", subject: "s", html: "x" })).rejects.toThrow(/selected but not configured/);
  });
});

describe("sanitizeEmailError", () => {
  const cfg = (v: Partial<Record<string, string>>) =>
    Object.fromEntries(
      ["provider", "from", "brevoApiKey", "resendApiKey", "smtpHost", "smtpPort", "smtpUser", "smtpPass"].map((f) => [
        f, { value: v[f], source: v[f] ? "db" : "none" },
      ]),
    ) as never;

  it("removes configured secrets (exact), key shapes and bearer tokens", () => {
    const out = sanitizeEmailError(
      "401 key=xkeysib-SECRET123 re_abc123 Bearer tok.en-1 password=hunter2 custom-secret-VALUE",
      cfg({ smtpPass: "custom-secret-VALUE" }),
    );
    for (const s of ["xkeysib-SECRET123", "re_abc123", "tok.en-1", "hunter2", "custom-secret-VALUE"]) {
      expect(out).not.toContain(s);
    }
  });

  it("truncates long upstream bodies", () => {
    expect(sanitizeEmailError("x".repeat(5000), cfg({})).length).toBeLessThan(250);
  });
});

describe("routes and structure", () => {
  it("/admin/email and /api/admin/email do not exist (no redirect either)", () => {
    expect(existsSync(path.join(ROOT, "src/app/(app)/admin/email"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/app/api/admin/email"))).toBe(false);
    for (const f of ["next.config.ts", "next.config.js", "next.config.mjs", "src/middleware.ts", "src/proxy.ts"]) {
      const p = path.join(ROOT, f);
      if (existsSync(p)) expect(readFileSync(p, "utf8")).not.toMatch(/["'`]\/admin\/email["'`]/);
    }
    expect(existsSync(path.join(ROOT, "src/app/(app)/admin/(env)/integrations/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "src/app/api/admin/integrations/email/route.ts"))).toBe(true);
  });

  it("nav has the Environment link covering /admin/integrations", () => {
    const src = readFileSync(path.join(ROOT, "src/components/nav.tsx"), "utf8");
    expect(src).toMatch(/href: "\/admin\/env", label: "Environment"/);
    expect(src).toMatch(/\/admin\/integrations/);
    expect(src).toMatch(/activePrefixes/);
    expect(src).not.toMatch(/href: "\/admin\/email"/);
    expect(navGroups).toBeTruthy();
  });

  it("migration is named per spec, additive + idempotent, mirrored in schema-pg, not in the baseline", () => {
    const dir = path.join(ROOT, "scripts/migrations");
    const files = readdirSync(dir);
    expect(files).toContain("20261004_reika_system_settings.sql");
    expect(files).not.toContain("20261001_system_settings.sql");
    const sql = readFileSync(path.join(dir, "20261004_reika_system_settings.sql"), "utf8");
    const code = sql.replace(/--.*$/gm, "");
    expect(code).toMatch(/CREATE TABLE IF NOT EXISTS system_settings/);
    expect(code).not.toMatch(/\b(DROP|DELETE|TRUNCATE|ALTER\s+TABLE\s+\w+\s+DROP)\b/i);
    for (const col of ["key        TEXT PRIMARY KEY", "value_ct   TEXT NOT NULL", "updated_by TEXT", "updated_at TIMESTAMPTZ"]) {
      expect(code).toContain(col);
    }
    const schema = readFileSync(path.join(ROOT, "src/db/schema-pg.ts"), "utf8");
    expect(schema).toMatch(/pgTable\("system_settings"/);
    const block = schema.slice(schema.indexOf('pgTable("system_settings"'));
    for (const c of ['text("key").primaryKey()', 'text("value_ct").notNull()', 'text("updated_by")', 'timestamp("updated_at"']) {
      expect(block).toContain(c);
    }
    const baseline = readFileSync(path.join(ROOT, "scripts/baseline/0001_schema_baseline.sql"), "utf8");
    expect(baseline).not.toContain("system_settings");
  });
});
