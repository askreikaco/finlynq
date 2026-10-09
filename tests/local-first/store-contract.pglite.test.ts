import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PgliteStore, dataDirFor } from "@/lib/local-first/store/pglite-store";
import { runLocalStoreContract } from "@/lib/local-first/store/contract";

const root = mkdtempSync(join(tmpdir(), "lf-proto-pglite-"));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// memory:// : a fresh instance per call, no reopen (cannot persist).
runLocalStoreContract("memory://", {
  fresh: async () => new PgliteStore({ backend: "memory" }),
});

// node-fs: a real directory per fresh() call; reopen() points at the same directory.
let lastDir: string | null = null;
let seq = 0;
runLocalStoreContract("node-fs (persistent)", {
  fresh: async () => {
    lastDir = join(root, `db-${++seq}`);
    return new PgliteStore({ backend: "node-fs", dataDir: lastDir });
  },
  reopen: async () => {
    if (!lastDir) throw new Error("reopen before fresh");
    return new PgliteStore({ backend: "node-fs", dataDir: lastDir });
  },
});

describe("PgliteStore backend naming and memory semantics", { timeout: 120_000 }, () => {
  it("idb dataDir uses the proto prefix and validates the name", () => {
    expect(dataDirFor({ backend: "idb", name: "alice-1" })).toBe("idb://finlynq-lf-proto-v0-alice-1");
    expect(() => dataDirFor({ backend: "idb", name: "Bad_Name" })).toThrow();
    expect(() => dataDirFor({ backend: "idb" })).toThrow();
  });

  it("memory:// does not persist: a new instance after close is empty", async () => {
    const a = new PgliteStore({ backend: "memory" });
    await a.open();
    await a.upsertRows("categories", [{ id: "c1", type: "E", group: "g", name: "n" }]);
    expect((await a.counts()).categories).toBe(1);
    await a.close();
    const b = new PgliteStore({ backend: "memory" });
    await b.open();
    try {
      expect((await b.counts()).categories).toBe(0);
    } finally {
      await b.close();
    }
  });
});
