// On-device snapshot key (L2b). fake-indexeddb stands in for the browser IndexedDB.
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { IdbDeviceKeyProvider, deviceKeyDbName } from "@/lib/local-first/crypto/device-key-provider";
import { seal, open, AuthError } from "@/lib/local-first/crypto/aead";

const enc = new TextEncoder();
const provider = new IdbDeviceKeyProvider();
let n = 0;
const uid = () => `device-key-user-${++n}-${Date.now()}`;

describe("device key provider", () => {
  it("the key is non-extractable: exportKey rejects", async () => {
    const key = await provider.getOrCreateDeviceKey(uid());
    expect(key.extractable).toBe(false);
    expect(key.algorithm.name).toBe("AES-GCM");
    await expect(globalThis.crypto.subtle.exportKey("raw", key)).rejects.toBeTruthy();
  });

  it("is stable across calls: the same stored key decrypts what an earlier call sealed", async () => {
    const userId = uid();
    const a = await provider.getOrCreateDeviceKey(userId);
    const b = await provider.getOrCreateDeviceKey(userId);
    const c = await provider.findDeviceKey(userId);
    expect(c).not.toBeNull();
    const sealed = await seal(a, enc.encode("stable"));
    expect(new TextDecoder().decode(await open(b, sealed))).toBe("stable");
    expect(new TextDecoder().decode(await open(c as CryptoKey, sealed))).toBe("stable");
  });

  it("concurrent first calls agree on one key", async () => {
    const userId = uid();
    const [a, b] = await Promise.all([provider.getOrCreateDeviceKey(userId), provider.getOrCreateDeviceKey(userId)]);
    const sealed = await seal(a, enc.encode("race"));
    expect(new TextDecoder().decode(await open(b, sealed))).toBe("race");
  });

  it("per-user isolation: user B's key cannot open user A's ciphertext, and the DB names differ", async () => {
    const userA = uid();
    const userB = uid();
    const ka = await provider.getOrCreateDeviceKey(userA);
    const kb = await provider.getOrCreateDeviceKey(userB);
    const sealed = await seal(ka, enc.encode("only A"));
    await expect(open(kb, sealed)).rejects.toBeInstanceOf(AuthError);
    expect(await deviceKeyDbName(userA)).not.toBe(await deviceKeyDbName(userB));
  });

  it("uses its own database name, distinct from the persist.ts cache prefix", async () => {
    const name = await deviceKeyDbName(uid());
    expect(name).toMatch(/^finlynq-lf-key-v1-[0-9a-f]{16}$/);
    expect(name.startsWith("finlynq-cache-v1-")).toBe(false);
  });

  it("delete works: the key is gone, and a new key cannot open old ciphertext", async () => {
    const userId = uid();
    const old = await provider.getOrCreateDeviceKey(userId);
    const sealed = await seal(old, enc.encode("before delete"));
    await provider.deleteDeviceKey(userId);
    expect(await provider.findDeviceKey(userId)).toBeNull();
    const fresh = await provider.getOrCreateDeviceKey(userId);
    await expect(open(fresh, sealed)).rejects.toBeInstanceOf(AuthError);
    const dbs = (await indexedDB.databases()).map((d) => d.name);
    expect(dbs).toContain(await deviceKeyDbName(userId));
  });

  it("deleting an unknown user's key is a no-op", async () => {
    await expect(provider.deleteDeviceKey(uid())).resolves.toBeUndefined();
  });
});
