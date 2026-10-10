"use client";

/**
 * useLocalAccountBalances (local-first L2a, persistence L2b): opt-in, account balances from the local read cache.
 * Off by default (localStorage "finlynq.lf.read" !== "1"): does nothing, no store, no fetch, no IndexedDB.
 * Never throws into the page: every failure becomes status "error".
 *
 * Persistence is allowed only when opted in AND the device is trusted (/api/auth/device-current returns an id)
 * AND the session is unlocked (getSessionInfo, the same signals as src/lib/data/provider.tsx). With persistence,
 * status becomes "ready" as soon as the encrypted snapshot is loaded (source "snapshot"), then "ready" again
 * after the network refresh (source "network").
 * Not wired into any list screen yet; the dev panel is the only consumer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getSessionInfo, onSessionInfo } from "@/lib/data/session-info";
import { fetchTrustedDeviceId } from "@/lib/data/trusted-device";
import type { BalanceRow } from "../store/types";
import type { HydrateResult, FetchLike } from "./hydrate";
import { isLocalReadCacheEnabled } from "./optin";
import { createMemoryStore, disposeReadCache, hydrateReadCache, readLocalBalances, type ReadCacheDeps } from "./session";

export type LocalBalancesStatus = "off" | "loading" | "ready" | "error";
export type LocalBalancesSource = "snapshot" | "network";

export interface LocalAccountBalances {
  status: LocalBalancesStatus;
  /** Where the balances on screen came from. null until the first data is shown. */
  source: LocalBalancesSource | null;
  balances: BalanceRow[];
  error: string | null;
  lastHydrate: HydrateResult | null;
  /** Re-reads the APIs into the store. Resolves null when off or on failure. Never rejects. */
  refresh: () => Promise<HydrateResult | null>;
}

/** Browser fetch with the session cookie (same-origin). */
const browserFetch: FetchLike = (url) => fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });

const BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "dev";
const NETWORK_ONLY: ReadCacheDeps = { createStore: createMemoryStore, fetchImpl: browserFetch };

/** Network-only deps unless opted in, signed in and on a trusted device. Then persistence is allowed live. */
async function depsForSession(): Promise<ReadCacheDeps> {
  const info = getSessionInfo();
  if (!info || info.locked) return NETWORK_ONLY;
  const deviceId = await fetchTrustedDeviceId();
  if (deviceId === null) return NETWORK_ONLY;
  const userId = info.userId;
  return {
    ...NETWORK_ONLY,
    persist: {
      userId,
      deviceId,
      build: BUILD,
      allowPersist: () => {
        const now = getSessionInfo();
        return isLocalReadCacheEnabled() && !!now && !now.locked && now.userId === userId;
      },
    },
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useLocalAccountBalances(): LocalAccountBalances {
  const [status, setStatus] = useState<LocalBalancesStatus>("off");
  const [source, setSource] = useState<LocalBalancesSource | null>(null);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastHydrate, setLastHydrate] = useState<HydrateResult | null>(null);
  const alive = useRef(true);

  const run = useCallback(async (force: boolean): Promise<HydrateResult | null> => {
    try {
      if (!isLocalReadCacheEnabled()) {
        await disposeReadCache();
        if (alive.current) {
          setStatus("off");
          setSource(null);
          setBalances([]);
          setError(null);
          setLastHydrate(null);
        }
        return null;
      }
      if (alive.current) {
        setStatus("loading");
        setError(null);
      }
      const deps = await depsForSession();
      let networkDone = false;
      const result = await hydrateReadCache(deps, {
        force,
        onSnapshot: () => {
          void readLocalBalances(deps)
            .then((rows) => {
              if (alive.current && !networkDone) {
                setBalances(rows);
                setSource("snapshot");
                setStatus("ready");
              }
            })
            .catch(() => undefined);
        },
      });
      const rows = await readLocalBalances(deps);
      networkDone = true;
      if (alive.current) {
        setLastHydrate(result);
        setBalances(rows);
        setSource("network");
        setStatus("ready");
      }
      return result;
    } catch (err) {
      if (alive.current) {
        setStatus("error");
        setError(message(err));
      }
      return null;
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void run(false);
    return () => {
      alive.current = false;
    };
  }, [run]);

  // Lock or sign-out: drop the memory store and show nothing. The on-device copy is wiped by the data layer's listener.
  useEffect(() => {
    return onSessionInfo((next) => {
      if (next && !next.locked) return;
      void disposeReadCache();
      if (alive.current) {
        setStatus("off");
        setSource(null);
        setBalances([]);
        setLastHydrate(null);
      }
    });
  }, []);

  const refresh = useCallback(() => run(true), [run]);

  return { status, source, balances, error, lastHydrate, refresh };
}
