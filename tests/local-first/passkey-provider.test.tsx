// @vitest-environment jsdom
// The data provider's untrust branch wipes the passkey record with the offline copy it protects.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomBytes, createHash, createHmac } from "node:crypto";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { DataProvider } from "@/lib/data/provider";
import { setSessionInfo } from "@/lib/data/session-info";
import { enrollPasskeySeal } from "@/lib/local-first/crypto/passkey-lifecycle";
import { readPasskeyUnlockRecord, clearPasskeyUnlockedSession, type PasskeyDeps } from "@/lib/local-first/crypto/passkey-unlock";
import { createOutboxStore, countOutboxRecords } from "@/lib/local-first/write-path/outbox-store";
import { wipeAll } from "@/lib/local-first/read-cache/persist-store";
import type { OutboxEntry } from "@/lib/local-first/write-path/types";

const DEV = "dev-provider-1";
let n = 0;
let uid = "";

function fakeCredentials() {
  const prfSecret = randomBytes(32);
  const credentialId = randomBytes(32);
  const prf = (salt: Uint8Array) => {
    const input = createHash("sha256").update(Buffer.concat([Buffer.from("WebAuthn PRF\0"), Buffer.from(salt)])).digest();
    return createHmac("sha256", prfSecret).update(input).digest();
  };
  const ab = (u: Uint8Array): ArrayBuffer => new Uint8Array(u).buffer;
  return {
    create: vi.fn(async () => ({ rawId: ab(credentialId), getClientExtensionResults: () => ({ prf: { enabled: true } }) })),
    get: vi.fn(async (o: unknown) => {
      const req = o as { publicKey: { extensions: { prf: { eval: { first: Uint8Array } } } } };
      const salt = new Uint8Array(req.publicKey.extensions.prf.eval.first);
      return { getClientExtensionResults: () => ({ prf: { results: { first: ab(new Uint8Array(prf(salt))) } } }) };
    }),
  };
}

const entry = (opId: string): OutboxEntry => ({
  opId, kind: "create", rowId: `local-${opId}`, serverId: null, fields: { payee: "p", amount: -5 }, fieldHlc: {},
  base: {}, createdAt: 1, attempts: 0, nextAttemptAt: 0, firstSendAt: null, status: "pending", failReason: null,
});

beforeEach(() => {
  uid = `prov-user-${++n}-${Date.now()}`;
  window.localStorage.clear();
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  setSessionInfo(null);
  clearPasskeyUnlockedSession();
  await wipeAll();
});

describe("untrusted device", () => {
  it("the data provider wipes this user's passkey record when the device is not trusted", async () => {
    const credentials = fakeCredentials();
    const deps: PasskeyDeps = { credentials: credentials as unknown as PasskeyDeps["credentials"], rpId: "localhost" };
    await createOutboxStore(uid, DEV).put(entry("a"));
    expect((await enrollPasskeySeal(uid, DEV, deps)).ok).toBe(true);
    expect(await readPasskeyUnlockRecord(uid)).not.toBeNull();

    // The server says this browser is not a trusted device for the user.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/auth/device-current")) return { ok: true, status: 200, json: async () => ({ id: null }) };
        throw new Error(`unexpected request: ${String(url)}`);
      }),
    );
    clearPasskeyUnlockedSession(uid);
    setSessionInfo({ userId: uid, locked: false });
    render(<DataProvider><div>child</div></DataProvider>);

    for (let i = 0; i < 200 && (await readPasskeyUnlockRecord(uid)) !== null; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(await readPasskeyUnlockRecord(uid)).toBeNull();
    // The outbox the record protected is gone with it (the untrust branch wipes both).
    for (let i = 0; i < 200 && (await countOutboxRecords(uid)) !== 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(await countOutboxRecords(uid)).toBe(0);
  });
});
