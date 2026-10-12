// @vitest-environment jsdom
// On-device key rotation: keyring + outbox sweep (crash-safe), orchestrator, auto policy.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { IdbDeviceKeyProvider, RotationPendingError, deviceKeys } from "@/lib/local-first/crypto/device-key-provider";
import { createOutboxStore, outboxDbName } from "@/lib/local-first/write-path/outbox-store";
import { openDb, txDone } from "@/lib/local-first/storage/db-registry";
import { rotateOnDeviceKeys, shouldAutoRotate, maybeAutoRotateKeys, AUTO_ROTATE_MAX_AGE_MS } from "@/lib/local-first/crypto/rotation";
import { seal, open } from "@/lib/local-first/crypto/aead";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

const provider = new IdbDeviceKeyProvider();
let n = 0;
let uid = "";
const DEV = "dev-1";

const entry = (opId: string, at = 1): OutboxEntry => ({
  opId, kind: "create", rowId: `local-${opId}`, serverId: null, fields: { payee: `p-${opId}`, amount: -5 }, fieldHlc: {},
  base: {}, createdAt: at, attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
});

beforeEach(() => {
  uid = `rot-user-${++n}-${Date.now()}`;
});
afterEach(async () => {
  await wipeAll();
});

describe("device keyring", () => {
  it("rotate: fresh key becomes current, the old one is kept as previous, generation counts up, keys stay non-extractable", async () => {
    const first = await provider.getOrCreateDeviceKey(uid);
    expect((await provider.getKeyMeta(uid))?.generation).toBe(1);
    const ring = await provider.rotateDeviceKey(uid);
    expect(ring).not.toBeNull();
    expect(ring!.current!.extractable).toBe(false);
    const sealedWithOld = await seal(first, new TextEncoder().encode("x"));
    // the kept previous key still opens what the old key sealed; the new current key does not
    expect(new TextDecoder().decode(await open(ring!.previous!, sealedWithOld))).toBe("x");
    await expect(open(ring!.current!, sealedWithOld)).rejects.toBeTruthy();
    const meta = await provider.getKeyMeta(uid);
    expect(meta?.generation).toBe(2);
    expect(meta?.rotatedAt).not.toBeNull();
  });

  it("no key yet: nothing to rotate; a rotation while one is pending is refused; dropping the previous allows the next", async () => {
    expect(await provider.rotateDeviceKey(uid)).toBeNull();
    await provider.getOrCreateDeviceKey(uid);
    await provider.rotateDeviceKey(uid);
    await expect(provider.rotateDeviceKey(uid)).rejects.toBeInstanceOf(RotationPendingError);
    await provider.dropPreviousKey(uid);
    expect((await provider.findKeyring(uid)).previous).toBeNull();
    expect(await provider.rotateDeviceKey(uid)).not.toBeNull();
    expect((await provider.getKeyMeta(uid))?.generation).toBe(3);
  });
});

describe("outbox rotation", () => {
  it("every queued entry survives and is readable under the new key alone; the previous key is gone", async () => {
    const box = createOutboxStore(uid, DEV);
    for (let i = 1; i <= 5; i++) await box.put(entry(`op${i}`, i));
    const r = await box.rotateKeys();
    expect(r).toEqual({ rotated: true, resealed: 5, dropped: 0 });
    expect((await box.list()).map((e) => e.opId)).toEqual(["op1", "op2", "op3", "op4", "op5"]);
    const ring = await deviceKeys.findKeyring(uid);
    expect(ring.previous).toBeNull();
    expect(ring.current).not.toBeNull();
  });

  it("crash after the key swap but before the sweep: nothing is lost, and the next read finishes the job", async () => {
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    // simulate the crash: swap the key only (what rotateKeys does first), skip the sweep
    await deviceKeys.rotateDeviceKey(uid);
    expect((await deviceKeys.findKeyring(uid)).previous).not.toBeNull();
    expect((await box.list()).map((e) => e.opId)).toEqual(["a", "b"]);
    expect((await deviceKeys.findKeyring(uid)).previous).toBeNull(); // list() settled it
    expect((await box.list()).length).toBe(2);
  });

  it("an entry sealed with the old key after the swap (a late write) is re-sealed by the sweep, not lost", async () => {
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("early", 1));
    const oldKey = await deviceKeys.getOrCreateDeviceKey(uid);
    await deviceKeys.rotateDeviceKey(uid); // new key is current, old key is previous
    const enc = new TextEncoder();
    const sealed = await seal(oldKey, enc.encode(JSON.stringify(entry("late", 2))), enc.encode(`finlynq-lf-outbox|v1|${uid}|${DEV}|late`));
    const db = await openDb(await outboxDbName(uid), (d) => d.createObjectStore("entries"));
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").put(sealed, "late");
    await txDone(tx);
    db.close();
    expect((await box.list()).map((e) => e.opId)).toEqual(["early", "late"]);
    expect((await deviceKeys.findKeyring(uid)).previous).toBeNull();
    // and readable again after the previous key is gone: it was truly re-sealed under the current key
    expect((await box.list()).map((e) => e.opId)).toEqual(["early", "late"]);
  });

  it("a damaged record is dropped and counted; the others still rotate", async () => {
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("good1", 1));
    await box.put(entry("bad", 2));
    await box.put(entry("good2", 3));
    // corrupt one record
    const db = await openDb(await outboxDbName(uid), (d) => d.createObjectStore("entries"));
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").put(new Uint8Array(40), "bad");
    await txDone(tx);
    db.close();
    const r = await box.rotateKeys();
    expect(r.rotated).toBe(true);
    expect(r.dropped).toBe(1);
    expect((await box.list()).map((e) => e.opId)).toEqual(["good1", "good2"]);
  });

  it("writes racing a rotation are all kept (the outbox lock orders them)", async () => {
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("seed", 0));
    const writes = Array.from({ length: 8 }, (_, i) => box.put(entry(`w${i}`, i + 1)));
    const rot = box.rotateKeys();
    const more = Array.from({ length: 4 }, (_, i) => box.put(entry(`x${i}`, 100 + i)));
    await Promise.all([...writes, rot, ...more]);
    const ids = (await box.list()).map((e) => e.opId).sort();
    expect(ids).toEqual(["seed", ...Array.from({ length: 8 }, (_, i) => `w${i}`), ...Array.from({ length: 4 }, (_, i) => `x${i}`)].sort());
    expect((await deviceKeys.findKeyring(uid)).previous).toBeNull();
  });

  it("rotating twice in a row works; with no key yet it is a no-op", async () => {
    const empty = createOutboxStore(`${uid}-empty`, DEV);
    expect(await empty.rotateKeys()).toEqual({ rotated: false, resealed: 0, dropped: 0 });
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.rotateKeys();
    await box.rotateKeys();
    expect((await box.list()).map((e) => e.opId)).toEqual(["a"]);
    expect((await deviceKeys.getKeyMeta(uid))?.generation).toBe(3);
  });
});

describe("orchestrator and auto policy", () => {
  it("rotateOnDeviceKeys re-seals the outbox and clears the disposable copies", async () => {
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("keep", 1));
    const cleared: string[] = [];
    const r = await rotateOnDeviceKeys(uid, {
      outbox: box,
      clearSnapshot: async (u) => void cleared.push(`snap:${u}`),
      clearDataCache: async (u) => void cleared.push(`cache:${u}`),
    });
    expect(r).toMatchObject({ rotated: true, outboxResealed: 1, outboxDropped: 0, snapshotCleared: true, dataCacheCleared: true });
    expect(cleared).toEqual([`snap:${uid}`, `cache:${uid}`]);
    expect((await box.list()).map((e) => e.opId)).toEqual(["keep"]);
  });

  it("a failing cache clear is reported, never thrown, and never touches the outbox", async () => {
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("keep", 1));
    const r = await rotateOnDeviceKeys(uid, { outbox: box, clearSnapshot: async () => { throw new Error("blocked"); } });
    expect(r.rotated).toBe(true);
    expect(r.snapshotCleared).toBe(false);
    expect((await box.list()).length).toBe(1);
  });

  it("shouldAutoRotate: unknown age or older than 90 days", () => {
    const now = 10_000_000_000;
    expect(shouldAutoRotate(null, now)).toBe(true);
    expect(shouldAutoRotate({ createdAt: now - 1000, rotatedAt: null, generation: 1 }, now)).toBe(false);
    expect(shouldAutoRotate({ createdAt: now - AUTO_ROTATE_MAX_AGE_MS - 1, rotatedAt: null, generation: 1 }, now)).toBe(true);
    // a recent rotation resets the clock
    expect(shouldAutoRotate({ createdAt: 1, rotatedAt: now - 1000, generation: 2 }, now)).toBe(false);
  });

  it("auto rotation never runs over queued writes, and does run on an empty outbox once the key is old", async () => {
    const box = createOutboxStore(uid, DEV);
    await deviceKeys.getOrCreateDeviceKey(uid);
    const future = Date.now() + AUTO_ROTATE_MAX_AGE_MS + 60_000;
    await box.put(entry("queued", 1));
    expect(await maybeAutoRotateKeys(uid, { outbox: box }, future)).toBeNull();
    expect((await deviceKeys.getKeyMeta(uid))?.generation).toBe(1);
    await box.remove("queued");
    const r = await maybeAutoRotateKeys(uid, { outbox: box, clearSnapshot: async () => {} }, future);
    expect(r?.rotated).toBe(true);
    expect((await deviceKeys.getKeyMeta(uid))?.generation).toBe(2);
    // a young key is left alone
    expect(await maybeAutoRotateKeys(uid, { outbox: box }, Date.now())).toBeNull();
  });
});
