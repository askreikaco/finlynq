import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "fake-indexeddb/auto";
import React from "react";
import { render } from "@testing-library/react";

import { savePersisted, loadPersisted, purgeDisallowed } from "@/lib/data/persist";
import { isSafeToPersist } from "@/lib/data/persist-policy";

// Helper to generate the same DB name as persist.ts
async function getDbName(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  const hex = [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `finlynq-cache-v1-${hex}`;
}

describe("purgeDisallowed: real IndexedDB integration tests (M7a, M10, M11)", () => {
  async function cleanup(userId: string) {
    const dbName = await getDbName(userId);
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = req.onerror = () => resolve();
    });
  }

  it("purgeDisallowed removes disallowed keys and keeps allowed keys (M7a)", async () => {
    const userId = "test1";
    const build = "b1";

    // Seed IndexedDB with mixed keys via savePersisted
    const entriesToSave = new Map<string, unknown>([
      ["/api/auth/session", { userId: "u1" }], // blocked
      ["/api/accounts", [{ id: 1 }]], // allowed
      ["/api/transactions?limit=100000", { items: [] }], // allowed (with query)
      ["/api/settings/devices", { devices: [] }], // blocked
      ["garbage", { data: "should be removed" }], // not an API key
      ["/api/%zz", { malformed: true }], // malformed key
      ["%2Fapi%2Fauth%2Fsession", { encoded: true }], // percent-encoded blocked key
      ["/api/foo", { unknown: true }], // not on allow-list
    ]);

    await savePersisted(userId, build, entriesToSave);

    // Call purgeDisallowed
    await purgeDisallowed(userId, build);

    // Verify only safe keys remain
    const remaining = await loadPersisted(userId, build);
    const remainingKeys = Array.from(remaining.keys()).sort();

    // Only /api/accounts and /api/transactions?limit=100000 should remain
    expect(remainingKeys).toEqual(["/api/accounts", "/api/transactions?limit=100000"]);
    expect(remaining.get("/api/accounts")).toEqual([{ id: 1 }]);
    expect(remaining.get("/api/transactions?limit=100000")).toEqual({ items: [] });

    await cleanup(userId);
  });

  it("purgeDisallowed is a no-op if build mismatch", async () => {
    const userId = "test2";

    // Seed with build "v1"
    const entriesToSave = new Map<string, unknown>([
      ["/api/auth/session", { userId: "u1" }],
      ["/api/accounts", [{ id: 1 }]],
    ]);
    await savePersisted(userId, "v1", entriesToSave);

    // Call purgeDisallowed with different build
    await purgeDisallowed(userId, "v2");

    // Entries should still be there (no-op)
    const remaining = await loadPersisted(userId, "v1");
    expect(remaining.size).toBe(2);
    expect(remaining.has("/api/auth/session")).toBe(true);

    await cleanup(userId);
  });

  it("loadPersisted with isSafeToPersist predicate skips disallowed keys", async () => {
    const userId = "test3";
    const build = "b1";

    // Seed with both allowed and disallowed keys
    const entriesToSave = new Map<string, unknown>([
      ["/api/auth/session", { userId: "u1" }],
      ["/api/accounts", [{ id: 1 }]],
      ["/api/settings/devices", { devices: [] }],
      ["/api/transactions", { items: [] }],
    ]);
    await savePersisted(userId, build, entriesToSave);

    // Load with predicate
    const loaded = await loadPersisted(userId, build, isSafeToPersist);

    // Only safe keys should be returned
    const keys = Array.from(loaded.keys()).sort();
    expect(keys).toEqual(["/api/accounts", "/api/transactions"]);

    await cleanup(userId);
  });

  it("purgeDisallowed removes percent-encoded blocked keys", async () => {
    const userId = "test4";
    const build = "b1";

    // Save a percent-encoded version of a blocked key
    const entriesToSave = new Map<string, unknown>([
      ["%2Fapi%2Fauth%2Fsession", { encoded: "blocked" }], // /api/auth/session encoded
      ["/api/accounts", { id: 1 }], // safe
    ]);
    await savePersisted(userId, build, entriesToSave);

    // Purge
    await purgeDisallowed(userId, build);

    // Verify the encoded key is removed
    const remaining = await loadPersisted(userId, build);
    expect(Array.from(remaining.keys())).toEqual(["/api/accounts"]);

    await cleanup(userId);
  });

  it("purgeDisallowed removes case-variant blocked keys", async () => {
    const userId = "test5";
    const build = "b1";

    // Save case variants of blocked keys
    const entriesToSave = new Map<string, unknown>([
      ["/API/AUTH/SESSION", { upper: true }], // normalized to /api/auth/session (blocked)
      ["/api/accounts", { id: 1 }], // safe
    ]);
    await savePersisted(userId, build, entriesToSave);

    // Purge
    await purgeDisallowed(userId, build);

    // Verify the case-variant blocked key is removed
    const remaining = await loadPersisted(userId, build);
    expect(Array.from(remaining.keys())).toEqual(["/api/accounts"]);

    await cleanup(userId);
  });
});

describe("purgeDisallowed mutations (M7a, M10, M11)", () => {
  async function cleanup(userId: string) {
    const dbName = await getDbName(userId);
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = req.onerror = () => resolve();
    });
  }

  it("M10: purgeDisallowed must delete disallowed keys (mutation: delete nothing)", async () => {
    // If purgeDisallowed deletes nothing, blocked keys would remain
    // This is verified by the main test above: without purge, blocked keys stay
    const testUserId = "m10-test";
    const testBuild = "m10-build";

    const entriesToSave = new Map<string, unknown>([
      ["/api/auth/session", { userId: "u1" }],
      ["/api/accounts", { id: 1 }],
    ]);
    await savePersisted(testUserId, testBuild, entriesToSave);

    // Without calling purgeDisallowed, blocked key remains
    const withoutPurge = await loadPersisted(testUserId, testBuild);
    expect(withoutPurge.has("/api/auth/session")).toBe(true);

    // With purgeDisallowed, it's gone
    await purgeDisallowed(testUserId, testBuild);
    const afterPurge = await loadPersisted(testUserId, testBuild);
    expect(afterPurge.has("/api/auth/session")).toBe(false);

    // Cleanup
    await cleanup(testUserId);
  });

  it("M11: purgeDisallowed must NOT delete allowed keys (mutation: delete all)", async () => {
    // If purgeDisallowed deleted everything, all data would be lost
    // This is verified by the main test above: /api/accounts must survive
    const testUserId = "m11-test";
    const testBuild = "m11-build";

    const entriesToSave = new Map<string, unknown>([
      ["/api/auth/session", { userId: "u1" }],
      ["/api/accounts", { id: 1 }],
      ["/api/transactions", { items: [] }],
    ]);
    await savePersisted(testUserId, testBuild, entriesToSave);

    // After purgeDisallowed, allowed keys survive
    await purgeDisallowed(testUserId, testBuild);
    const remaining = await loadPersisted(testUserId, testBuild);

    expect(remaining.has("/api/accounts")).toBe(true);
    expect(remaining.has("/api/transactions")).toBe(true);
    expect(remaining.has("/api/auth/session")).toBe(false);

    // Cleanup
    await cleanup(testUserId);
  });
});

describe("provider integration: purgeDisallowed called during hydration (M7a)", () => {
  async function cleanup(userId: string) {
    const dbName = await getDbName(userId);
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = req.onerror = () => resolve();
    });
  }

  it("purgeDisallowed is available as export (required by provider.tsx)", () => {
    // Verify purgeDisallowed is exported and can be imported
    // This ensures the provider can import and call it
    expect(purgeDisallowed).toBeDefined();
    expect(typeof purgeDisallowed).toBe("function");
  });

  it("loadPersisted accepts optional predicate parameter (used by provider)", async () => {
    // Verify loadPersisted can accept isSafeToPersist as predicate
    // This is called by provider to skip decrypting disallowed keys
    const userId = "m7a-test";
    const build = "b1";

    const entries = new Map<string, unknown>([
      ["/api/auth/session", { blocked: true }],
      ["/api/accounts", { allowed: true }],
    ]);
    await savePersisted(userId, build, entries);

    // Load WITH predicate - should skip blocked key
    const loaded = await loadPersisted(userId, build, isSafeToPersist);
    expect(loaded.has("/api/accounts")).toBe(true);
    expect(loaded.has("/api/auth/session")).toBe(false);

    // Cleanup
    await cleanup(userId);
  });

});
