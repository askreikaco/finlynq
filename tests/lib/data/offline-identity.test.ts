// @vitest-environment jsdom
import "fake-indexeddb/auto"; // Offline mode needs IndexedDB + WebCrypto to be ON (device support check)
import { describe, it, expect, beforeEach } from "vitest";
import {
  OFFLINE_IDENTITY_KEY,
  OFFLINE_IDENTITY_MAX_AGE_MS,
  forgetOfflineIdentity,
  readOfflineIdentity,
  rememberOfflineIdentity,
} from "@/lib/data/offline-identity";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

const on = () => {
  window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
};

beforeEach(() => window.localStorage.clear());

describe("offline identity", () => {
  it("does nothing while Offline mode is off ('0'): nothing stored, nothing read", () => {
    window.localStorage.setItem(LOCAL_READ_CACHE_KEY, "0");
    window.localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "0");
    rememberOfflineIdentity({ userId: "u1", deviceId: "d1" });
    expect(window.localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBeNull();
    window.localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: "u1", deviceId: "d1", at: Date.now() }));
    expect(readOfflineIdentity()).toBeNull(); // flag off: a stray record is ignored
  });

  it("remembers and reads ids only, with Offline mode on", () => {
    on();
    rememberOfflineIdentity({ userId: "u1", deviceId: "d1" }, 1_000);
    expect(JSON.parse(window.localStorage.getItem(OFFLINE_IDENTITY_KEY)!)).toEqual({ userId: "u1", deviceId: "d1", at: 1_000 });
    expect(readOfflineIdentity(2_000)).toEqual({ userId: "u1", deviceId: "d1", at: 1_000 });
  });

  it("expires after 30 days and removes the record; a clock far in the past is rejected too", () => {
    on();
    rememberOfflineIdentity({ userId: "u1", deviceId: "d1" }, 1_000_000);
    expect(readOfflineIdentity(1_000_000 + OFFLINE_IDENTITY_MAX_AGE_MS - 1)).not.toBeNull();
    expect(readOfflineIdentity(1_000_000 + OFFLINE_IDENTITY_MAX_AGE_MS + 1)).toBeNull();
    expect(window.localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBeNull();
    rememberOfflineIdentity({ userId: "u1", deviceId: "d1" }, 5_000_000_000);
    expect(readOfflineIdentity(1_000)).toBeNull(); // 'at' in the future: refuse
  });

  it("malformed or incomplete records are rejected and cleared", () => {
    on();
    for (const bad of ["not json", "{}", JSON.stringify({ userId: "", deviceId: "d", at: 1 }), JSON.stringify({ userId: "u", deviceId: 5, at: 1 }), "null"]) {
      window.localStorage.setItem(OFFLINE_IDENTITY_KEY, bad);
      expect(readOfflineIdentity(2)).toBeNull();
    }
  });

  it("forget removes it, and ignores empty ids on remember", () => {
    on();
    rememberOfflineIdentity({ userId: "", deviceId: "d1" });
    expect(window.localStorage.getItem(OFFLINE_IDENTITY_KEY)).toBeNull();
    rememberOfflineIdentity({ userId: "u1", deviceId: "d1" });
    forgetOfflineIdentity();
    expect(readOfflineIdentity()).toBeNull();
  });
});
