/** B5 review: RP config fails closed (never derived from request data). */
import { describe, it, expect, afterEach } from "vitest";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";

const KEYS = ["APP_URL", "NODE_ENV", "PF_WEBAUTHN_RP_ID", "PF_WEBAUTHN_ORIGINS"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = saved[k];
  }
});
const env = process.env as Record<string, string | undefined>;

describe("getRpConfig fail-closed", () => {
  it("production without APP_URL throws (no localhost fallback)", async () => {
    const { getRpConfig } = await import("@/lib/auth/webauthn");
    delete env.APP_URL;
    env.NODE_ENV = "production";
    expect(() => getRpConfig()).toThrow(/APP_URL/);
  });

  it("an rpID override that does not cover APP_URL's host throws", async () => {
    const { getRpConfig } = await import("@/lib/auth/webauthn");
    env.APP_URL = "https://money.example.test";
    env.PF_WEBAUTHN_RP_ID = "evil.test";
    expect(() => getRpConfig()).toThrow(/outside rpID/);
    env.PF_WEBAUTHN_RP_ID = "example.test";
    expect(getRpConfig()).toEqual({ rpID: "example.test", origins: ["https://money.example.test"] });
  });

  it("origin with embedded credentials or a lookalike suffix host is refused", async () => {
    const { getRpConfig } = await import("@/lib/auth/webauthn");
    env.APP_URL = "https://money.example.test";
    env.PF_WEBAUTHN_ORIGINS = "https://user:pw@money.example.test";
    expect(() => getRpConfig()).toThrow();
    env.PF_WEBAUTHN_ORIGINS = "https://evilmoney.example.test.attacker.io";
    expect(() => getRpConfig()).toThrow();
    env.PF_WEBAUTHN_RP_ID = "money.example.test";
    env.PF_WEBAUTHN_ORIGINS = "https://notmoney.example.test";
    expect(() => getRpConfig()).toThrow();
  });
});
