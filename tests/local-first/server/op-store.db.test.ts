// @vitest-environment node
/**
 * op-store against real Postgres. Skipped unless DATABASE_URL names a *_test DB
 * (same gate as tests/auth/recovery-b4.test.ts). Frames come from the real encoder.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, schema, setAdapter, setDialect, PostgresAdapter } from "@/db";
import { deriveKeysFromPassphrase, type Argon2Params, type LogKeys } from "@/lib/local-first/crypto/kdf";
import { encodeFrame } from "@/lib/local-first/oplog/frame";
import { appendFrames, pullFrames } from "@/lib/local-first/server/op-store";
import type { Op } from "@/lib/local-first/oplog/types";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const TINY: Argon2Params = { m: 64, t: 1, p: 1, dkLen: 32 };
const SALT = new Uint8Array(16).map((_, i) => i + 11);
const LOG_ID = "lf1-op-store-db";
const TAG = randomUUID().slice(0, 8);
const U1 = `lf1-${TAG}-u1`;
const U2 = `lf1-${TAG}-u2`;

let keys: LogKeys;
/** Bytes as sent, keyed by opId. Nonces are random, so re-encoding is not byte-stable. */
const sent = new Map<string, Uint8Array>();
const ULID_PREFIX = "01H" + "Z".repeat(20); // 23 chars + 3-digit index = 26

function opIdOf(i: number): string {
  return ULID_PREFIX + i.toString().padStart(3, "0");
}

async function frame(i: number, deviceId = "dev-1"): Promise<Uint8Array> {
  const op: Op = {
    deviceId,
    opId: opIdOf(i),
    seq: i,
    hlc: { ms: 1_700_000_000_000 + i, counter: 0 },
    entity: "transactions",
    rowId: `r${i}`,
    kind: "upsert",
    fields: { n: i },
  };
  return encodeFrame(op, keys, LOG_ID);
}

beforeAll(async () => {
  if (!HAS_DB) return;
  const adapter = new PostgresAdapter();
  await adapter.initialize({
    dialect: "postgres",
    postgres: { connectionString: (process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL)!, userId: "" },
  });
  setAdapter(adapter);
  setDialect("postgres");
  keys = await deriveKeysFromPassphrase("lf1 op-store db", SALT, LOG_ID, TINY);
  for (const id of [U1, U2]) {
    await db.insert(schema.users).values({ id, passwordHash: "x", createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing();
  }
});

afterAll(async () => {
  if (!HAS_DB) return;
  await db.delete(schema.lfOpFrame).where(inArray(schema.lfOpFrame.userId, [U1, U2]));
  await db.delete(schema.users).where(inArray(schema.users.id, [U1, U2]));
});

describe.skipIf(!HAS_DB)("op-store (real Postgres)", () => {
  it("appends frames and reports accepted, duplicate and the last cursor", async () => {
    const batch = [await frame(1), await frame(2), await frame(3)];
    batch.forEach((b, i) => sent.set(opIdOf(i + 1), b));
    const first = await appendFrames(U1, batch);
    expect(first).toMatchObject({ accepted: 3, duplicate: 0 });
    expect(first.lastCursor).toBeGreaterThan(0);
  });

  it("is idempotent: re-sending known frames is a duplicate and writes nothing", async () => {
    const before = await pullFrames(U1, 0, 500);
    const again = await appendFrames(U1, [await frame(1), await frame(2)]);
    expect(again).toMatchObject({ accepted: 0, duplicate: 2 });
    const after = await pullFrames(U1, 0, 500);
    expect(after.frames.length).toBe(before.frames.length);
  });

  it("mixes new and known frames and counts both", async () => {
    const r = await appendFrames(U1, [await frame(3), await frame(4)]);
    expect(r).toMatchObject({ accepted: 1, duplicate: 1 });
  });

  it("treats the same opId twice within one batch as one accept and one duplicate", async () => {
    const r = await appendFrames(U1, [await frame(50), await frame(50)]);
    expect(r).toMatchObject({ accepted: 1, duplicate: 1 });
  });

  it("pulls in cursor order with a page limit and hasMore, and returns the stored bytes", async () => {
    const all = await pullFrames(U1, 0, 500);
    const ids = all.frames.map((f) => f.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const sample = all.frames[0];
    expect(sample.frame).toEqual(sent.get(opIdOf(1))!);

    const p1 = await pullFrames(U1, 0, 2);
    expect(p1.frames.length).toBe(2);
    expect(p1.hasMore).toBe(true);
    expect(p1.nextCursor).toBe(p1.frames[1].id);

    const p2 = await pullFrames(U1, p1.nextCursor, 500);
    expect(p2.frames[0].id).toBeGreaterThan(p1.nextCursor);
    expect(p2.frames.length).toBe(all.frames.length - 2);
    expect(p2.hasMore).toBe(false);
  });

  it("returns an empty page and keeps the cursor when nothing is newer", async () => {
    const all = await pullFrames(U1, 0, 500);
    const tail = all.frames[all.frames.length - 1].id;
    const empty = await pullFrames(U1, tail, 10);
    expect(empty).toEqual({ frames: [], nextCursor: tail, hasMore: false });
  });

  it("isolates users: same opId for another user is accepted, and neither user sees the other's frames", async () => {
    const r = await appendFrames(U2, [await frame(1, "dev-2"), await frame(900, "dev-2")]);
    expect(r).toMatchObject({ accepted: 2, duplicate: 0 });

    const u2 = await pullFrames(U2, 0, 500);
    expect(u2.frames.map((f) => f.deviceId)).toEqual(["dev-2", "dev-2"]);

    const u1 = await pullFrames(U1, 0, 500);
    expect(u1.frames.some((f) => f.deviceId === "dev-2")).toBe(false);
    expect(u1.frames.some((f) => f.opId === opIdOf(900))).toBe(false);
  });

  it("rejects a batch containing one malformed frame and writes none of it", async () => {
    const before = await pullFrames(U2, 0, 500);
    const good = await frame(777, "dev-2");
    const bad = new Uint8Array([0, 0, 0, 3, 2, 9, 9]);
    await expect(appendFrames(U2, [good, bad])).rejects.toThrow(/truncated|malformed/);
    const after = await pullFrames(U2, 0, 500);
    expect(after.frames.length).toBe(before.frames.length);
  });

  it("stores the owning user id on every row", async () => {
    const rows = await db
      .select({ userId: schema.lfOpFrame.userId, deviceId: schema.lfOpFrame.deviceId })
      .from(schema.lfOpFrame)
      .where(eq(schema.lfOpFrame.userId, U2));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.userId === U2)).toBe(true);
  });
});
