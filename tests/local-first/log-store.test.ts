// PROTOTYPE, unreviewed. Append-only log store: memory and IndexedDB (fake-indexeddb).
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { MemoryLogStore, IdbLogStore, type LogStore } from "@/lib/local-first/oplog/log-store";
import { AppendOnlyViolation } from "@/lib/local-first/oplog/errors";

const bytesOf = (...xs: number[]) => new Uint8Array(xs);
let n = 0;
const uniqueLogId = () => `log-${++n}-${Date.now()}`;

describe.each(["memory", "idb"] as const)("log store (%s)", (kind) => {
  async function fresh(): Promise<{ store: LogStore; logId: string }> {
    const logId = uniqueLogId();
    if (kind === "memory") return { store: new MemoryLogStore(), logId };
    return { store: await IdbLogStore.open(logId), logId };
  }

  it("append returns dense arrival indices and readFrom returns arrival order", async () => {
    const { store } = await fresh();
    expect(await store.append("dev-a", 0, bytesOf(1))).toBe(0);
    expect(await store.append("dev-b", 0, bytesOf(2))).toBe(1);
    expect(await store.append("dev-a", 1, bytesOf(3))).toBe(2);
    expect(await store.count()).toBe(3);
    const all = await store.readFrom(0);
    expect(all.map((f) => [f.deviceId, f.seq, Array.from(f.bytes)])).toEqual([
      ["dev-a", 0, [1]],
      ["dev-b", 0, [2]],
      ["dev-a", 1, [3]],
    ]);
    expect((await store.readFrom(2)).map((f) => f.seq)).toEqual([1]);
    await store.close();
  });

  it("re-adding an existing (deviceId, seq) throws AppendOnlyViolation and leaves the log unchanged", async () => {
    const { store } = await fresh();
    await store.append("dev-a", 0, bytesOf(7, 7));
    await expect(store.append("dev-a", 0, bytesOf(9))).rejects.toBeInstanceOf(AppendOnlyViolation);
    expect(await store.count()).toBe(1);
    expect(Array.from((await store.get("dev-a", 0)) as Uint8Array)).toEqual([7, 7]);
    await store.close();
  });

  it("get returns stored bytes, and undefined for an unknown key", async () => {
    const { store } = await fresh();
    await store.append("dev-a", 4, bytesOf(42));
    expect(Array.from((await store.get("dev-a", 4)) as Uint8Array)).toEqual([42]);
    expect(await store.get("dev-a", 5)).toBeUndefined();
    expect(await store.get("dev-b", 4)).toBeUndefined();
    await store.close();
  });
});

describe("IdbLogStore persistence", () => {
  it("reopen gives an identical prefix and keeps appending after it", async () => {
    const logId = uniqueLogId();
    const first = await IdbLogStore.open(logId);
    for (let i = 0; i < 5; i++) await first.append(i % 2 ? "dev-b" : "dev-a", Math.floor(i / 2), bytesOf(i, i + 1));
    const before = await first.readFrom(0);
    await first.close();

    const second = await IdbLogStore.open(logId);
    expect(await second.readFrom(0)).toEqual(before);
    expect(await second.count()).toBe(5);
    expect(await second.append("dev-a", 99, bytesOf(0xff))).toBe(5);
    await expect(second.append("dev-a", 0, bytesOf(0))).rejects.toBeInstanceOf(AppendOnlyViolation);
    const after = await second.readFrom(0);
    expect(after.slice(0, 5)).toEqual(before);
    expect(after.length).toBe(6);
    await second.close();
    await IdbLogStore.destroy(logId);
  });

  it("database name uses the finlynq-lf-proto-v0- prefix", async () => {
    const logId = uniqueLogId();
    const store = await IdbLogStore.open(logId);
    expect(IdbLogStore.dbName(logId)).toBe(`finlynq-lf-proto-v0-${logId}`);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).toContain(`finlynq-lf-proto-v0-${logId}`);
    await store.close();
    await IdbLogStore.destroy(logId);
  });
});
