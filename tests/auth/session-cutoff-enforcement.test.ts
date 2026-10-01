/**
 * Recovery B2 — session cutoff enforced inside verifySessionTokenDetailed
 * (so EVERY consumer is covered), fail-closed on DB error, 30s cache.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { decodeJwt } from "jose";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";

const getSessionNotBefore = vi.fn();
vi.mock("@/lib/auth/queries", () => ({
  getSessionNotBefore: (...a: unknown[]) => getSessionNotBefore(...a),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  },
}));
vi.mock("@/db/schema-pg", () => ({ revokedJtis: { jti: "jti" } }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@/lib/crypto/dek-cache", () => ({ getDEK: () => null, deleteDEK: () => {} }));

import {
  createSessionToken,
  verifySessionToken,
  verifySessionTokenDetailed,
  _clearRevokedJtiCache,
} from "@/lib/auth/jwt";
import { _clearSessionCutoffCache, bustSessionCutoff } from "@/lib/auth/session-cutoff";
import { AccountStrategy } from "@/lib/auth/strategies/account";

async function mint() {
  const { token } = await createSessionToken("u-cut", true);
  const iat = decodeJwt(token).iat as number;
  return { token, iat };
}

beforeEach(() => {
  getSessionNotBefore.mockReset();
  _clearSessionCutoffCache();
  _clearRevokedJtiCache();
});

describe("session cutoff boundary (iat vs floor(cutoff_s))", () => {
  it("iat < cutoff second -> rejected", async () => {
    const { token, iat } = await mint();
    getSessionNotBefore.mockResolvedValue(new Date((iat + 5) * 1000));
    const r = await verifySessionTokenDetailed(token);
    expect(r.payload).toBeNull();
    expect(r.reason).toBe("revoked");
  });

  it("iat == cutoff second (cutoff mid-second) -> rejected (same-second pre-reset token is dead)", async () => {
    const { token, iat } = await mint();
    getSessionNotBefore.mockResolvedValue(new Date(iat * 1000 + 999));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("iat == cutoff exactly on the second -> rejected", async () => {
    const { token, iat } = await mint();
    getSessionNotBefore.mockResolvedValue(new Date(iat * 1000));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("iat > cutoff second -> allowed", async () => {
    const { token, iat } = await mint();
    getSessionNotBefore.mockResolvedValue(new Date((iat - 1) * 1000 + 999));
    expect(await verifySessionToken(token)).not.toBeNull();
  });

  it("no cutoff -> allowed", async () => {
    const { token } = await mint();
    getSessionNotBefore.mockResolvedValue(null);
    expect(await verifySessionToken(token)).not.toBeNull();
  });
});

describe("fail closed", () => {
  it("DB error on cutoff lookup -> token invalid (not authenticated)", async () => {
    const { token } = await mint();
    getSessionNotBefore.mockRejectedValue(new Error("db down"));
    const r = await verifySessionTokenDetailed(token);
    expect(r.payload).toBeNull();
    expect(r.reason).toBe("invalid-token");
  });

  it("failure is not cached: next call after DB recovers succeeds", async () => {
    const { token } = await mint();
    getSessionNotBefore.mockRejectedValueOnce(new Error("blip"));
    expect(await verifySessionToken(token)).toBeNull();
    getSessionNotBefore.mockResolvedValue(null);
    expect(await verifySessionToken(token)).not.toBeNull();
  });

  it("account strategy returns the generic 401 on DB error", async () => {
    const { token } = await mint();
    getSessionNotBefore.mockRejectedValue(new Error("db down"));
    const req = new NextRequest("http://localhost:3000/api/accounts", {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await new AccountStrategy().authenticate(req);
    expect(res.authenticated).toBe(false);
    if (!res.authenticated) {
      expect(res.response.status).toBe(401);
      expect((await res.response.json()).error).toMatch(/Invalid or expired session/);
    }
  });

  it("account strategy 401s a token older than the cutoff", async () => {
    const { token, iat } = await mint();
    getSessionNotBefore.mockResolvedValue(new Date((iat + 1) * 1000));
    const req = new NextRequest("http://localhost:3000/api/accounts", {
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await new AccountStrategy().authenticate(req);
    expect(res.authenticated).toBe(false);
  });
});

describe("30s cache", () => {
  it("hits the DB once for repeated verifies, again after bustSessionCutoff", async () => {
    const { token } = await mint();
    getSessionNotBefore.mockResolvedValue(null);
    await verifySessionToken(token);
    await verifySessionToken(token);
    await verifySessionToken(token);
    expect(getSessionNotBefore).toHaveBeenCalledTimes(1);
    bustSessionCutoff("u-cut");
    await verifySessionToken(token);
    expect(getSessionNotBefore).toHaveBeenCalledTimes(2);
  });

  it("a bust makes a newly-set cutoff take effect immediately", async () => {
    const { token, iat } = await mint();
    getSessionNotBefore.mockResolvedValue(null);
    expect(await verifySessionToken(token)).not.toBeNull();
    getSessionNotBefore.mockResolvedValue(new Date((iat + 1) * 1000));
    expect(await verifySessionToken(token)).not.toBeNull(); // stale cache within TTL
    bustSessionCutoff("u-cut");
    expect(await verifySessionToken(token)).toBeNull();
  });
});
