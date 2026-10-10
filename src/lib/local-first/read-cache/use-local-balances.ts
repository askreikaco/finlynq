"use client";

/**
 * useLocalAccountBalances (local-first L2a): opt-in, in-memory account balances from the local read cache.
 * Off by default (localStorage "finlynq.lf.read" !== "1"): does nothing, no store, no fetch.
 * Never throws into the page: every failure becomes status "error".
 * Not wired into any list screen yet; the dev panel is the only consumer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BalanceRow } from "../store/types";
import type { HydrateResult, FetchLike } from "./hydrate";
import { isLocalReadCacheEnabled } from "./optin";
import { createMemoryStore, disposeReadCache, hydrateReadCache, readLocalBalances, type ReadCacheDeps } from "./session";

export type LocalBalancesStatus = "off" | "loading" | "ready" | "error";

export interface LocalAccountBalances {
  status: LocalBalancesStatus;
  balances: BalanceRow[];
  error: string | null;
  lastHydrate: HydrateResult | null;
  /** Re-reads the APIs into the store. Resolves null when off or on failure. Never rejects. */
  refresh: () => Promise<HydrateResult | null>;
}

/** Browser fetch with the session cookie (same-origin). */
const browserFetch: FetchLike = (url) => fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });

const DEPS: ReadCacheDeps = { createStore: createMemoryStore, fetchImpl: browserFetch };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useLocalAccountBalances(): LocalAccountBalances {
  const [status, setStatus] = useState<LocalBalancesStatus>("off");
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
      const result = await hydrateReadCache(DEPS, { force });
      const rows = await readLocalBalances(DEPS);
      if (alive.current) {
        setLastHydrate(result);
        setBalances(rows);
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

  const refresh = useCallback(() => run(true), [run]);

  return { status, balances, error, lastHydrate, refresh };
}
