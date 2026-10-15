"use client";

import { DATA_SCHEMA_VERSION } from "@/lib/local-first/data-schema-version";
import { useEffect, useRef, useState } from "react";
import { SWRConfig, useSWRConfig, type Cache } from "swr";
import { dataDefaults } from "./config";
import { installWriteRevalidation } from "./write-revalidation";
import { getSessionInfo, onSessionInfo } from "./session-info";
import { loadPersisted, persistSupported, purgeDisallowed, wipeUser } from "./persist";
import { createPersistentCache } from "./persistent-cache";
import { isSafeToPersist } from "./persist-policy";
import { dropLocalDisposableCaches, dropLocalUserCache, dropPasskeyUnlockFor } from "./local-read-cache-wipe";
import { passkeyPersistBlocked, refreshPasskeyLock } from "@/lib/local-first/crypto/passkey-unlock";
import { Notice } from "@/components/notice";
import { setLocalWriteSyncedHandler, startLocalWriteQueue } from "./local-write-queue";
import { forgetOfflineIdentity, readOfflineIdentity, rememberOfflineIdentity } from "./offline-identity";
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";

// Device cache binding: the data schema version, NOT the deploy build id (see data-schema-version.ts).
const BUILD = DATA_SCHEMA_VERSION;
/** Never hold the first paint longer than this waiting for the on-device copy. */
const HYDRATE_BUDGET_MS = 250;

/**
 * App-wide data layer (performance plan, Phases 1 + 4a): one shared SWR cache for
 * every screen under the (app) layout; successful writes refresh what is on screen;
 * on a trusted, unlocked device the cache is also kept encrypted on the device so a
 * cold open paints the last data at once (then revalidates).
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => installWriteRevalidation(), []);
  const [cache, setCache] = useState<Map<string, { data?: unknown }> | null>(null);
  const trusted = useRef(false);
  const locked = useRef(true);
  const deviceId = useRef<string | null>(null);

  useEffect(() => {
    const info = getSessionInfo();
    if (!info || !persistSupported()) {
      setCache(new Map());
      return;
    }
    const userId = info.userId;
    locked.current = info.locked;
    // Passkey enrolled for this user: the SWR copy is never written or read on disk (memory only). Unknown until the
    // first refresh, so nothing is persisted before the check.
    const enabled = () => trusted.current && !locked.current && !passkeyPersistBlocked(userId);
    let cancelled = false;
    const passkeyReady = refreshPasskeyLock(userId).catch(() => true);

    const make = (initial: Map<string, unknown>) =>
      createPersistentCache({ userId, build: BUILD, initial, enabled });

    if (info.locked) {
      void wipeUser(userId);
      void dropLocalDisposableCaches(userId); // lock: keep the outbox
      setCache(make(new Map()));
    } else {
      const budget = new Promise<Map<string, unknown>>((r) => setTimeout(() => r(new Map()), HYDRATE_BUDGET_MS));
      const load = passkeyReady.then(() =>
        passkeyPersistBlocked(userId) ? new Map<string, unknown>() : loadPersisted(userId, BUILD, isSafeToPersist),
      );
      void Promise.race([load.catch(() => new Map<string, unknown>()), budget])
        .then((initial) => {
          if (!cancelled) setCache(make(initial));
          // Purge disallowed keys from IndexedDB in parallel (fire-and-forget).
          // Runs regardless of trusted state, cleaning only this user's database.
          void purgeDisallowed(userId, BUILD).catch(() => undefined);
        });
    }

    // Only a device the user marked as trusted keeps data at rest.
    // True while this device is only ASSUMED trusted (opened offline from the remembered identity): verified for real on `online`.
    let assumedTrusted = false;
    const verifyDevice = () =>
      fetch("/api/auth/device-current")
        .then((r) => (r.ok ? r.json() : { id: null }))
        .then((d: { id?: string | null }) => {
          assumedTrusted = false;
          trusted.current = !!d?.id;
          deviceId.current = d?.id ?? null;
          if (d?.id) rememberOfflineIdentity({ userId, deviceId: d.id }); // lets the app open with no network (flag off = no-op)
          // Offline write queue (flag off = no-op): only on a trusted, unlocked device.
          if (trusted.current && !locked.current && d?.id) startLocalWriteQueue(userId, d.id);
          if (!trusted.current) {
            forgetOfflineIdentity();
            void wipeUser(userId);
            void dropLocalUserCache(userId);
            void dropPasskeyUnlockFor(userId); // the outbox it protected is gone
          }
        })
        .catch(() => {
          // No network. Only when the app itself opened offline from the remembered identity (Offline mode on) is this
          // device treated as the trusted one it was; anything else stays untrusted, as before.
          if (!getSessionInfo()?.offline) return;
          const remembered = readOfflineIdentity();
          if (!remembered || remembered.userId !== userId) return;
          assumedTrusted = true;
          trusted.current = true;
          deviceId.current = remembered.deviceId;
          locked.current = false;
          startLocalWriteQueue(userId, remembered.deviceId);
        });
    void verifyDevice();
    // Network back after an offline open: the real device check (an untrusted device wipes, as always).
    const onOnline = () => {
      if (!trusted.current || assumedTrusted) void verifyDevice();
    };
    window.addEventListener("online", onOnline);

    const off = onSessionInfo((next) => {
      if (next && !next.locked) {
        locked.current = false;
        if (trusted.current && deviceId.current) startLocalWriteQueue(userId, deviceId.current);
      }
      if (!next || next.locked) {
        locked.current = true;
        void wipeUser(userId);
        // Sign-out (next null) drops the outbox too; a lock keeps it (unsynced writes exist nowhere else).
        if (next) void dropLocalDisposableCaches(userId);
        else {
          void dropLocalUserCache(userId);
          void dropPasskeyUnlockFor(userId);
        }
      }
    });
    return () => {
      cancelled = true;
      off();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (!cache) return null;
  return (
    <SWRConfig value={{ ...dataDefaults, provider: () => cache as unknown as Cache }}>
      <WriteQueueBridge />
      <Notice source="passkey-lock" />
      {children}
    </SWRConfig>
  );
}

/** Lets the offline write queue refresh the lists once queued writes reach the server. Renders nothing. */
function WriteQueueBridge() {
  const { mutate, cache } = useSWRConfig();
  useEffect(() => {
    setLocalWriteSyncedHandler(() => {
      void revalidateTransactionLists(mutate, cache);
      void mutate("/api/accounts");
    });
    return () => setLocalWriteSyncedHandler(null);
  }, [mutate, cache]);
  return null;
}
