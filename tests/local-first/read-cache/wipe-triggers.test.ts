// @vitest-environment jsdom
// Wipe triggers (local-first L2b, WP5): each trigger removes the lf databases; with the opt-in off nothing is touched.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dropAllLocalCaches, dropAllLocalCachesWithin, dropLocalUserCache } from "@/lib/data/local-read-cache-wipe";
import { clearPerUserStorage } from "@/lib/client/hard-reload";
import { LOCAL_READ_CACHE_KEY, setLocalReadCacheEnabled, type OptInStorage } from "@/lib/local-first/read-cache/optin";
import { readCacheDbName, saveSnapshot, snapshotAgeMs, wipeAll } from "@/lib/local-first/read-cache/persist-store";
import { disposeReadCache } from "@/lib/local-first/read-cache/session";

const EMPTY = { accounts: [], categories: [], transactions: [] };
const dbNames = async (): Promise<string[]> => (await indexedDB.databases()).map((d) => d.name ?? "");
const lfDbs = async () => (await dbNames()).filter((n) => n.startsWith("finlynq-lf-"));
const hasSnapshot = async (userId: string) => (await snapshotAgeMs(userId)) !== null;

async function seed(userId: string): Promise<void> {
  await saveSnapshot(userId, "dev-1", EMPTY, { build: "dev", schemaVer: 1 });
  if (!(await hasSnapshot(userId))) throw new Error("seed failed");
}

async function until(cond: () => Promise<boolean>, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(async () => {
  window.localStorage.clear();
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  await disposeReadCache();
  await wipeAll();
  await seed("u1");
  await seed("u2");
});

afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  await disposeReadCache();
  await wipeAll();
});

describe("each wipe trigger removes the local-first databases it owns", () => {
  it("lock / untrusted device removes only that user's database (and its device key)", async () => {
    await dropLocalUserCache("u1");
    expect(await hasSnapshot("u1")).toBe(false);
    expect(await dbNames()).toContain(await readCacheDbName("u2"));
  });

  it("logout (clearPerUserStorage) removes the logged-out user's database", async () => {
    clearPerUserStorage("u1");
    await until(async () => !(await hasSnapshot("u1")));
    expect(await hasSnapshot("u2")).toBe(true);
  });

  it("signed-out boot, password reset and account deletion remove every database", async () => {
    await dropAllLocalCaches();
    expect(await lfDbs()).toEqual([]);
  });

  it("delete-account path: the bounded wait resolves and the databases are gone", async () => {
    await dropAllLocalCachesWithin(400);
    expect(await lfDbs()).toEqual([]);
  });

  it("opt-in turned off wipes every database on this browser", async () => {
    const storage: OptInStorage = window.localStorage;
    setLocalReadCacheEnabled(false, storage);
    await until(async () => (await lfDbs()).length === 0);
    expect(window.localStorage.getItem(LOCAL_READ_CACHE_KEY)).toBeNull();
  });

  it("opt-in turned on does not wipe anything", async () => {
    setLocalReadCacheEnabled(true, window.localStorage);
    await new Promise((r) => setTimeout(r, 30));
    expect(await hasSnapshot("u1")).toBe(true);
    expect(await hasSnapshot("u2")).toBe(true);
  });
});

describe("with the opt-in off the wipe triggers do no IndexedDB work", () => {
  beforeEach(() => {
    window.localStorage.removeItem(LOCAL_READ_CACHE_KEY);
  });

  it("no open, no delete, data left alone", async () => {
    const openSpy = vi.spyOn(indexedDB, "open");
    const delSpy = vi.spyOn(indexedDB, "deleteDatabase");
    await dropLocalUserCache("u1");
    await dropAllLocalCaches();
    clearPerUserStorage("u2");
    await new Promise((r) => setTimeout(r, 30));
    expect(openSpy).not.toHaveBeenCalled();
    expect(delSpy).not.toHaveBeenCalled();
    expect(await hasSnapshot("u1")).toBe(true);
    expect(await hasSnapshot("u2")).toBe(true);
  });
});

describe("wipe helpers never throw into the UI", () => {
  it("a failing delete is swallowed and reported with console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(indexedDB, "deleteDatabase").mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(dropLocalUserCache("u1")).resolves.toBeUndefined();
    await expect(dropAllLocalCaches()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
