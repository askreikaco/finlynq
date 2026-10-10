// Sealed read-cache snapshot codec (L2b). Pure: no IndexedDB. Synthetic rows only.
import { describe, it, expect } from "vitest";
import { AuthError, NONCE_BYTES } from "@/lib/local-first/crypto/aead";
import {
  CHUNK_ROWS,
  decodeSnapshot,
  encodeSnapshot,
  type SnapshotRows,
} from "@/lib/local-first/read-cache/snapshot-codec";
import type { AccountRow, CategoryRow, TransactionRow } from "@/lib/local-first/store/types";

async function newKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const accounts = (): AccountRow[] => [
  { id: "1", serverId: 1, type: "A", group: "Bank", currency: "CAD", name: "Chequing", archived: false, isInvestment: false, invisible: false },
  { id: "2", serverId: 2, type: "L", group: "Card", currency: "CAD", name: null, archived: true, isInvestment: false, invisible: true },
];
const categories = (): CategoryRow[] => [
  { id: "10", serverId: 10, type: "E", group: "Living", name: "Groceries" },
];
function transactions(n: number): TransactionRow[] {
  const out: TransactionRow[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: String(1000 + i),
      serverId: 1000 + i,
      date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
      accountId: "1",
      categoryId: i % 3 === 0 ? null : "10",
      currency: "CAD",
      amount: -(i % 997) - 0.5,
      enteredCurrency: "CAD",
      enteredAmount: -(i % 997) - 0.5,
      enteredFxRate: 1,
      payee: `payee-${i}`,
      note: i % 2 === 0 ? `note ${i}` : null,
      tags: "",
      linkId: null,
    });
  }
  return out;
}
const rowsOf = (nTx: number): SnapshotRows => ({ accounts: accounts(), categories: categories(), transactions: transactions(nTx) });

const BASE = { userId: "user-a", deviceId: "device-1", build: "build-2026-10-10", schemaVer: 3 };
const T0 = 1_780_000_000_000;

async function sealAll(rows: SnapshotRows, key: CryptoKey, extra: Partial<typeof BASE & { snapshotId: string }> = {}) {
  const opts = { ...BASE, key, now: () => T0, ...extra };
  const enc = await encodeSnapshot(rows, opts);
  return { enc, blobs: [enc.manifestBlob, ...enc.chunkBlobs] };
}

const ctx = (key: CryptoKey, snapshotId: string, extra: Partial<typeof BASE> = {}) => ({ ...BASE, key, snapshotId, ...extra });

function flip(blob: Uint8Array, at: number): Uint8Array {
  const out = blob.slice();
  out[at] ^= 0x01;
  return out;
}

describe("snapshot codec", () => {
  it("round trips the rows exactly", async () => {
    const key = await newKey();
    const rows = rowsOf(7);
    const { enc, blobs } = await sealAll(rows, key);
    expect(enc.createdAt).toBe(T0);
    expect(blobs.length).toBe(1 + 1 + 1 + 1); // manifest, accounts, categories, one transaction chunk
    const back = await decodeSnapshot(blobs, ctx(key, enc.snapshotId));
    expect(back).toEqual(rows);
  });

  it("chunks transactions at CHUNK_ROWS and keeps an empty table as one empty chunk", async () => {
    expect(CHUNK_ROWS).toBe(2000);
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(5000), key);
    // manifest + accounts(1) + categories(1) + transactions(2000, 2000, 1000)
    expect(blobs.length).toBe(1 + 1 + 1 + 3);
    const back = await decodeSnapshot(blobs, ctx(key, enc.snapshotId));
    expect(back.transactions.length).toBe(5000);
    expect(back.transactions).toEqual(transactions(5000));

    const empty = await sealAll({ accounts: [], categories: [], transactions: [] }, key);
    expect(empty.blobs.length).toBe(4);
    expect(await decodeSnapshot(empty.blobs, ctx(key, empty.enc.snapshotId))).toEqual({ accounts: [], categories: [], transactions: [] });
  });

  it("round trips 5k transactions", async () => {
    const key = await newKey();
    const rows = rowsOf(5000);
    const { enc, blobs } = await sealAll(rows, key);
    const back = await decodeSnapshot(blobs, ctx(key, enc.snapshotId));
    expect(back).toEqual(rows);
  }, 60_000);

  it("strips undefined fields so canonical JSON accepts the rows", async () => {
    const key = await newKey();
    const tx = transactions(1);
    const withUndef = [{ ...tx[0], note: undefined, extra: undefined } as unknown as TransactionRow];
    const { enc, blobs } = await sealAll({ accounts: [], categories: [], transactions: withUndef }, key);
    const back = await decodeSnapshot(blobs, ctx(key, enc.snapshotId));
    expect(back.transactions[0]).not.toHaveProperty("extra");
    expect(back.transactions[0]).not.toHaveProperty("note");
  });

  it("every seal uses a fresh random nonce: no repeats across many encodes", async () => {
    const key = await newKey();
    const seen = new Set<string>();
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const { blobs } = await sealAll(rowsOf(3), key, { snapshotId: undefined });
      for (const b of blobs) {
        seen.add(Buffer.from(b.subarray(0, NONCE_BYTES)).toString("hex"));
        total++;
      }
    }
    expect(total).toBe(50 * 4); // manifest + accounts + categories + one transaction chunk
    expect(seen.size).toBe(total);
  });

  it("encoding the same rows twice gives different bytes", async () => {
    const key = await newKey();
    const a = await sealAll(rowsOf(2), key, { snapshotId: "01J0000000000000000000000A" });
    const b = await sealAll(rowsOf(2), key, { snapshotId: "01J0000000000000000000000A" });
    expect(Buffer.from(a.blobs[1]).equals(Buffer.from(b.blobs[1]))).toBe(false);
  });

  it("a fresh snapshotId is a ULID and is the one the caller must present", async () => {
    const key = await newKey();
    const { enc } = await sealAll(rowsOf(1), key);
    expect(enc.snapshotId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("wrong user, device, snapshot, schemaVer or build all throw AuthError", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(3), key);
    const good = ctx(key, enc.snapshotId);
    await expect(decodeSnapshot(blobs, good)).resolves.toBeDefined();
    await expect(decodeSnapshot(blobs, { ...good, userId: "user-b" })).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot(blobs, { ...good, deviceId: "device-2" })).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot(blobs, { ...good, snapshotId: "01J00000000000000000000000" })).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot(blobs, { ...good, schemaVer: 4 })).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot(blobs, { ...good, build: "build-other" })).rejects.toBeInstanceOf(AuthError);
  });

  it("a snapshot encoded with one schemaVer does not decode under another, even with the same AAD inputs", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(2), key, { schemaVer: 5 });
    await expect(decodeSnapshot(blobs, ctx(key, enc.snapshotId, { schemaVer: 6 }))).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot(blobs, ctx(key, enc.snapshotId, { schemaVer: 5 }))).resolves.toBeDefined();
  });

  it("a different key throws AuthError", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(2), key);
    await expect(decodeSnapshot(blobs, ctx(await newKey(), enc.snapshotId))).rejects.toBeInstanceOf(AuthError);
  });

  it("a bit flip in the manifest or in any chunk throws AuthError", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(4500), key);
    for (let i = 0; i < blobs.length; i++) {
      for (const at of [NONCE_BYTES + 1, blobs[i].length - 1, 0]) {
        const bad = blobs.slice();
        bad[i] = flip(blobs[i], at);
        await expect(decodeSnapshot(bad, ctx(key, enc.snapshotId)), `blob ${i} byte ${at}`).rejects.toBeInstanceOf(AuthError);
      }
    }
  });

  it("a missing chunk throws AuthError (last chunk, middle chunk, and the manifest)", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(4500), key);
    const g = ctx(key, enc.snapshotId);
    await expect(decodeSnapshot(blobs.slice(0, -1), g)).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot(blobs.filter((_, i) => i !== 3), g)).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot(blobs.slice(1), g)).rejects.toBeInstanceOf(AuthError);
    await expect(decodeSnapshot([], g)).rejects.toBeInstanceOf(AuthError);
  });

  it("an extra chunk throws AuthError", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(4500), key);
    await expect(decodeSnapshot([...blobs, blobs[blobs.length - 1]], ctx(key, enc.snapshotId))).rejects.toBeInstanceOf(AuthError);
  });

  it("reordered chunks throw AuthError (two transaction chunks swapped)", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(4500), key);
    const swapped = blobs.slice();
    [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
    await expect(decodeSnapshot(swapped, ctx(key, enc.snapshotId))).rejects.toBeInstanceOf(AuthError);
  });

  it("a chunk moved to another table's slot throws AuthError", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(2), key);
    const moved = blobs.slice();
    [moved[1], moved[2]] = [moved[2], moved[1]]; // accounts <-> categories
    await expect(decodeSnapshot(moved, ctx(key, enc.snapshotId))).rejects.toBeInstanceOf(AuthError);
  });

  it("a chunk spliced in from another snapshot of the same user throws AuthError", async () => {
    const key = await newKey();
    const a = await sealAll(rowsOf(2), key, { snapshotId: "01J0000000000000000000000A" });
    const b = await sealAll(rowsOf(2), key, { snapshotId: "01J0000000000000000000000B" });
    const spliced = a.blobs.slice();
    spliced[2] = b.blobs[2];
    await expect(decodeSnapshot(spliced, ctx(key, a.enc.snapshotId))).rejects.toBeInstanceOf(AuthError);
  });

  it("a truncated blob throws AuthError", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(2), key);
    const short = blobs.slice();
    short[1] = short[1].slice(0, 20);
    await expect(decodeSnapshot(short, ctx(key, enc.snapshotId))).rejects.toBeInstanceOf(AuthError);
  });

  it("AuthError carries no detail", async () => {
    const key = await newKey();
    const { enc, blobs } = await sealAll(rowsOf(2), key);
    const err = await decodeSnapshot(blobs, ctx(await newKey(), enc.snapshotId)).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.message).toBe("authentication failed");
  });

  it("rejects bad bindings on encode ('|' in ids, empty build)", async () => {
    const key = await newKey();
    await expect(encodeSnapshot(rowsOf(1), { ...BASE, key, userId: "a|b" })).rejects.toThrow();
    await expect(encodeSnapshot(rowsOf(1), { ...BASE, key, build: "" })).rejects.toThrow();
  });
});
