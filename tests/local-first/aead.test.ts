import { describe, it, expect } from "vitest";
import {
  AuthError,
  MIN_SEALED_BYTES,
  NONCE_BYTES,
  TAG_BYTES,
  open,
  seal,
} from "@/lib/local-first/crypto/aead";

const enc = new TextEncoder();

async function newKey(fill = 7): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    new Uint8Array(32).fill(fill),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

describe("aead", () => {
  it("round trips with and without AAD; layout is nonce|ct|tag", async () => {
    const key = await newKey();
    const pt = enc.encode("some plaintext");
    const aad = enc.encode("header-bytes");
    const withAad = await seal(key, pt, aad);
    expect(withAad.length).toBe(NONCE_BYTES + pt.length + TAG_BYTES);
    expect(NONCE_BYTES).toBe(12);
    expect(TAG_BYTES).toBe(16);
    expect(await open(key, withAad, aad)).toEqual(pt);
    const noAad = await seal(key, pt);
    expect(await open(key, noAad)).toEqual(pt);
    expect(await open(key, await seal(key, new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it("ciphertext does not contain the plaintext", async () => {
    const key = await newKey();
    const pt = enc.encode("AAAAAAAAAAAAAAAAAAAAAAAA");
    const sealed = await seal(key, pt);
    expect(Buffer.from(sealed).includes(Buffer.from(pt))).toBe(false);
  });

  it("tampering with any ciphertext byte gives AuthError", async () => {
    const key = await newKey();
    const sealed = await seal(key, enc.encode("payload"), enc.encode("aad"));
    const i = NONCE_BYTES + 2;
    const bad = sealed.slice();
    bad[i] ^= 1;
    await expect(open(key, bad, enc.encode("aad"))).rejects.toBeInstanceOf(AuthError);
  });

  it("tampering with the tag gives AuthError", async () => {
    const key = await newKey();
    const sealed = await seal(key, enc.encode("payload"), enc.encode("aad"));
    const bad = sealed.slice();
    bad[bad.length - 1] ^= 1;
    await expect(open(key, bad, enc.encode("aad"))).rejects.toBeInstanceOf(AuthError);
  });

  it("tampering with the nonce gives AuthError", async () => {
    const key = await newKey();
    const sealed = await seal(key, enc.encode("payload"));
    const bad = sealed.slice();
    bad[0] ^= 1;
    await expect(open(key, bad)).rejects.toBeInstanceOf(AuthError);
  });

  it("wrong, extra or missing AAD gives AuthError", async () => {
    const key = await newKey();
    const sealed = await seal(key, enc.encode("payload"), enc.encode("aad-1"));
    await expect(open(key, sealed, enc.encode("aad-2"))).rejects.toBeInstanceOf(AuthError);
    await expect(open(key, sealed)).rejects.toBeInstanceOf(AuthError);
    const noAad = await seal(key, enc.encode("payload"));
    await expect(open(key, noAad, enc.encode("aad-1"))).rejects.toBeInstanceOf(AuthError);
  });

  it("wrong key gives AuthError; short input gives AuthError", async () => {
    const sealed = await seal(await newKey(7), enc.encode("payload"));
    await expect(open(await newKey(8), sealed)).rejects.toBeInstanceOf(AuthError);
    await expect(open(await newKey(7), new Uint8Array(MIN_SEALED_BYTES - 1))).rejects.toBeInstanceOf(AuthError);
  });

  it("inputs of 28 and 27 bytes reject with AuthError", async () => {
    const key = await newKey();
    await expect(open(key, new Uint8Array(28))).rejects.toBeInstanceOf(AuthError);
    await expect(open(key, new Uint8Array(27))).rejects.toBeInstanceOf(AuthError);
  });

  it("AuthError carries no detail", async () => {
    const key = await newKey();
    const sealed = await seal(key, enc.encode("secret"), enc.encode("aad"));
    sealed[sealed.length - 1] ^= 1;
    const err = await open(key, sealed, enc.encode("aad")).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.name).toBe("AuthError");
    expect(err.message).toBe("authentication failed");
    expect(err.cause).toBeUndefined();
  });

  it("nonces: 12 bytes, 100k encryptions give 100k unique nonces", async () => {
    const key = await newKey();
    const empty = new Uint8Array(0);
    const seen = new Set<string>();
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const sealed = await seal(key, empty);
      expect(sealed.length).toBe(MIN_SEALED_BYTES);
      let h = "";
      for (let j = 0; j < NONCE_BYTES; j++) h += sealed[j].toString(16).padStart(2, "0");
      seen.add(h);
    }
    expect(seen.size).toBe(N);
  }, 120_000);

  it("same plaintext sealed twice gives different outputs", async () => {
    const key = await newKey();
    const a = await seal(key, enc.encode("x"));
    const b = await seal(key, enc.encode("x"));
    expect(Buffer.from(a).toString("hex")).not.toBe(Buffer.from(b).toString("hex"));
  });
});
