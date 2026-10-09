// @vitest-environment node
/**
 * Worker handlers in-process (local-first P1, PKG-10). SYNTHETIC fixture only. No Worker, no IndexedDB:
 * the backend is a fake with a memory PGlite store and a fake database list.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { generate, type FixtureDataset } from "@/lib/local-first/fixture/generate";
import { PgliteStore } from "@/lib/local-first/store/pglite-store";
import type { LocalStore } from "@/lib/local-first/store/types";
import { deriveLogKeys, deriveRootKey, type LogKeys } from "@/lib/local-first/crypto/kdf";
import { dispatch, lfDatabasesOnly, type LfBackend } from "@/lib/local-first/worker/handlers";
import { LF_DB_PREFIX, LF_STORE_NAME, isLfDatabaseName, type LfResponse, type LfResult } from "@/lib/local-first/worker/protocol";

const data: FixtureDataset = generate({ seed: 7, n: 7000 });

/** Cheap Argon2 params for tests only; production set A is not used here. */
async function testKeys(): Promise<LogKeys> {
  const root = deriveRootKey("handlers-synthetic-passphrase", new Uint8Array(16).fill(9), { m: 64, t: 1, p: 1, dkLen: 32 });
  return deriveLogKeys(root, "lf-proto-fixture");
}

function fakeBackend(keys: LogKeys, databases: string[]) {
  let store: LocalStore | null = null;
  const deleted: string[] = [];
  const backend: LfBackend = {
    async getStore() {
      if (!store) {
        const s = new PgliteStore({ backend: "memory" });
        await s.open();
        store = s;
      }
      return store;
    },
    async getKeys() {
      return keys;
    },
    async closeStore() {
      const s = store;
      store = null;
      if (s) await s.close();
    },
    async listDatabases() {
      return [...databases];
    },
    async deleteDatabase(name: string) {
      deleted.push(name);
    },
  };
  return { backend, deleted };
}

function ok(res: LfResponse): LfResult {
  if (!res.ok) throw new Error(`handler failed: ${res.error}`);
  return res.result;
}

describe("worker handlers (in-process, synthetic fixture)", { timeout: 300_000 }, () => {
  let keys: LogKeys;
  let fake: ReturnType<typeof fakeBackend>;

  beforeEach(async () => {
    keys = await testKeys();
    fake = fakeBackend(keys, [`/pglite/${LF_DB_PREFIX}${LF_STORE_NAME}`, "finlynq-cache-v1-abc123"]);
  });

  afterEach(async () => {
    await fake.backend.closeStore();
  });

  it("importFixture then counts equal the fixture row counts", async () => {
    const imp = ok(await dispatch({ id: 1, type: "importFixture" }, fake.backend, { dataset: data }));
    expect(imp.type).toBe("importFixture");
    const c = ok(await dispatch({ id: 2, type: "counts" }, fake.backend, { dataset: data }));
    expect(c).toEqual({
      type: "counts",
      counts: { accounts: data.accounts.length, categories: data.categories.length, transactions: data.transactions.length },
    });
    expect(data.transactions.length).toBe(7000);
  });

  it("runParity passes every check on the imported fixture (10 of 10, non-empty comparisons)", async () => {
    ok(await dispatch({ id: 1, type: "importFixture" }, fake.backend, { dataset: data }));
    const r = ok(await dispatch({ id: 2, type: "runParity" }, fake.backend, { dataset: data }));
    if (r.type !== "runParity") throw new Error("wrong result type");
    expect(r.report.total).toBe(10);
    expect(r.report.passed).toBe(10);
    for (const c of r.report.checks) {
      expect(c.keys).toBeGreaterThan(0);
      expect(c.mismatches).toEqual([]);
    }
  });

  it("runParity fails on an empty store (anti-vacuity: nothing passes without the import)", async () => {
    const r = ok(await dispatch({ id: 1, type: "runParity" }, fake.backend, { dataset: data }));
    if (r.type !== "runParity") throw new Error("wrong result type");
    expect(r.report.passed).toBe(0);
  });

  it("wipe empties the store", async () => {
    ok(await dispatch({ id: 1, type: "importFixture" }, fake.backend, { dataset: data }));
    const w = ok(await dispatch({ id: 2, type: "wipe" }, fake.backend, { dataset: data }));
    expect(w.type).toBe("wipe");
    const c = ok(await dispatch({ id: 3, type: "counts" }, fake.backend, { dataset: data }));
    expect(c).toEqual({ type: "counts", counts: { accounts: 0, categories: 0, transactions: 0 } });
  });

  it("wipe deletes only the finlynq-lf-proto-v0- prefix and never finlynq-cache-v1- databases", async () => {
    const w = ok(await dispatch({ id: 1, type: "wipe" }, fake.backend, { dataset: data }));
    if (w.type !== "wipe") throw new Error("wrong result type");
    expect(fake.deleted).toEqual([`/pglite/${LF_DB_PREFIX}${LF_STORE_NAME}`]);
    expect(fake.deleted.some((n) => n.startsWith("finlynq-cache-v1-"))).toBe(false);
  });

  it("prefix set is pinned: prototype prefix is fixed and differs from the app cache prefix in persist.ts", () => {
    expect(LF_DB_PREFIX).toBe("finlynq-lf-proto-v0-");
    const persistSrc = readFileSync("src/lib/data/persist.ts", "utf8");
    expect(persistSrc).toContain('const DB_PREFIX = "finlynq-cache-v1-";');
    expect(LF_DB_PREFIX.startsWith("finlynq-cache-v1-")).toBe(false);
    expect(lfDatabasesOnly(["finlynq-cache-v1-x", "finlynq-lf-proto-v0-dev", "finlynq-lf-proto-v0-", "other"])).toEqual([
      "finlynq-lf-proto-v0-dev",
      "finlynq-lf-proto-v0-",
    ]);
    // PGlite's IndexedDB name carries the "/pglite/" path; it must match too, and the cache must not.
    expect(isLfDatabaseName("/pglite/finlynq-lf-proto-v0-dev")).toBe(true);
    expect(isLfDatabaseName("/pglite/finlynq-cache-v1-abc")).toBe(false);
    expect(isLfDatabaseName("finlynq-cache-v1-abc")).toBe(false);
  });

  it("dispatch returns ok:false instead of throwing when the backend fails", async () => {
    const broken: LfBackend = { ...fake.backend, async getStore() { throw new Error("no idb"); } };
    const res = await dispatch({ id: 9, type: "counts" }, broken, { dataset: data });
    expect(res).toEqual({ id: 9, ok: false, error: "no idb" });
  });
});
