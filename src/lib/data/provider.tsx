"use client";

import { useEffect, useRef, useState } from "react";
import { SWRConfig, type Cache } from "swr";
import { dataDefaults } from "./config";
import { installWriteRevalidation } from "./write-revalidation";
import { getSessionInfo, onSessionInfo } from "./session-info";
import { loadPersisted, persistSupported, wipeUser } from "./persist";
import { createPersistentCache } from "./persistent-cache";

const BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";
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

  useEffect(() => {
    const info = getSessionInfo();
    if (!info || !persistSupported()) {
      setCache(new Map());
      return;
    }
    const userId = info.userId;
    locked.current = info.locked;
    const enabled = () => trusted.current && !locked.current;
    let cancelled = false;

    const make = (initial: Map<string, unknown>) =>
      createPersistentCache({ userId, build: BUILD, initial, enabled });

    if (info.locked) {
      void wipeUser(userId);
      setCache(make(new Map()));
    } else {
      const budget = new Promise<Map<string, unknown>>((r) => setTimeout(() => r(new Map()), HYDRATE_BUDGET_MS));
      void Promise.race([loadPersisted(userId, BUILD).catch(() => new Map<string, unknown>()), budget]).then((initial) => {
        if (!cancelled) setCache(make(initial));
      });
    }

    // Only a device the user marked as trusted keeps data at rest.
    void fetch("/api/auth/device-current")
      .then((r) => (r.ok ? r.json() : { id: null }))
      .then((d: { id?: string | null }) => {
        trusted.current = !!d?.id;
        if (!trusted.current) void wipeUser(userId);
      })
      .catch(() => undefined);

    const off = onSessionInfo((next) => {
      if (!next || next.locked) {
        locked.current = true;
        void wipeUser(userId);
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  if (!cache) return null;
  return (
    <SWRConfig value={{ ...dataDefaults, provider: () => cache as unknown as Cache }}>{children}</SWRConfig>
  );
}
