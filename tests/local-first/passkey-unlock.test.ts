// @vitest-environment jsdom
// Passkey unlock for the on-device copy. Fake navigator.credentials with PRF; fake-indexeddb as the browser store.
// Node's own crypto is the second implementation for the HKDF / AES-GCM vectors.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash, createHmac, randomBytes, hkdfSync, createCipheriv } from "node:crypto";
import {
  enablePasskeyUnlock,
  unlockWithPasskey,
  disablePasskeyUnlock,
  getPasskeyUnlockStatus,
  readPasskeyUnlockRecord,
  wipePasskeyUnlock,
  wipeAllPasskeyUnlocks,
  deriveWrapKey,
  recordAad,
  isPasskeyUnlockFlagOn,
  hasPasskeyUnlockedSession,
  clearPasskeyUnlockedSession,
  passkeyDbName,
  PASSKEY_UNLOCK_KEY,
  WRAP_INFO_PREFIX,
  type PasskeyDeps,
} from "@/lib/local-first/crypto/passkey-unlock";
import { seal, open, AuthError } from "@/lib/local-first/crypto/aead";
import { deviceKeys } from "@/lib/local-first/crypto/device-key-provider";
import { rotateOnDeviceKeys } from "@/lib/local-first/crypto/rotation";
import { createOutboxStore } from "@/lib/local-first/write-path/outbox-store";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";

const enc = new TextEncoder();
const DEV = "dev-passkey";
let n = 0;
let uid = "";
const ab = (u: Uint8Array): ArrayBuffer => new Uint8Array(u).buffer;

/** Fake platform authenticator. PRF = HMAC(secret, SHA256("WebAuthn PRF\0" || salt)), like SoftAuthenticator. */
function fakeAuthenticator(opts: { createPrf?: boolean; getPrf?: boolean; caps?: boolean } = {}) {
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
      return {
        rawId: ab(credentialId),
        getClientExtensionResults: () => (opts.createPrf === false ? { prf: { enabled: false } } : { prf: { enabled: true } }),
      };
    }),
    get: vi.fn(async (o: unknown) => {
      calls.get.push(o);
      const req = o as { publicKey: { allowCredentials: { id: Uint8Array }[]; extensions: { prf: { eval: { first: Uint8Array } } } } };
      if (state.mode === "cancel") throw new DOMException("cancelled", "NotAllowedError");
      if (!req.publicKey.allowCredentials.some((c) => Buffer.from(c.id).equals(credentialId))) throw new DOMException("no credential", "NotAllowedError");
      if (opts.getPrf === false) return { getClientExtensionResults: () => ({}) };
      const salt = new Uint8Array(req.publicKey.extensions.prf.eval.first);
      const out = prf(salt, state.mode === "wrongPrf" ? randomBytes(32) : prfSecret);
      return { getClientExtensionResults: () => ({ prf: { results: { first: ab(new Uint8Array(out)) } } }) };
    }),
  };
  return { credentials, state, calls, prf, credentialId };
}

function deps(auth: ReturnType<typeof fakeAuthenticator>): PasskeyDeps {
  return { credentials: auth.credentials as unknown as PasskeyDeps["credentials"], rpId: "localhost" };
}

const entry = (opId: string, at = 1): OutboxEntry => ({
  opId, kind: "create", rowId: `local-${opId}`, serverId: null, fields: { payee: `p-${opId}`, amount: -5 }, fieldHlc: {},
  base: {}, createdAt: at, attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  uid = `pk-user-${++n}-${Date.now()}`;
  fetchSpy = vi.fn(() => {
    throw new Error("network must not be used by passkey unlock");
  });
  vi.stubGlobal("fetch", fetchSpy);
  window.localStorage.clear();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  clearPasskeyUnlockedSession();
  delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  await wipeAll();
});

describe("flag", () => {
  it("off by default; only the exact value \"1\" turns it on", () => {
    expect(isPasskeyUnlockFlagOn()).toBe(false);
    window.localStorage.setItem(PASSKEY_UNLOCK_KEY, "true");
    expect(isPasskeyUnlockFlagOn()).toBe(false);
    window.localStorage.setItem(PASSKEY_UNLOCK_KEY, "1");
    expect(isPasskeyUnlockFlagOn()).toBe(true);
  });
});

describe("HKDF and wrap vectors (independent Node implementation)", () => {
  const prfFixed = new Uint8Array(32).fill(0x11);
  const userFixed = "vector-user-1";

  it("the wrap key matches Node's HKDF-SHA-256 (empty salt, info = prefix + userId) and is non-extractable", async () => {
    const key = await deriveWrapKey(prfFixed, userFixed);
    expect(key.extractable).toBe(false);
    expect(key.usages.sort()).toEqual(["decrypt", "encrypt"]);
    expect(WRAP_INFO_PREFIX).toBe("finlynq-lf-passkey-wrap-v1");
    // Node derives the same key bytes; a sealed value made with them must open under the WebCrypto key.
    const nodeKey = Buffer.from(hkdfSync("sha256", prfFixed, Buffer.alloc(0), Buffer.from(WRAP_INFO_PREFIX + userFixed), 32));
    expect(nodeKey.toString("hex")).toBe("9d4dfa76f170eb058bcb984d2ed530d8dbe0e8ffc1428daa0608ff6527b31803");
  });

  it("a sealed value produced by Node AES-256-GCM opens under the WebCrypto wrap key with the record AAD", async () => {
    const key = await deriveWrapKey(prfFixed, userFixed);
    const credId = new Uint8Array(32).fill(0x33);
    const nonce = Buffer.alloc(12, 0x22);
    const nodeKey = Buffer.from(hkdfSync("sha256", prfFixed, Buffer.alloc(0), Buffer.from(WRAP_INFO_PREFIX + userFixed), 32));
    const aad = recordAad(userFixed, credId);
    expect(Buffer.from(aad).toString()).toBe("finlynq-lf-passkey-record|v1|vector-user-1|" + Buffer.from(credId).toString());
    const ci = createCipheriv("aes-256-gcm", nodeKey, nonce);
    ci.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([ci.update(Buffer.alloc(32, 0x44)), ci.final()]);
    const sealedNode = new Uint8Array(Buffer.concat([nonce, ct, ci.getAuthTag()]));
    expect(sealedNode.length).toBe(12 + 32 + 16);
    const plain = await open(key, sealedNode, aad);
    expect(Buffer.from(plain).equals(Buffer.alloc(32, 0x44))).toBe(true);
    // round trip through our own seal() with the same key
    const mine = await seal(key, plain, aad);
    expect(Buffer.from(await open(key, mine, aad)).equals(Buffer.alloc(32, 0x44))).toBe(true);
  });

  it("the wrap is bound to the user and the credential: other user or other credential id does not open it", async () => {
    const key = await deriveWrapKey(prfFixed, userFixed);
    const sealed = await seal(key, enc.encode("secret"), recordAad(userFixed, new Uint8Array(32).fill(1)));
    await expect(open(key, sealed, recordAad("someone-else", new Uint8Array(32).fill(1)))).rejects.toBeInstanceOf(AuthError);
    await expect(open(key, sealed, recordAad(userFixed, new Uint8Array(32).fill(2)))).rejects.toBeInstanceOf(AuthError);
    const otherUserKey = await deriveWrapKey(prfFixed, "someone-else");
    await expect(open(otherUserKey, sealed, recordAad(userFixed, new Uint8Array(32).fill(1)))).rejects.toBeInstanceOf(AuthError);
  });
});

describe("enable", () => {
  it("happy path: creates a local platform credential with PRF, stores only wrapped material, sends nothing", async () => {
    const auth = fakeAuthenticator();
    const r = await enablePasskeyUnlock(uid, deps(auth));
    expect(r).toEqual({ ok: true });
    type CreateOpts = { publicKey: { rp: { id: string }; authenticatorSelection: Record<string, unknown>; extensions: unknown } };
    type GetOpts = { publicKey: { userVerification: string; allowCredentials: { type: string; id: Uint8Array }[]; extensions: { prf: { eval: { first: Uint8Array } } } } };
    const create = auth.calls.create[0] as CreateOpts;
    expect(create.publicKey.authenticatorSelection).toMatchObject({ userVerification: "required", authenticatorAttachment: "platform", residentKey: "preferred" });
    expect(create.publicKey.rp.id).toBe("localhost");
    expect(create.publicKey.extensions).toEqual({ prf: {} });
    const get = auth.calls.get[0] as GetOpts;
    expect(get.publicKey.userVerification).toBe("required");
    expect(get.publicKey.allowCredentials[0].type).toBe("public-key");

    const rec = await readPasskeyUnlockRecord(uid);
    expect(rec).not.toBeNull();
    expect(rec!.v).toBe(1);
    expect(rec!.wrapped.length).toBe(12 + 32 + 16); // nonce + 32-byte secret + tag
    // the PRF output and the unlock secret are not in the stored bytes
    const prfOut = Buffer.from(auth.prf(new Uint8Array(get.publicKey.extensions.prf.eval.first)));
    expect(Buffer.from(rec!.wrapped).includes(prfOut)).toBe(false);
    expect(Buffer.from(rec!.prfSalt).equals(Buffer.from(get.publicKey.extensions.prf.eval.first))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const st = await getPasskeyUnlockStatus(uid, deps(auth));
    expect(st).toMatchObject({ supported: true, enabled: true });
    expect(typeof st.createdAt).toBe("number");
  });

  it("the record lives in its own per-user database (name holds a hash, not the userId)", async () => {
    await enablePasskeyUnlock(uid, deps(fakeAuthenticator()));
    const name = await passkeyDbName(uid);
    expect(name).toMatch(/^finlynq-lf-passkey-v1-[0-9a-f]{16}$/);
    expect(name.includes(uid)).toBe(false);
    expect((await indexedDB.databases()).map((d) => d.name)).toContain(name);
  });

  it("PRF refused at creation: stays off, returns unsupported, nothing stored, no throw", async () => {
    const auth = fakeAuthenticator({ createPrf: false });
    await expect(enablePasskeyUnlock(uid, deps(auth))).resolves.toEqual({ ok: false, code: "unsupported" });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    expect((await getPasskeyUnlockStatus(uid, deps(auth))).enabled).toBe(false);
  });

  it("PRF missing at assertion: stays off, returns unsupported, nothing stored", async () => {
    const auth = fakeAuthenticator({ getPrf: false });
    await expect(enablePasskeyUnlock(uid, deps(auth))).resolves.toEqual({ ok: false, code: "unsupported" });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
  });

  it("browser reports prf unsupported via getClientCapabilities: no credential is created at all", async () => {
    (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential = {
      getClientCapabilities: async () => ({ "extension:prf": false }),
    };
    const auth = fakeAuthenticator();
    await expect(enablePasskeyUnlock(uid, deps(auth))).resolves.toEqual({ ok: false, code: "unsupported" });
    expect(auth.credentials.create).not.toHaveBeenCalled();
  });

  it("no navigator.credentials: unsupported, no throw", async () => {
    await expect(enablePasskeyUnlock(uid, { credentials: undefined, rpId: "localhost" })).resolves.toEqual({ ok: false, code: "unsupported" });
  });

  it("a cancelled creation prompt stores nothing and reports cancelled", async () => {
    const auth = fakeAuthenticator();
    auth.credentials.create.mockImplementationOnce(async () => {
      throw new DOMException("cancelled", "NotAllowedError");
    });
    await expect(enablePasskeyUnlock(uid, deps(auth))).resolves.toEqual({ ok: false, code: "cancelled" });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
  });
});

describe("unlock", () => {
  it("after enable, the passkey unlocks the in-memory session secret; nothing is sent", async () => {
    const auth = fakeAuthenticator();
    await enablePasskeyUnlock(uid, deps(auth));
    const before = Buffer.from((await readPasskeyUnlockRecord(uid))!.wrapped);
    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: true });
    expect(hasPasskeyUnlockedSession(uid)).toBe(true);
    expect(Buffer.from((await readPasskeyUnlockRecord(uid))!.wrapped).equals(before)).toBe(true);
    clearPasskeyUnlockedSession(uid);
    expect(hasPasskeyUnlockedSession(uid)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no record: not_enabled", async () => {
    await expect(unlockWithPasskey(uid, deps(fakeAuthenticator()))).resolves.toEqual({ ok: false, code: "not_enabled" });
  });

  it("wrong assertion (different PRF): wrong_passkey, the record and queued writes are untouched", async () => {
    const auth = fakeAuthenticator();
    await enablePasskeyUnlock(uid, deps(auth));
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("queued-1", 1));
    const before = Buffer.from((await readPasskeyUnlockRecord(uid))!.wrapped);

    auth.state.mode = "wrongPrf";
    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: false, code: "wrong_passkey" });
    expect(hasPasskeyUnlockedSession(uid)).toBe(false);
    expect(Buffer.from((await readPasskeyUnlockRecord(uid))!.wrapped).equals(before)).toBe(true);
    expect((await box.list()).map((e) => e.opId)).toEqual(["queued-1"]);
  });

  it("cancelled assertion: cancelled, the record and queued writes are untouched", async () => {
    const auth = fakeAuthenticator();
    await enablePasskeyUnlock(uid, deps(auth));
    const box = createOutboxStore(uid, DEV);
    await box.put(entry("queued-2", 1));
    auth.state.mode = "cancel";
    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: false, code: "cancelled" });
    expect(await readPasskeyUnlockRecord(uid)).not.toBeNull();
    expect((await box.list()).map((e) => e.opId)).toEqual(["queued-2"]);
  });

  it("a passkey that no longer matches the stored credential is refused by the allow-list (cancelled, data intact)", async () => {
    const auth = fakeAuthenticator();
    await enablePasskeyUnlock(uid, deps(auth));
    const other = fakeAuthenticator();
    await expect(unlockWithPasskey(uid, deps(other))).resolves.toEqual({ ok: false, code: "cancelled" });
    expect(await readPasskeyUnlockRecord(uid)).not.toBeNull();
  });
});

describe("disable and wipes", () => {
  it("disable with queued writes is refused until confirmed; confirmed disable deletes the record and its database", async () => {
    const auth = fakeAuthenticator();
    await enablePasskeyUnlock(uid, deps(auth));
    await expect(disablePasskeyUnlock(uid, { unsyncedCount: 2, confirmed: false })).resolves.toEqual({ ok: false, code: "unsynced_blocked" });
    expect(await readPasskeyUnlockRecord(uid)).not.toBeNull();

    await expect(disablePasskeyUnlock(uid, { unsyncedCount: 2, confirmed: true })).resolves.toEqual({ ok: true });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(await passkeyDbName(uid));
    expect((await getPasskeyUnlockStatus(uid, deps(auth))).enabled).toBe(false);
  });

  it("disable with nothing queued deletes without a confirmation", async () => {
    await enablePasskeyUnlock(uid, deps(fakeAuthenticator()));
    await expect(disablePasskeyUnlock(uid, { unsyncedCount: 0, confirmed: false })).resolves.toEqual({ ok: true });
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
  });

  it("a per-user wipe removes the record and the in-memory secret", async () => {
    const auth = fakeAuthenticator();
    await enablePasskeyUnlock(uid, deps(auth));
    await unlockWithPasskey(uid, deps(auth));
    await wipePasskeyUnlock(uid);
    expect(hasPasskeyUnlockedSession(uid)).toBe(false);
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
  });

  it("a browser that never enrolled a passkey does no IndexedDB work on wipe", async () => {
    const open = vi.spyOn(indexedDB, "open");
    const dbs = vi.spyOn(indexedDB, "databases");
    await wipePasskeyUnlock(uid);
    await wipeAllPasskeyUnlocks();
    expect(open).not.toHaveBeenCalled();
    expect(dbs).not.toHaveBeenCalled();
    open.mockRestore();
    dbs.mockRestore();
  });

  it("the all-users wipe (signed-out boot) removes every passkey database on the browser", async () => {
    const a = `${uid}-a`;
    const b = `${uid}-b`;
    await enablePasskeyUnlock(a, deps(fakeAuthenticator()));
    await enablePasskeyUnlock(b, deps(fakeAuthenticator()));
    await wipeAllPasskeyUnlocks();
    expect(await readPasskeyUnlockRecord(a)).toBeNull();
    expect(await readPasskeyUnlockRecord(b)).toBeNull();
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain(await passkeyDbName(a));
    expect(names).not.toContain(await passkeyDbName(b));
  });
});

describe("key rotation coexists with passkey state", () => {
  it("rotating the device key leaves the passkey record byte-identical and the unlock still works", async () => {
    const auth = fakeAuthenticator();
    await deviceKeys.getOrCreateDeviceKey(uid);
    await enablePasskeyUnlock(uid, deps(auth));
    const before = Buffer.from((await readPasskeyUnlockRecord(uid))!.wrapped);

    const box = createOutboxStore(uid, DEV);
    await box.put(entry("kept", 1));
    const report = await rotateOnDeviceKeys(uid, { outbox: box, clearSnapshot: async () => undefined });
    expect(report.rotated).toBe(true);
    expect(report.outboxResealed).toBe(1);

    expect(Buffer.from((await readPasskeyUnlockRecord(uid))!.wrapped).equals(before)).toBe(true);
    await expect(unlockWithPasskey(uid, deps(auth))).resolves.toEqual({ ok: true });
    expect((await box.list()).map((e) => e.opId)).toEqual(["kept"]);
  });
});
