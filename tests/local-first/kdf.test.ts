import { describe, it, expect } from "vitest";
import { argon2id } from "@noble/hashes/argon2.js";
import {
  ARGON2_SET_A,
  HKDF_INFO_OPLOG,
  HKDF_INFO_SNAPSHOT,
  deriveKeysFromPassphrase,
  deriveRootKey,
  deriveLogKeys,
  type Argon2Params,
} from "@/lib/local-first/crypto/kdf";
import { open, seal, AuthError } from "@/lib/local-first/crypto/aead";
import { DevPassphraseKeyProvider } from "@/lib/local-first/crypto/key-provider";

const TINY: Argon2Params = { m: 64, t: 1, p: 1, dkLen: 32 };
const SALT_A = new Uint8Array(16).map((_, i) => i + 1);
const SALT_B = new Uint8Array(16).map((_, i) => i + 101);
const enc = new TextEncoder();
const PT = enc.encode("hello local-first");

/** Independent HKDF in the test, extractable only so the test can build the expected key. */
async function expectedKey(root: Uint8Array, logId: string, info: string): Promise<CryptoKey> {
  const s = globalThis.crypto.subtle;
  const base = await s.importKey("raw", root as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await s.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(logId), info: enc.encode(info) },
    base,
    256,
  );
  return s.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
}

describe("kdf: Argon2id root", () => {
  it("default parameter constant equals D2 set A", () => {
    expect(ARGON2_SET_A).toEqual({ m: 19456, t: 2, p: 1, dkLen: 32 });
    expect(Object.isFrozen(ARGON2_SET_A)).toBe(true);
  });

  it("deriveRootKey with no params uses the D2 default set A", () => {
    const def = deriveRootKey("pw", SALT_A);
    const direct = argon2id(enc.encode("pw"), SALT_A, { m: 19456, t: 2, p: 1, dkLen: 32 });
    expect(Buffer.from(def).toString("hex")).toBe(Buffer.from(direct).toString("hex"));
  }, 60_000);

  it("is deterministic for a fixed salt and matches a direct noble call", () => {
    const a = deriveRootKey("correct horse", SALT_A, TINY);
    const b = deriveRootKey("correct horse", SALT_A, TINY);
    expect(a.length).toBe(32);
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(b).toString("hex"));
    const direct = argon2id(enc.encode("correct horse"), SALT_A, { m: 64, t: 1, p: 1, dkLen: 32 });
    expect(Buffer.from(a).toString("hex")).toBe(Buffer.from(direct).toString("hex"));
  });

  it("a different salt gives a different key; a different passphrase too", () => {
    const a = Buffer.from(deriveRootKey("pw", SALT_A, TINY)).toString("hex");
    expect(Buffer.from(deriveRootKey("pw", SALT_B, TINY)).toString("hex")).not.toBe(a);
    expect(Buffer.from(deriveRootKey("pw2", SALT_A, TINY)).toString("hex")).not.toBe(a);
  });

  it("associated data (personalization slot) changes the key", () => {
    const a = Buffer.from(deriveRootKey("pw", SALT_A, TINY)).toString("hex");
    const b = Buffer.from(deriveRootKey("pw", SALT_A, TINY, enc.encode("ad"))).toString("hex");
    expect(b).not.toBe(a);
  });

  it("rejects empty passphrase and short salt", () => {
    expect(() => deriveRootKey("", SALT_A, TINY)).toThrow();
    expect(() => deriveRootKey("pw", new Uint8Array(4), TINY)).toThrow();
    expect(() => deriveRootKey("pw", new Uint8Array(15), TINY)).toThrow();
    expect(() => deriveRootKey("pw", new Uint8Array(16), TINY)).not.toThrow();
  });
});

describe("kdf: HKDF subkeys", () => {
  it("keys are non-extractable AES-GCM-256 with encrypt/decrypt usages", async () => {
    const { oplogKey, snapshotKey } = await deriveKeysFromPassphrase("pw", SALT_A, "log-1", TINY);
    for (const k of [oplogKey, snapshotKey]) {
      expect(k.extractable).toBe(false);
      expect(k.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
      expect([...k.usages].sort()).toEqual(["decrypt", "encrypt"]);
      await expect(globalThis.crypto.subtle.exportKey("raw", k)).rejects.toThrow();
      await expect(globalThis.crypto.subtle.exportKey("jwk", k)).rejects.toThrow();
    }
  });

  it("oplog and snapshot subkeys differ (cross-decrypt fails)", async () => {
    const { oplogKey, snapshotKey } = await deriveKeysFromPassphrase("pw", SALT_A, "log-1", TINY);
    const sealed = await seal(oplogKey, PT);
    await expect(open(snapshotKey, sealed)).rejects.toBeInstanceOf(AuthError);
    const sealed2 = await seal(snapshotKey, PT);
    await expect(open(oplogKey, sealed2)).rejects.toBeInstanceOf(AuthError);
  });

  it("each subkey equals an independently derived HKDF key with the documented info string", async () => {
    expect(HKDF_INFO_OPLOG).toBe("finlynq/lf/oplog/v1");
    expect(HKDF_INFO_SNAPSHOT).toBe("finlynq/lf/snapshot/v1");
    const root = deriveRootKey("pw", SALT_A, TINY);
    const { oplogKey, snapshotKey } = await deriveLogKeys(root, "log-1");
    const expOp = await expectedKey(root, "log-1", "finlynq/lf/oplog/v1");
    const expSn = await expectedKey(root, "log-1", "finlynq/lf/snapshot/v1");
    expect(await open(expOp, await seal(oplogKey, PT))).toEqual(PT);
    expect(await open(expSn, await seal(snapshotKey, PT))).toEqual(PT);
    await expect(open(expSn, await seal(oplogKey, PT))).rejects.toBeInstanceOf(AuthError);
    await expect(open(expOp, await seal(snapshotKey, PT))).rejects.toBeInstanceOf(AuthError);
  });

  it("same inputs give the same keys; different logId or kdf salt gives different keys", async () => {
    const k1 = await deriveKeysFromPassphrase("pw", SALT_A, "log-1", TINY);
    const k2 = await deriveKeysFromPassphrase("pw", SALT_A, "log-1", TINY);
    const kLog = await deriveKeysFromPassphrase("pw", SALT_A, "log-2", TINY);
    const kSalt = await deriveKeysFromPassphrase("pw", SALT_B, "log-1", TINY);
    const sealed = await seal(k1.oplogKey, PT);
    expect(await open(k2.oplogKey, sealed)).toEqual(PT);
    await expect(open(kLog.oplogKey, sealed)).rejects.toBeInstanceOf(AuthError);
    await expect(open(kSalt.oplogKey, sealed)).rejects.toBeInstanceOf(AuthError);
  });
});

describe("DevPassphraseKeyProvider", () => {
  it("derives different keys per logId", async () => {
    const p1 = new DevPassphraseKeyProvider({ passphrase: "pw", salt: SALT_A, params: TINY });
    const a = await p1.getKeys("L1");
    const b = await p1.getKeys("L2");
    await expect(open(b.oplogKey, await seal(a.oplogKey, PT))).rejects.toBeInstanceOf(AuthError);
  });

  it("generates a random 16-byte salt and reproduces keys from the persisted salt", async () => {
    const p1 = new DevPassphraseKeyProvider({ passphrase: "pw", params: TINY });
    const p2 = new DevPassphraseKeyProvider({ passphrase: "pw", params: TINY });
    expect(p1.salt.length).toBe(16);
    expect(Buffer.from(p1.salt).toString("hex")).not.toBe(Buffer.from(p2.salt).toString("hex"));
    const again = new DevPassphraseKeyProvider({ passphrase: "pw", salt: p1.salt, params: TINY });
    const sealed = await seal((await p1.getKeys("L")).oplogKey, PT);
    expect(await open((await again.getKeys("L")).oplogKey, sealed)).toEqual(PT);
    expect(await p1.getKeys("L")).toBe(await p1.getKeys("L"));
  });

  it("rejects empty passphrase and wrong salt length", () => {
    expect(() => new DevPassphraseKeyProvider({ passphrase: "" })).toThrow();
    expect(() => new DevPassphraseKeyProvider({ passphrase: "pw", salt: new Uint8Array(8) })).toThrow();
  });
});
