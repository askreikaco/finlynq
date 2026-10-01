import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import * as pgSchema from "@/db/schema-pg";
import { eq, and, isNull } from "drizzle-orm";
import {
  createUser,
  wipeUserDataAndRewrap,
  replaceRecoveryCodes,
} from "@/lib/auth/queries";
import { generateRecoveryCodes, hashRecoveryCode } from "@/lib/auth/recovery-codes";
import crypto from "crypto";

describe("Wipe recovery wraps (B1)", () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user
    testUserId = crypto.randomUUID();
    const kekSalt = crypto.randomBytes(16).toString("base64");
    const dek = crypto.randomBytes(32);
    const kek = Buffer.from("test-key-256bit-0123456789abcde"); // 32 bytes for AES-256
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", kek, iv);
    const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();

    const dekWrapped = Buffer.concat([iv, ct, tag]).toString("base64");
    const dekWrappedIv = iv.toString("base64");
    const dekWrappedTag = tag.toString("base64");

    await createUser({
      username: `test-wipe-${crypto.randomUUID()}`,
      email: `test-wipe-${crypto.randomUUID()}@example.com`,
      passwordHash: "test-hash",
      kekSalt,
      dekWrapped,
      dekWrappedIv,
      dekWrappedTag,
    });
  });

  it("deletes user_devices on wipe", async () => {
    // Insert a device
    const deviceId = crypto.randomUUID();
    const deviceSecret = crypto.randomUUID();
    const secretHash = crypto.createHash("sha256").update(deviceSecret).digest("hex");

    await db.insert(pgSchema.userDevices).values({
      id: deviceId,
      userId: testUserId,
      secretHash,
      dekWrapped: "test-wrapped",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Verify device exists
    let devices = await db
      .select()
      .from(pgSchema.userDevices)
      .where(and(eq(pgSchema.userDevices.userId, testUserId), isNull(pgSchema.userDevices.revokedAt)));
    expect(devices.length).toBe(1);

    // Wipe user
    const newPasswordHash = crypto.randomBytes(32).toString("hex");
    const kekSalt = crypto.randomBytes(16).toString("base64");
    const dekWrapped = crypto.randomBytes(48).toString("base64");
    const dekWrappedIv = crypto.randomBytes(12).toString("base64");
    const dekWrappedTag = crypto.randomBytes(16).toString("base64");

    await wipeUserDataAndRewrap(testUserId, newPasswordHash, {
      kekSalt,
      dekWrapped,
      dekWrappedIv,
      dekWrappedTag,
    });

    // Verify device is deleted
    devices = await db
      .select()
      .from(pgSchema.userDevices)
      .where(eq(pgSchema.userDevices.userId, testUserId));
    expect(devices.length).toBe(0);
  });

  it("NULLs dek_wrapped_prf on passkeys on wipe", async () => {
    // Insert a passkey
    const passkeyId = crypto.randomUUID();
    await db.insert(pgSchema.userPasskeys).values({
      id: passkeyId,
      userId: testUserId,
      publicKey: "test-public-key",
      dekWrappedPrf: "test-wrapped-prf",
      createdAt: new Date().toISOString(),
    });

    // Verify passkey has wrapped PRF
    let passkeys = await db
      .select()
      .from(pgSchema.userPasskeys)
      .where(eq(pgSchema.userPasskeys.userId, testUserId));
    expect(passkeys.some((p) => p.dekWrappedPrf !== null)).toBe(true);

    // Wipe user
    const newPasswordHash = crypto.randomBytes(32).toString("hex");
    const kekSalt = crypto.randomBytes(16).toString("base64");
    const dekWrapped = crypto.randomBytes(48).toString("base64");
    const dekWrappedIv = crypto.randomBytes(12).toString("base64");
    const dekWrappedTag = crypto.randomBytes(16).toString("base64");

    await wipeUserDataAndRewrap(testUserId, newPasswordHash, {
      kekSalt,
      dekWrapped,
      dekWrappedIv,
      dekWrappedTag,
    });

    // Verify PRF wrap is NULLed
    passkeys = await db
      .select()
      .from(pgSchema.userPasskeys)
      .where(eq(pgSchema.userPasskeys.userId, testUserId));
    expect(passkeys.every((p) => p.dekWrappedPrf === null)).toBe(true);
  });

  it("NULLs dek_wrapped on unused recovery codes on wipe", async () => {
    const codes = generateRecoveryCodes(2);
    const codeHashes = codes.map((c) => hashRecoveryCode(c.canonical));
    const dekWrappeds = codes.map(() => "test-wrapped-dek");

    // Insert recovery codes
    await replaceRecoveryCodes(
      testUserId,
      codeHashes.map((hash, i) => ({
        hash,
        dekWrapped: dekWrappeds[i],
      }))
    );

    // Verify codes are present with dek_wrapped
    const codes_before = await db
      .select()
      .from(pgSchema.userRecoveryCodes)
      .where(and(eq(pgSchema.userRecoveryCodes.userId, testUserId), isNull(pgSchema.userRecoveryCodes.usedAt)));
    expect(codes_before.length).toBe(2);
    expect(codes_before.every((c) => c.dekWrapped !== null)).toBe(true);

    // Wipe user
    const newPasswordHash = crypto.randomBytes(32).toString("hex");
    const kekSalt = crypto.randomBytes(16).toString("base64");
    const dekWrapped = crypto.randomBytes(48).toString("base64");
    const dekWrappedIv = crypto.randomBytes(12).toString("base64");
    const dekWrappedTag = crypto.randomBytes(16).toString("base64");

    await wipeUserDataAndRewrap(testUserId, newPasswordHash, {
      kekSalt,
      dekWrapped,
      dekWrappedIv,
      dekWrappedTag,
    });

    // Verify dek_wrapped is NULLed for unused codes
    const codes_after = await db
      .select()
      .from(pgSchema.userRecoveryCodes)
      .where(and(eq(pgSchema.userRecoveryCodes.userId, testUserId), isNull(pgSchema.userRecoveryCodes.usedAt)));
    expect(codes_after.length).toBe(2);
    expect(codes_after.every((c) => c.dekWrapped === null)).toBe(true);
  });
});
