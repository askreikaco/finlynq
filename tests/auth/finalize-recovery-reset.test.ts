/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recovery B2 — finalizeRecoveryReset against REAL Postgres (*_test DB).
 * Skipped when DATABASE_URL does not name a *_test database.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";

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
import { createUser, getUserById, getSessionNotBefore } from "@/lib/auth/queries";
import { createWrappedDEKForPassword, deriveKEK, unwrapDEK, encryptField, decryptField } from "@/lib/crypto/envelope";
import { finalizeRecoveryReset } from "@/lib/auth/recovery";
import { issueDevice, redeemDevice } from "@/lib/auth/trusted-device";
import { createSessionToken, verifySessionToken, _clearRevokedJtiCache } from "@/lib/auth/jwt";
import { _clearSessionCutoffCache } from "@/lib/auth/session-cutoff";
import { putDEK, getDEK } from "@/lib/crypto/dek-cache";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { decodeJwt, SignJWT } from "jose";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const OLD_PW = "Hr4$yBn8@Cp6sGe1";
const NEW_PW = "Zq7!vLm3#Xt9wKd2";

async function mkUser(email?: string) {
  const { dek, wrapped } = createWrappedDEKForPassword(OLD_PW);
  const u = await createUser({
    username: "fin" + crypto.randomUUID(),
    email,
    passwordHash: await hashPassword(OLD_PW),
    kekSalt: wrapped.salt.toString("base64"),
    dekWrapped: wrapped.wrapped.toString("base64"),
    dekWrappedIv: wrapped.iv.toString("base64"),
    dekWrappedTag: wrapped.tag.toString("base64"),
  } as any);
  return { id: u.id as string, dek };
}

const devRow = async (id: string) => (await db.select().from(s.userDevices).where(eq(s.userDevices.id, id)))[0];

describe.skipIf(!HAS_DB)("finalizeRecoveryReset (real Postgres)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);
  beforeEach(() => { sendEmailMock.mockReset(); sendEmailMock.mockResolvedValue(undefined); _clearSessionCutoffCache(); _clearRevokedJtiCache(); });

  it("keeps the DEK: new password unwraps to the SAME bytes and existing ciphertext still decrypts; old password no longer works", async () => {
    const { id, dek } = await mkUser();
    const ct = encryptField(dek, "secret payee")!;
    await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek, method: "code" });
    const u = (await getUserById(id))!;
    const salt = Buffer.from(u.kekSalt!, "base64");
    const w = { salt, wrapped: Buffer.from(u.dekWrapped!, "base64"), iv: Buffer.from(u.dekWrappedIv!, "base64"), tag: Buffer.from(u.dekWrappedTag!, "base64") };
    const dek2 = unwrapDEK(deriveKEK(NEW_PW, salt, u.pepperVersion ?? 1), w);
    expect(dek2.equals(dek)).toBe(true);
    expect(decryptField(dek2, ct)).toBe("secret payee");
    expect(() => unwrapDEK(deriveKEK(OLD_PW, salt, u.pepperVersion ?? 1), w)).toThrow();
    expect(await verifyPassword(NEW_PW, u.passwordHash)).toBe(true);
    expect(await verifyPassword(OLD_PW, u.passwordHash)).toBe(false);
  }, 30_000);

  it("is not corrupted when the caller's DEK buffer is the one in the cache (eviction zeroes it)", async () => {
    const { id, dek } = await mkUser();
    const cached = Buffer.from(dek);
    putDEK("old-jti-aliased", cached, 60_000, id);
    const r = await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek: cached });
    expect(getDEK(r.sessionId, id)!.equals(dek)).toBe(true);
    expect(getDEK("old-jti-aliased", id)).toBeNull();
  }, 30_000);

  it("sets the cutoff; old session (and its DEK) rejected, fresh session survives with natural iat/exp", async () => {
    const { id, dek } = await mkUser();
    const old = await createSessionToken(id, true);
    putDEK(old.jti, Buffer.from(dek), 60_000, id);
    expect(await verifySessionToken(old.token)).not.toBeNull();
    const before = Date.now();
    const r = await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek });
    const cutoff = (await getSessionNotBefore(id))!;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now());

    expect(await verifySessionToken(old.token)).toBeNull();
    expect(getDEK(old.jti, id)).toBeNull();

    const fresh = await verifySessionToken(r.token);
    expect(fresh).not.toBeNull();
    expect(fresh!.sub).toBe(id);
    expect(fresh!.mfa).toBe(true);
    const claims = decodeJwt(r.token);
    const nowS = Math.floor(Date.now() / 1000);
    expect(claims.iat!).toBeLessThanOrEqual(nowS);                       // never a future iat
    expect(claims.iat!).toBeGreaterThan(Math.floor(cutoff.getTime() / 1000)); // strictly after cutoff
    expect(claims.exp! - claims.iat!).toBe(24 * 3600);                    // exp from real iat
    expect(getDEK(r.sessionId, id)!.equals(dek)).toBe(true);
  }, 30_000);

  it("a token minted in the SAME second as the cutoff is rejected (attacker race), the replacement session is not", async () => {
    const { id, dek } = await mkUser();
    const r = await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek });
    const cutoffS = Math.floor((await getSessionNotBefore(id))!.getTime() / 1000);
    const forge = (iat: number) =>
      new SignJWT({ mfa: true, gen: "0" })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(id).setJti(crypto.randomUUID()).setIssuer("pf-auth").setAudience("pf-app")
        .setIssuedAt(iat).setExpirationTime(iat + 3600)
        .sign(new TextEncoder().encode(process.env.PF_JWT_SECRET!));
    expect(await verifySessionToken(await forge(cutoffS))).toBeNull();      // same second: dead
    expect(await verifySessionToken(await forge(cutoffS - 5))).toBeNull();  // older: dead
    expect(await verifySessionToken(await forge(cutoffS + 1))).not.toBeNull();
    expect(await verifySessionToken(r.token)).not.toBeNull();
  }, 30_000);

  it("revokes all devices except the kept one; kept device is rotated (old cookie dead, new cookie works)", async () => {
    const { id, dek } = await mkUser();
    const other = await mkUser();
    const keep = (await issueDevice(id, dek, "Chrome"))!;
    const d2 = (await issueDevice(id, dek, "Safari"))!;
    const d3 = (await issueDevice(id, dek, "Firefox"))!;
    const foreign = (await issueDevice(other.id, other.dek, "Chrome"))!;

    const r = await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek, keepDeviceId: keep.id, method: "device" });

    expect((await devRow(d2.id)).revokedAt).not.toBeNull();
    expect((await devRow(d3.id)).revokedAt).not.toBeNull();
    expect((await devRow(foreign.id)).revokedAt).toBeNull();           // other tenant untouched
    expect(r.deviceId).toBeTruthy();
    expect(r.deviceId).not.toBe(keep.id);
    expect(r.deviceCookieValue).toBeTruthy();
    expect(r.deviceCookieValue).not.toBe(keep.cookieValue);
    expect((await devRow(r.deviceId!)).revokedAt).toBeNull();
    // exactly one live device for the user
    const live = (await db.select().from(s.userDevices).where(eq(s.userDevices.userId, id))).filter((d) => !d.revokedAt);
    expect(live.map((d) => d.id)).toEqual([r.deviceId]);
    // old kept cookie no longer redeems; new one does and yields the same DEK
    expect(await redeemDevice(keep.cookieValue, id)).toBeNull();
    const redeemed = await redeemDevice(r.deviceCookieValue!, id);
    expect(redeemed!.dek.equals(dek)).toBe(true);
  }, 30_000);

  it("with trustDevice:false the kept device is the ONLY survivor (exclusion filter honoured)", async () => {
    const { id, dek } = await mkUser();
    const keep = (await issueDevice(id, dek))!;
    const d2 = (await issueDevice(id, dek))!;
    await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek, keepDeviceId: keep.id, trustDevice: false });
    expect((await devRow(keep.id)).revokedAt).toBeNull();
    expect((await devRow(d2.id)).revokedAt).not.toBeNull();
  }, 30_000);

  it("without keepDeviceId every old device is revoked; trustDevice:false issues no new device", async () => {
    const { id, dek } = await mkUser();
    const d1 = (await issueDevice(id, dek))!;
    const r = await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek, trustDevice: false });
    expect((await devRow(d1.id)).revokedAt).not.toBeNull();
    expect(r.deviceCookieValue).toBeUndefined();
    const live = (await db.select().from(s.userDevices).where(eq(s.userDevices.userId, id))).filter((d) => !d.revokedAt);
    expect(live).toHaveLength(0);
  }, 30_000);

  it("burns outstanding email-reset tokens", async () => {
    const { id, dek } = await mkUser();
    const th = crypto.randomUUID();
    await db.insert(s.passwordResetTokens).values({ userId: id, tokenHash: th, expiresAt: new Date(Date.now() + 3600_000).toISOString(), createdAt: new Date().toISOString() } as any);
    await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek });
    const row = (await db.select().from(s.passwordResetTokens).where(eq(s.passwordResetTokens.tokenHash, th)))[0];
    expect(row.usedAt).not.toBeNull();
  }, 30_000);

  it("logs a recovery_reset_success security event with method/ip", async () => {
    const { id, dek } = await mkUser();
    await finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek, method: "passkey", ip: "203.0.113.9", userAgent: "UA" });
    await vi.waitFor(async () => {
      const rows = await db.select().from(s.userSecurityEvents).where(and(eq(s.userSecurityEvents.userId, id), eq(s.userSecurityEvents.event, "recovery_reset_success")));
      expect(rows).toHaveLength(1);
      expect(rows[0].method).toBe("passkey");
      expect(rows[0].ip).toBe("203.0.113.9");
    });
  }, 30_000);

  it("emails only when users.email is set; a send failure does not fail recovery", async () => {
    const noMail = await mkUser();
    await finalizeRecoveryReset({ userId: noMail.id, newPassword: NEW_PW, dek: noMail.dek });
    await new Promise((r) => setTimeout(r, 50));
    expect(sendEmailMock).not.toHaveBeenCalled();

    const withMail = await mkUser(`u${crypto.randomUUID()}@example.com`);
    await finalizeRecoveryReset({ userId: withMail.id, newPassword: NEW_PW, dek: withMail.dek });
    await vi.waitFor(() => expect(sendEmailMock).toHaveBeenCalledTimes(1));
    expect(sendEmailMock.mock.calls[0][0].to).toMatch(/@example\.com$/);

    sendEmailMock.mockRejectedValue(new Error("smtp down"));
    const failing = await mkUser(`u${crypto.randomUUID()}@example.com`);
    const r = await finalizeRecoveryReset({ userId: failing.id, newPassword: NEW_PW, dek: failing.dek });
    expect(r.token).toBeTruthy();
    sendEmailMock.mockImplementation(() => { throw new Error("sync throw"); });
    const failing2 = await mkUser(`u${crypto.randomUUID()}@example.com`);
    await expect(finalizeRecoveryReset({ userId: failing2.id, newPassword: NEW_PW, dek: failing2.dek })).resolves.toBeTruthy();
  }, 60_000);

  it("weak password / bad DEK / unknown user throw BEFORE any change (no cutoff, password untouched)", async () => {
    const { id, dek } = await mkUser();
    const before = (await getUserById(id))!;
    await expect(finalizeRecoveryReset({ userId: id, newPassword: "short", dek })).rejects.toThrow();
    await expect(finalizeRecoveryReset({ userId: id, newPassword: NEW_PW, dek: Buffer.alloc(16) })).rejects.toThrow();
    await expect(finalizeRecoveryReset({ userId: crypto.randomUUID(), newPassword: NEW_PW, dek })).rejects.toThrow();
    const after = (await getUserById(id))!;
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.dekWrapped).toBe(before.dekWrapped);
    expect(await getSessionNotBefore(id)).toBeNull();
  }, 30_000);
});
