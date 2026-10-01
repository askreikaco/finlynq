/**
 * Regression: promoting a pending-MFA DEK onto the new session must not zero it.
 * (putDEK(newJti, pendingDek) + deleteDEK(pendingJti) shared one Buffer; the
 * session and the trusted-device wrap ended up with an all-zero key.)
 * Real routes, real Postgres, real cache.
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { TOTP } from "otpauth";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.DEPLOY_GENERATION = "0";
process.env.PF_TRUSTED_DEVICE_DAYS = "30";
process.env.PF_PEPPER = process.env.PF_PEPPER || "test-pepper-at-least-32-chars-long-ok-yes";

import { bootstrapTestDb } from "../helpers/portfolio-fixtures";
import { db, schema as s } from "@/db";
import { createUser, enableUserMfa } from "@/lib/auth/queries";
import { createWrappedDEKForPassword } from "@/lib/crypto/envelope";
import { hashPassword } from "@/lib/auth";
import { createSessionToken, verifySessionToken } from "@/lib/auth/jwt";
import { putDEK, getDEK, deleteDEK } from "@/lib/crypto/dek-cache";
import { generateMfaSecret } from "@/lib/auth/mfa";
import { redeemDevice } from "@/lib/auth/trusted-device";
import { generateRecoveryCodes, hashRecoveryCode, wrapDEKWithRecoveryCode } from "@/lib/auth/recovery-codes";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
let n = 0;
const ip = () => `10.77.${(n >> 8) & 255}.${(n++ % 250) + 1}`;

async function mk() {
  const { dek, wrapped } = createWrappedDEKForPassword("Hr4$yBn8@Cp6sGe1");
  const email = `d${crypto.randomUUID().slice(0, 10)}@example.com`;
  const u = await createUser({
    username: "fin" + crypto.randomUUID(), email, passwordHash: await hashPassword("Hr4$yBn8@Cp6sGe1"),
    kekSalt: wrapped.salt.toString("base64"), dekWrapped: wrapped.wrapped.toString("base64"),
    dekWrappedIv: wrapped.iv.toString("base64"), dekWrappedTag: wrapped.tag.toString("base64"),
  } as Parameters<typeof createUser>[0]);
  return { id: u.id as string, dek, email };
}
async function pending(id: string, dek: Buffer) {
  const { token, jti } = await createSessionToken(id, false, { pending: true, expirationTime: "5m" });
  putDEK(jti, Buffer.from(dek), 5 * 60_000, id);
  return { token, jti };
}
const post = (p: string, body: unknown) =>
  new NextRequest(`http://localhost:3000${p}`, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": ip() }, body: JSON.stringify(body) });

async function expectRealDek(res: Response & { cookies: any }, uid: string, dek: Buffer) {
  expect(res.status).toBe(200);
  const payload = await verifySessionToken(res.cookies.get("pf_session").value);
  const cached = getDEK(payload!.jti as string, uid);
  expect(cached && cached.equals(dek)).toBe(true);
  expect(cached!.equals(Buffer.alloc(32))).toBe(false);
  const redeemed = await redeemDevice(res.cookies.get("pf_device").value, uid);
  expect(redeemed?.dek.equals(dek)).toBe(true);
}

describe.skipIf(!HAS_DB)("DEK promotion keeps the real key (real routes)", () => {
  beforeAll(async () => { await bootstrapTestDb(); }, 30_000);

  it("TOTP 2FA login: session DEK and pf_device wrap are the real DEK", async () => {
    const u = await mk();
    const { secret } = generateMfaSecret(u.email);
    await enableUserMfa(u.id, secret, u.dek);
    const p = await pending(u.id, u.dek);
    const code = new TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret }).generate();
    const { POST } = await import("@/app/api/auth/mfa/verify/route");
    await expectRealDek((await POST(post("/api/auth/mfa/verify", { mfaPendingToken: p.token, code }))) as never, u.id, u.dek);
  });

  it("recovery-code 2FA login: session DEK and pf_device wrap are the real DEK", async () => {
    const u = await mk();
    const [c] = generateRecoveryCodes(1);
    await db.insert(s.userRecoveryCodes).values({
      userId: u.id, codeHash: hashRecoveryCode(c.canonical),
      dekWrapped: wrapDEKWithRecoveryCode(u.dek, c.canonical), usedAt: null, createdAt: new Date().toISOString(),
    });
    const p = await pending(u.id, u.dek);
    const { POST } = await import("@/app/api/auth/mfa/recovery/verify/route");
    await expectRealDek((await POST(post("/api/auth/mfa/recovery/verify", { mfaPendingToken: p.token, code: c.display }))) as never, u.id, u.dek);
  });

  it("dek-cache backstop: a buffer shared by two entries is not zeroed when one is deleted; unshared still is", () => {
    const shared = Buffer.alloc(32, 7);
    putDEK("a", shared, 60_000, "u"); putDEK("b", shared, 60_000, "u");
    deleteDEK("a");
    expect(getDEK("b", "u")!.equals(Buffer.alloc(32, 7))).toBe(true);
    deleteDEK("b");
    expect(shared.equals(Buffer.alloc(32))).toBe(true);
    const solo = Buffer.alloc(32, 9);
    putDEK("c", solo, 60_000, "u"); putDEK("c", solo, 60_000, "u"); // re-put same buffer: not zeroed
    expect(solo.equals(Buffer.alloc(32, 9))).toBe(true);
  });
});
