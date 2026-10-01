/**
 * Recovery B4 — device/check, device/reset, code/reset routes.
 * Run against real Postgres (*_test DB). Skipped when DATABASE_URL doesn't name *_test.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";

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
import { createUser, enableUserMfa } from "@/lib/auth/queries";
import { createWrappedDEKForPassword } from "@/lib/crypto/envelope";
import { issueDevice } from "@/lib/auth/trusted-device";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { hashPassword } from "@/lib/auth";
import { generateRecoveryCodes, wrapDEKWithRecoveryCode, hashRecoveryCode } from "@/lib/auth/recovery-codes";
import { _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const NEW_PW = "Zq7!vLm3#Xt9wKd2";

async function mkUser(baseEmail?: string, enableMfa = false) {
  const pw = "Hr4$yBn8@Cp6sGe1";
  const { dek, wrapped } = createWrappedDEKForPassword(pw);
  // Ensure unique email by generating a UUID suffix
  const uniqueEmail = baseEmail ? baseEmail.replace("@", `+${crypto.randomUUID().slice(0, 12)}@`) : undefined;
  const u = await createUser({
    username: "fin" + crypto.randomUUID(),
    email: uniqueEmail,
    passwordHash: await hashPassword(pw),
    kekSalt: wrapped.salt.toString("base64"),
    dekWrapped: wrapped.wrapped.toString("base64"),
    dekWrappedIv: wrapped.iv.toString("base64"),
    dekWrappedTag: wrapped.tag.toString("base64"),
  } as Parameters<typeof createUser>[0]);

  if (enableMfa) {
    const { secret } = generateMfaSecret(uniqueEmail || "test@example.com");
    await enableUserMfa(u.id as string, secret, dek);
  }

  return { id: u.id as string, dek, email: uniqueEmail };
}

describe.skipIf(!HAS_DB)("recovery B4 routes (real Postgres)", () => {
  beforeAll(async () => {
    await bootstrapTestDb();
  }, 30_000);

  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
    _clearSessionCutoffCache();
    _clearRevokedJtiCache();
  });

  describe("POST /api/auth/recovery/device/check", () => {
    it("returns available:false if device cookie is absent", async () => {
      const { POST } = await import("@/app/api/auth/recovery/device/check/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/device/check", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data.available).toBe(false);
    });

    it("returns available:true and needs:totp if device is valid and user has TOTP", async () => {
      const { id, dek } = await mkUser("test@example.com", true);
      const device = await issueDevice(id, dek);
      if (!device) throw new Error("Device not issued");

      const { POST } = await import("@/app/api/auth/recovery/device/check/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/device/check", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { cookie: `pf_device=${device.cookieValue}` },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data.available).toBe(true);
      expect(data.needs).toBe("totp");
    });

    it("returns available:false, reason:setup_required if user has neither TOTP nor codes", async () => {
      const { id, dek } = await mkUser("test@example.com", false);
      const device = await issueDevice(id, dek);
      if (!device) throw new Error("Device not issued");

      const { POST } = await import("@/app/api/auth/recovery/device/check/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/device/check", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { cookie: `pf_device=${device.cookieValue}` },
      });
      const res = await POST(req);
      const data = await res.json();
      expect(data.available).toBe(false);
      expect(data.reason).toBe("setup_required");
    });
  });

  describe("POST /api/auth/recovery/device/reset", () => {
    it("returns 400 if device cookie is absent", async () => {
      const { POST } = await import("@/app/api/auth/recovery/device/reset/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/device/reset", {
        method: "POST",
        body: JSON.stringify({ newPassword: NEW_PW }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 401 proof-required if MFA user lacks proof", async () => {
      const { id, dek } = await mkUser("test@example.com", true);
      const device = await issueDevice(id, dek);
      if (!device) throw new Error("Device not issued");

      const { POST } = await import("@/app/api/auth/recovery/device/reset/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/device/reset", {
        method: "POST",
        body: JSON.stringify({ newPassword: NEW_PW }),
        headers: { cookie: `pf_device=${device.cookieValue}` },
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("proof-required");
    });

    it("returns 400 if TOTP proof is wrong", async () => {
      const { id, dek } = await mkUser("test@example.com", true);
      const device = await issueDevice(id, dek);
      if (!device) throw new Error("Device not issued");

      const { POST } = await import("@/app/api/auth/recovery/device/reset/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/device/reset", {
        method: "POST",
        body: JSON.stringify({
          newPassword: NEW_PW,
          proof: { type: "totp", value: "000000" },
        }),
        headers: { cookie: `pf_device=${device.cookieValue}` },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("succeeds with recovery code proof", async () => {
      const { id, dek } = await mkUser("test@example.com", false);
      const device = await issueDevice(id, dek);
      if (!device) throw new Error("Device not issued");

      // Generate recovery codes
      const codeDefs = generateRecoveryCodes(10);
      const firstCode = codeDefs[0];

      // Wrap and store
      for (const def of codeDefs) {
        const dekWrapped = wrapDEKWithRecoveryCode(dek, def.canonical);
        await db.insert(s.userRecoveryCodes).values({
          userId: id,
          codeHash: hashRecoveryCode(def.canonical),
          dekWrapped,
          usedAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      const { POST } = await import("@/app/api/auth/recovery/device/reset/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/device/reset", {
        method: "POST",
        body: JSON.stringify({
          newPassword: NEW_PW,
          proof: { type: "code", value: firstCode.display },
        }),
        headers: { cookie: `pf_device=${device.cookieValue}` },
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe("POST /api/auth/recovery/code/reset", () => {
    it("returns 400 if identifier is unknown", async () => {
      const { POST } = await import("@/app/api/auth/recovery/code/reset/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/code/reset", {
        method: "POST",
        body: JSON.stringify({
          identifier: `unknown-${crypto.randomUUID()}@example.com`,
          recoveryCode: "XXXXX-XXXXX-XXXXX-XXXXX",
          newPassword: NEW_PW,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Recovery failed. Check your details and try again.");
    });

    it("returns 400 if recovery code is invalid", async () => {
      const { email } = await mkUser("test@example.com");
      const { POST } = await import("@/app/api/auth/recovery/code/reset/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/code/reset", {
        method: "POST",
        body: JSON.stringify({
          identifier: email,
          recoveryCode: "XXXXX-XXXXX-XXXXX-XXXXX",
          newPassword: NEW_PW,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("succeeds with valid recovery code and sets pf_device cookie", async () => {
      const { id, dek, email } = await mkUser("test@example.com");

      // Generate recovery codes
      const codeDefs = generateRecoveryCodes(10);
      const firstCode = codeDefs[0];

      // Store codes
      for (const def of codeDefs) {
        const dekWrapped = wrapDEKWithRecoveryCode(dek, def.canonical);
        await db.insert(s.userRecoveryCodes).values({
          userId: id,
          codeHash: hashRecoveryCode(def.canonical),
          dekWrapped,
          usedAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      const { POST } = await import("@/app/api/auth/recovery/code/reset/route");
      const req = new NextRequest("http://localhost/api/auth/recovery/code/reset", {
        method: "POST",
        body: JSON.stringify({
          identifier: email,
          recoveryCode: firstCode.display,
          newPassword: NEW_PW,
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Check that pf_device cookie was set
      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toContain("pf_device");
    });

    it("burns code after single use", async () => {
      const { id, dek, email } = await mkUser("test@example.com");

      // Generate recovery codes
      const codeDefs = generateRecoveryCodes(10);
      const firstCode = codeDefs[0];

      // Store codes
      for (const def of codeDefs) {
        const dekWrapped = wrapDEKWithRecoveryCode(dek, def.canonical);
        await db.insert(s.userRecoveryCodes).values({
          userId: id,
          codeHash: hashRecoveryCode(def.canonical),
          dekWrapped,
          usedAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      // First use
      const { POST } = await import("@/app/api/auth/recovery/code/reset/route");
      const req1 = new NextRequest("http://localhost/api/auth/recovery/code/reset", {
        method: "POST",
        body: JSON.stringify({
          identifier: email,
          recoveryCode: firstCode.display,
          newPassword: NEW_PW,
        }),
      });
      const res1 = await POST(req1);
      expect(res1.status).toBe(200);

      // Second use with same code should fail
      const req2 = new NextRequest("http://localhost/api/auth/recovery/code/reset", {
        method: "POST",
        body: JSON.stringify({
          identifier: email,
          recoveryCode: firstCode.display,
          newPassword: "Another1234!@#",
        }),
      });
      const res2 = await POST(req2);
      expect(res2.status).toBe(400);
    });
  });
});
