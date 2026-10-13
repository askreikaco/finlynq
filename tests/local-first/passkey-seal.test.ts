// @vitest-environment jsdom
// Passkey seal: the second layer over the on-device offline outbox and snapshot. Fake WebAuthn with PRF; fake-indexeddb as
// the browser store; Node's own crypto is the independent implementation for the HKDF and AES-GCM vectors.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash, createHmac, randomBytes, hkdfSync, createCipheriv } from "node:crypto";
import {
  enablePasskeyUnlock,
  unlockWithPasskey,
  readPasskeyUnlockRecord,
  clearPasskeyUnlockedSession,
  hasPasskeyUnlockedSession,
  isPasskeyLockedError,
  passkeyLockedNow,
  passkeyEnrolledHint,
  passkeyPersistBlocked,
  refreshPasskeyLock,
  unlockSecretFor,
  onPasskeyUnlocked,
  PasskeyLockedError,
  type PasskeyDeps,
} from "@/lib/local-first/crypto/passkey-unlock";
import { deriveInnerKey, innerInfo, sealLayers } from "@/lib/local-first/crypto/passkey-seal";
import { enrollPasskeySeal, finishPasskeySeal, disablePasskeySeal } from "@/lib/local-first/crypto/passkey-lifecycle";
import { seal, open, AuthError } from "@/lib/local-first/crypto/aead";
import { deviceKeys } from "@/lib/local-first/crypto/device-key-provider";
import { rotateOnDeviceKeys } from "@/lib/local-first/crypto/rotation";
import { createOutboxStore, outboxDbName, countOutboxRecords } from "@/lib/local-first/write-path/outbox-store";
import { createDrain } from "@/lib/local-first/write-path/drain";
import { createDrainScheduler } from "@/lib/local-first/write-path/scheduler";
import { createWriteQueue } from "@/lib/local-first/write-path/queue";
import { wipeAll, saveSnapshot, loadSnapshot, readCacheDbName } from "@/lib/local-first/read-cache/persist-store";
import { forgetPasskeyAndDiscardOffline, enablePasskeyUnlock as facadeEnable, unlockWithPasskey as facadeUnlock } from "@/lib/data/passkey-unlock";
import { disableOfflineMode, stopLocalWriteQueue } from "@/lib/data/local-write-queue";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

const enc = new TextEncoder();
const dec = new TextDecoder();
const DEV = "dev-seal-1";
let n = 0;
let uid = "";
const ab = (u: Uint8Array): ArrayBuffer => new Uint8Array(u).buffer;
const SNAP_OPTS = { build: "seal-build", schemaVer: 1 };

/** Fake platform authenticator. PRF = HMAC(secret, SHA256("WebAuthn PRF\0" || salt)), like SoftAuthenticator. */
function fakeAuthenticator() {
  const prfSecret = randomBytes(32);
  const credentialId = randomBytes(32);
  const state = { mode: "ok" as "ok" | "cancel" | "wrongPrf" };
  const calls = { create: [] as unknown[], get: [] as unknown[] };
  const prf = (salt: Uint8Array, secret = prfSecret) => {
    const input = createHash("sha256").update(Buffer.concat([Buffer.from("WebAuthn PRF\0"), Buffer.from(salt)])).digest();
    return createHmac("sha256", secret).update(input).digest();
  };
  const credentials = {
    create: vi.fn(async (o: unknown) => {
      calls.create.push(o);
      return { rawId: ab(credentialId), getClientExtensionResults: () => ({ prf: { enabled: true } }) };
    }),
    get: vi.fn(async (o: unknown) => {
      calls.get.push(o);
      const req = o as { publicKey: { allowCredentials: { id: Uint8Array }[]; extensions: { prf: { eval: { first: Uint8Array } } } } };
      if (state.mode === "cancel") throw new DOMException("cancelled", "NotAllowedError");
      if (!req.publicKey.allowCredentials.some((c) => Buffer.from(c.id).equals(credentialId))) throw new DOMException("no credential", "NotAllowedError");
      const salt = new Uint8Array(req.publicKey.extensions.prf.eval.first);
      const out = prf(salt, state.mode === "wrongPrf" ? randomBytes(32) : prfSecret);
      return { getClientExtensionResults: () => ({ prf: { results: { first: ab(new Uint8Array(out)) } } }) };
    }),
  };
  return { credentials, state, calls };
}

const deps = (auth: ReturnType<typeof fakeAuthenticator>): PasskeyDeps => ({
  credentials: auth.credentials as unknown as PasskeyDeps["credentials"],
  rpId: "localhost",
});

const entry = (opId: string, at = 1): OutboxEntry => ({
  opId, kind: "create", rowId: `local-${opId}`, serverId: null, fields: { payee: `p-${opId}`, amount: -5 }, fieldHlc: {},
  base: {}, createdAt: at, attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
});

const aadFor = (userId: string, opId: string) => enc.encode(`finlynq-lf-outbox|v1|${userId}|${DEV}|${opId}`);

function reqP<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function openRaw(name: string): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Every outbox record as stored (no decryption). */
async function rawRecords(userId: string): Promise<{ opId: string; value: unknown }[]> {
  const db = await openRaw(await outboxDbName(userId));
  try {
    const store = db.transaction("entries").objectStore("entries");
    const keys = await reqP(store.getAllKeys());
    const values = await reqP(store.getAll());
    return keys.map((k, i) => ({ opId: String(k), value: values[i] }));
  } finally {
    db.close();
  }
}

async function rawPut(userId: string, opId: string, value: unknown): Promise<void> {
  const db = await openRaw(await outboxDbName(userId));
  try {
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").put(value, opId);
    await new Promise((res, rej) => {
      tx.oncomplete = () => res(undefined);
      tx.onerror = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
}

const isDouble = (v: unknown): boolean => typeof v === "object" && v !== null && !ArrayBuffer.isView(v) && (v as { f?: unknown }).f === 2;
const isSingle = (v: unknown): boolean => ArrayBuffer.isView(v);

/** What the device key alone reveals of a stored record (single: the entry; double: the inner ciphertext). */
async function deviceOnly(userId: string, value: unknown, opId: string): Promise<Uint8Array | null> {
  const dev = await deviceKeys.findDeviceKey(userId);
  const body = isDouble(value) ? (value as { c: Uint8Array }).c : (value as Uint8Array);
  if (!dev) return null;
  try {
    return await open(dev, new Uint8Array(body), aadFor(userId, opId));
  } catch {
    return null;
  }
}

/** A double-sealed record built by hand (used to simulate a crash between records). */
async function makeDouble(userId: string, e: OutboxEntry, secret: Uint8Array) {
  const dev = await deviceKeys.getOrCreateDeviceKey(userId);
  const inner = await deriveInnerKey(secret, "outbox", userId);
  return { f: 2, c: await sealLayers(dev, inner, enc.encode(JSON.stringify(e)), aadFor(userId, e.opId)) };
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  uid = `seal-user-${++n}-${Date.now()}`;
  fetchSpy = vi.fn(() => {
    throw new Error("network must not be used by passkey seal");
  });
  vi.stubGlobal("fetch", fetchSpy);
  window.localStorage.clear();
});
afterEach(async () => {
  stopLocalWriteQueue();
  vi.unstubAllGlobals();
  clearPasskeyUnlockedSession();
  await new Promise((r) => setTimeout(r, 20));
  await wipeAll();
});

describe("inner key (HKDF vector, independent Node implementation)", () => {
  it("matches Node's HKDF-SHA-256 with info finlynq-lf-passkey-inner-v1|<store>|<userId>, is non-extractable, and is store-bound", async () => {
    const secret = new Uint8Array(32).fill(0x55);
    expect(Buffer.from(innerInfo("outbox", "vec-user")).toString()).toBe("finlynq-lf-passkey-inner-v1|outbox|vec-user");
    const k = await deriveInnerKey(secret, "outbox", "vec-user");
    expect(k.extractable).toBe(false);
    const nodeKey = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), Buffer.from("finlynq-lf-passkey-inner-v1|outbox|vec-user"), 32));
    const aad = enc.encode("aad");
    const nonce = Buffer.alloc(12, 0x33);
    const ci = createCipheriv("aes-256-gcm", nodeKey, nonce);
    ci.setAAD(Buffer.from(aad));
    const sealedNode = new Uint8Array(Buffer.concat([nonce, ci.update(Buffer.from("hello")), ci.final(), ci.getAuthTag()]));
    expect(dec.decode(await open(k, sealedNode, aad))).toBe("hello");
    // the snapshot key of the same user cannot open an outbox seal
    const snap = await deriveInnerKey(secret, "snapshot", "vec-user");
    const mine = await seal(k, enc.encode("x"), aad);
    await expect(open(snap, mine, aad)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("enrol seals every record in two layers", () => {
  it("existing and new records are double-sealed; the device key alone reveals no entry; nothing is sent", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await box.put(entry("c", 3));
    expect((await rawRecords(uid)).every((r) => isSingle(r.value))).toBe(true);

    const r = await enrollPasskeySeal(uid, DEV, deps(auth));
    expect(r).toMatchObject({ ok: true, rewritten: 3 });
    const raw = await rawRecords(uid);
    expect(raw.map((x) => x.opId).sort()).toEqual(["a", "b", "c"]);
    expect(raw.every((x) => isDouble(x.value))).toBe(true);
    for (const x of raw) {
      const plain = await deviceOnly(uid, x.value, x.opId);
      expect(plain).not.toBeNull(); // the device layer opens ...
      expect(() => JSON.parse(dec.decode(plain!))).toThrow(); // ... but reveals only the inner ciphertext
    }

    await box.put(entry("d", 4));
    expect(isDouble((await rawRecords(uid)).find((x) => x.opId === "d")!.value)).toBe(true);
    expect((await box.list()).map((e) => e.opId)).toEqual(["a", "b", "c", "d"]);
    expect(passkeyEnrolledHint(uid)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses a second enrolment while a record exists; the record and its seal are untouched", async () => {
    const auth = fakeAuthenticator();
    await enrollPasskeySeal(uid, DEV, deps(auth));
    const before = await readPasskeyUnlockRecord(uid);
    const r = await enablePasskeyUnlock(uid, deps(auth), DEV);
    expect(r).toEqual({ ok: false, code: "already_enabled" });
    expect((await readPasskeyUnlockRecord(uid))!.createdAt).toBe(before!.createdAt);
  });

  it("with no passkey, single-sealed records are read and written as before (legacy form)", async () => {
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("x", 1));
    expect((await box.list()).map((e) => e.opId)).toEqual(["x"]);
    expect((await rawRecords(uid)).every((x) => isSingle(x.value))).toBe(true);
    expect(passkeyLockedNow(uid)).toBe(false);
  });
});

describe("locked: nothing is opened, queued or deleted", () => {
  it("without the unlock secret every read, write and delete fails closed and the records stay", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid); // page reload
    expect(passkeyLockedNow(uid)).toBe(true);

    await expect(box.list()).rejects.toBeInstanceOf(PasskeyLockedError);
    await expect(box.put(entry("c", 3))).rejects.toBeInstanceOf(PasskeyLockedError);
    await expect(box.remove("a")).rejects.toBeInstanceOf(PasskeyLockedError);
    await expect(box.rotateKeys()).rejects.toBeInstanceOf(PasskeyLockedError);
    await expect(box.finishPendingSweep()).rejects.toBeInstanceOf(PasskeyLockedError);

    const raw = await rawRecords(uid);
    expect(raw.map((x) => x.opId).sort()).toEqual(["a", "b"]);
    expect(raw.every((x) => isDouble(x.value))).toBe(true);
    expect(await countOutboxRecords(uid)).toBe(2);
    expect(hasPasskeyUnlockedSession(uid)).toBe(false);
  });

  it("the drain stays paused while locked: no retry timer and no warning", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const setTimer = vi.fn();
    const drain = createDrain({ store: box, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
    const scheduler = createDrainScheduler({
      drain,
      list: () => box.list(),
      win: null,
      doc: null,
      isOnline: () => true,
      setTimer,
      clearTimer: () => undefined,
    });
    scheduler.start();
    await scheduler.kick();
    expect(setTimer).not.toHaveBeenCalled();
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("drain failed"))).toEqual([]);
    warn.mockRestore();
  });

  it("the write queue refuses an offline change while locked (typed error, nothing written) and works again after unlock", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    const q = createWriteQueue({ userId: uid, deviceId: DEV });
    clearPasskeyUnlockedSession(uid);
    await expect(q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 })).rejects.toBeInstanceOf(PasskeyLockedError);
    expect(await countOutboxRecords(uid)).toBe(1);

    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: true });
    const e = await q.enqueueCreate({ date: "2026-10-02", accountId: 1, categoryId: 2, amount: -5 });
    expect(e).not.toBeNull();
    expect(await countOutboxRecords(uid)).toBe(2);
  });

  it("a wrong passkey cannot open the records; a later right passkey does", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid);
    auth.state.mode = "wrongPrf";
    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: false, code: "wrong_passkey" });
    await expect(box.list()).rejects.toBeInstanceOf(PasskeyLockedError);
    expect(await countOutboxRecords(uid)).toBe(1);
    auth.state.mode = "ok";
    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: true });
    expect((await box.list()).map((e) => e.opId)).toEqual(["a"]);
  });

  it("a successful unlock notifies listeners; the secret is only in memory", async () => {
    const auth = fakeAuthenticator();
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid);
    const heard = vi.fn();
    const off = onPasskeyUnlocked(heard);
    await unlockWithPasskey(uid, deps(auth));
    off();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(unlockSecretFor(uid)).not.toBeNull();
    // the secret is not stored anywhere on disk
    const rec = await readPasskeyUnlockRecord(uid);
    expect(Buffer.from(rec!.wrapped).includes(Buffer.from(unlockSecretFor(uid)!))).toBe(false);
  });

  it("persist gate: an unknown user is blocked until the first refresh; a user without a record is then allowed", async () => {
    expect(passkeyPersistBlocked(`${uid}-fresh`)).toBe(true);
    expect(await refreshPasskeyLock(`${uid}-fresh`)).toBe(false);
    expect(passkeyPersistBlocked(`${uid}-fresh`)).toBe(false);
  });
});

describe("crash-safe migrations (every record readable after restart given the passkey)", () => {
  it("crash after the record is written and before the re-seal: restart, unlock, finish; all records opened and sealed", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await box.put(entry("c", 3));
    await enablePasskeyUnlock(uid, deps(auth), DEV); // the record step only: the crash happens here
    expect((await readPasskeyUnlockRecord(uid))!.sealed).toBe(false);
    clearPasskeyUnlockedSession(uid); // restart

    expect((await rawRecords(uid)).every((x) => isSingle(x.value))).toBe(true);
    await expect(box.list()).rejects.toBeInstanceOf(PasskeyLockedError);
    expect((await rawRecords(uid)).length).toBe(3);

    await unlockWithPasskey(uid, deps(auth));
    await finishPasskeySeal(uid);
    expect((await rawRecords(uid)).every((x) => isDouble(x.value))).toBe(true);
    expect((await readPasskeyUnlockRecord(uid))!.sealed).toBe(true);
    expect((await box.list()).map((e) => e.opId)).toEqual(["a", "b", "c"]);
  });

  it("crash mid-way (some records already double): the mixed set opens after unlock and finishes", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await box.put(entry("c", 3));
    await enablePasskeyUnlock(uid, deps(auth), DEV);
    const secret = unlockSecretFor(uid)!;
    await rawPut(uid, "b", await makeDouble(uid, entry("b", 2), secret)); // one record got its second layer, the rest did not
    clearPasskeyUnlockedSession(uid);

    const mixed = await rawRecords(uid);
    expect(mixed.map((x) => [x.opId, isDouble(x.value)])).toEqual([["a", false], ["b", true], ["c", false]]);
    await expect(box.list()).rejects.toBeInstanceOf(PasskeyLockedError);

    await unlockWithPasskey(uid, deps(auth));
    expect((await box.list()).map((e) => e.opId)).toEqual(["a", "b", "c"]);
    await finishPasskeySeal(uid);
    expect((await rawRecords(uid)).every((x) => isDouble(x.value))).toBe(true);
  });

  it("a failed re-seal aborts enrolment: records stay single and readable, the record is removed, the count is reported", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await rawPut(uid, "bad", new Uint8Array(64).fill(7)); // a damaged record no key opens
    const r = await enrollPasskeySeal(uid, DEV, deps(auth));
    expect(r).toEqual({ ok: false, code: "failed", failed: 1 });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    expect(passkeyEnrolledHint(uid)).toBe(false);
    const raw = await rawRecords(uid);
    expect(raw.every((x) => isSingle(x.value))).toBe(true);
    expect(raw.map((x) => x.opId).sort()).toEqual(["a", "b", "bad"]); // nothing deleted by the migration
    for (const id of ["a", "b"]) expect(JSON.parse(dec.decode((await deviceOnly(uid, raw.find((x) => x.opId === id)!.value, id))!)).opId).toBe(id);
  });

  it("key rotation with double records re-seals only the outer layer: the inner ciphertext is byte-identical", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    const oldDev = await deviceKeys.findDeviceKey(uid);
    const before = new Map<string, Uint8Array>();
    for (const x of await rawRecords(uid)) {
      before.set(x.opId, new Uint8Array(await open(oldDev!, (x.value as { c: Uint8Array }).c, aadFor(uid, x.opId))));
    }

    const report = await rotateOnDeviceKeys(uid, { outbox: box, clearSnapshot: async () => undefined });
    expect(report).toMatchObject({ rotated: true, outboxResealed: 2 });
    const newDev = await deviceKeys.findDeviceKey(uid);
    for (const x of await rawRecords(uid)) {
      expect(isDouble(x.value)).toBe(true);
      const inner = await open(newDev!, (x.value as { c: Uint8Array }).c, aadFor(uid, x.opId));
      expect(Buffer.from(inner).equals(Buffer.from(before.get(x.opId)!))).toBe(true);
    }
    expect((await box.list()).map((e) => e.opId)).toEqual(["a", "b"]);
  });
});

describe("drain after unlock; crash during disable", () => {
  it("a queued drain sends and removes the entries once the passkey is presented again", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid);
    await expect(box.list()).rejects.toBeInstanceOf(PasskeyLockedError);

    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: true });
    const sent: string[] = [];
    const drain = createDrain({
      store: box,
      fetchImpl: async (url, init) => {
        sent.push(`${init?.method ?? "GET"} ${url}`);
        return { ok: true, status: 200, json: async () => ({ id: 500 + sent.length }) };
      },
    });
    const report = await drain();
    expect(report.sent).toBe(2);
    expect(sent).toEqual(["POST /api/transactions", "POST /api/transactions"]);
    expect(await box.list()).toEqual([]);
    expect(await countOutboxRecords(uid)).toBe(0);
  });

  it("crash during disable (some records already single, record still present): disable again completes; nothing lost", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    const secret = unlockSecretFor(uid)!;
    // the interrupted re-seal had turned "a" back to single before the page died
    const dev = await deviceKeys.getOrCreateDeviceKey(uid);
    await rawPut(uid, "a", await seal(dev, enc.encode(JSON.stringify(entry("a", 1))), aadFor(uid, "a")));
    clearPasskeyUnlockedSession(uid); // restart: the record still exists, so the page is locked
    expect(passkeyLockedNow(uid)).toBe(true);
    await expect(box.list()).rejects.toBeInstanceOf(PasskeyLockedError);
    expect(secret.length).toBe(32);

    await expect(disablePasskeySeal(uid, DEV, { unsyncedCount: 0, confirmed: false }, deps(auth))).resolves.toEqual({ ok: true });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    expect((await rawRecords(uid)).every((x) => isSingle(x.value))).toBe(true);
    expect((await box.list()).map((e) => e.opId)).toEqual(["a", "b"]);
  });
});

describe("disable re-seals back to single and deletes the record", () => {
  it("needs the confirmation for unsynced writes, then a ceremony, then re-seals; nothing is lost", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await box.put(entry("b", 2));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    await box.put(entry("c", 3));
    clearPasskeyUnlockedSession(uid);
    const gets = auth.calls.get.length;

    await expect(disablePasskeySeal(uid, DEV, { unsyncedCount: 3, confirmed: false }, deps(auth))).resolves.toEqual({ ok: false, code: "unsynced_blocked" });
    expect(auth.calls.get.length).toBe(gets); // refused before any ceremony

    await expect(disablePasskeySeal(uid, DEV, { unsyncedCount: 3, confirmed: true }, deps(auth))).resolves.toEqual({ ok: true });
    expect(auth.calls.get.length).toBe(gets + 1);
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    expect(passkeyLockedNow(uid)).toBe(false);
    const raw = await rawRecords(uid);
    expect(raw.every((x) => isSingle(x.value))).toBe(true);
    expect((await box.list()).map((e) => e.opId)).toEqual(["a", "b", "c"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a cancelled ceremony on disable changes nothing: records stay double, the record stays", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid);
    auth.state.mode = "cancel";
    await expect(disablePasskeySeal(uid, DEV, { unsyncedCount: 0, confirmed: false }, deps(auth))).resolves.toEqual({ ok: false, code: "cancelled" });
    expect(await readPasskeyUnlockRecord(uid)).not.toBeNull();
    expect((await rawRecords(uid)).every((x) => isDouble(x.value))).toBe(true);
  });
});

describe("forget and wipes", () => {
  it("forget discards the offline copies and the passkey record, with no ceremony and no network", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid);
    const r = await forgetPasskeyAndDiscardOffline(uid);
    expect(r).toEqual({ ok: true });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(await outboxDbName(uid));
    expect(auth.calls.get.length).toBe(1); // only the enrolment's assertion, forget asked for none
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("turning offline mode off wipes every passkey record on this browser", async () => {
    const auth = fakeAuthenticator();
    await enrollPasskeySeal(uid, DEV, deps(auth));
    disableOfflineMode();
    for (let i = 0; i < 50 && (await readPasskeyUnlockRecord(uid)) !== null; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    expect(passkeyEnrolledHint(uid)).toBe(false);
  });
});

describe("snapshot second layer", () => {
  const rows = { accounts: [{ id: "a1", name: "Cash" }], categories: [], transactions: [] } as unknown as Parameters<typeof saveSnapshot>[2];

  async function rawSnapshotPointer(userId: string): Promise<{ layers?: number } | undefined> {
    const db = await openRaw(await readCacheDbName(userId));
    try {
      return await reqP(db.transaction("meta").objectStore("meta").get("current"));
    } finally {
      db.close();
    }
  }

  it("a snapshot saved while enrolled is double-sealed, loads with the passkey, and is kept (not wiped) while locked", async () => {
    const auth = fakeAuthenticator();
    await enrollPasskeySeal(uid, DEV, deps(auth));
    await saveSnapshot(uid, DEV, rows, { ...SNAP_OPTS });
    expect((await rawSnapshotPointer(uid))?.layers).toBe(2);
    expect(await loadSnapshot(uid, DEV, SNAP_OPTS)).toEqual(rows);

    clearPasskeyUnlockedSession(uid);
    expect(await loadSnapshot(uid, DEV, SNAP_OPTS)).toBeNull();
    expect((await rawSnapshotPointer(uid))?.layers).toBe(2); // still there
    await expect(saveSnapshot(uid, DEV, rows, { ...SNAP_OPTS })).rejects.toBeInstanceOf(PasskeyLockedError);

    await unlockWithPasskey(uid, deps(auth));
    expect(await loadSnapshot(uid, DEV, SNAP_OPTS)).toEqual(rows);
  });

  it("the device key alone cannot decode a double snapshot blob", async () => {
    const auth = fakeAuthenticator();
    await enrollPasskeySeal(uid, DEV, deps(auth));
    await saveSnapshot(uid, DEV, rows, { ...SNAP_OPTS });
    const db = await openRaw(await readCacheDbName(uid));
    const manifestKey = (await reqP(db.transaction("meta").objectStore("meta").get("current")) as { snapshotId: string }).snapshotId + "|00000000";
    const blob = await reqP(db.transaction("blobs").objectStore("blobs").get(manifestKey));
    db.close();
    const dev = await deviceKeys.findDeviceKey(uid);
    const aad = enc.encode(`finlynq-lf-snap|v1|${uid}|${DEV}|${manifestKey.split("|")[0]}|manifest|0|0|1`);
    const body = await open(dev!, new Uint8Array(blob as Uint8Array), aad);
    expect(() => JSON.parse(dec.decode(body))).toThrow();
  });
});

describe("the sealed record is never sent", () => {
  it("enrol, unlock, disable and forget make no network request (fetch throws if called)", async () => {
    const auth = fakeAuthenticator();
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("a", 1));
    await enrollPasskeySeal(uid, DEV, deps(auth));
    clearPasskeyUnlockedSession(uid);
    await unlockWithPasskey(uid, deps(auth));
    clearPasskeyUnlockedSession(uid);
    await disablePasskeySeal(uid, DEV, { unsyncedCount: 0, confirmed: false }, deps(auth));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("app facade (default navigator.credentials, trusted device from the server check)", () => {
  it("enrol and unlock through the facade seal the data, and the only request is the trusted-device read", async () => {
    const auth = fakeAuthenticator();
    Object.defineProperty(navigator, "credentials", { value: auth.credentials, configurable: true });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("/api/auth/device-current")) return { ok: true, status: 200, json: async () => ({ id: DEV }) };
        return { ok: false, status: 500, json: async () => ({}) }; // a drain that starts after unlock is held back, not sent
      }),
    );
    try {
      const box = createOutboxStore(uid, DEV);
      await box.put(entry("a", 1));
      await box.put(entry("b", 2));
      await expect(facadeEnable(uid)).resolves.toEqual({ ok: true, rewritten: 2 });
      expect((await rawRecords(uid)).every((x) => isDouble(x.value))).toBe(true);
      expect(calls.every((u) => u.includes("/api/auth/device-current"))).toBe(true);

      clearPasskeyUnlockedSession(uid);
      await expect(box.list()).rejects.toBeInstanceOf(PasskeyLockedError);
      await expect(facadeUnlock(uid)).resolves.toEqual({ ok: true });
      stopLocalWriteQueue();
      expect((await box.list()).map((e) => e.opId).sort()).toEqual(["a", "b"]);
      // unlock reads the device id from the record: the only device-current request is the enrolment's
      expect(calls.filter((u) => u.includes("/api/auth/device-current")).length).toBe(1);
    } finally {
      delete (navigator as { credentials?: unknown }).credentials;
    }
  });

  it("an interrupted enrolment is finished by the facade unlock (record sealed = false)", async () => {
    const auth = fakeAuthenticator();
    Object.defineProperty(navigator, "credentials", { value: auth.credentials, configurable: true });
    try {
      const box = createOutboxStore(uid, DEV);
      await box.put(entry("a", 1));
      await enablePasskeyUnlock(uid, deps(auth), DEV); // record step only
      clearPasskeyUnlockedSession(uid);
      await expect(facadeUnlock(uid)).resolves.toEqual({ ok: true });
      stopLocalWriteQueue();
      expect((await readPasskeyUnlockRecord(uid))!.sealed).toBe(true);
      expect((await rawRecords(uid)).every((x) => isDouble(x.value))).toBe(true);
    } finally {
      delete (navigator as { credentials?: unknown }).credentials;
    }
  });
});
