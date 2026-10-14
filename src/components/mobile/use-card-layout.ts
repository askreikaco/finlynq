"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { defaultCardLayout, normalizeCardLayout, type CardLayout, type PageCard } from "@/lib/card-layout";

/**
 * Per-user card layout for one page (order + hidden). `cards` is the page's default order and must be a
 * stable (module-level) array. Persists to /api/settings/card-layout?page=<pageId> unless `endpoint` says
 * otherwise (the dashboard passes its legacy /api/settings/dashboard-layout). `ready` flips once the saved
 * layout was fetched (or failed, then defaults). `save` is optimistic and rolls back (and rethrows) on failure.
 */
export function useCardLayout(pageId: string, cards: readonly PageCard[], options: { endpoint?: string } = {}) {
  const endpoint = options.endpoint ?? `/api/settings/card-layout?page=${encodeURIComponent(pageId)}`;
  const cardsRef = useRef(cards);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);
  const defaults = useMemo(() => defaultCardLayout(cards), [cards]);
  // Read through the cache-first hook: a page that remounts paints the saved layout at once (no skeleton) and the
  // layout is revalidated in the background. `override` holds an optimistic save until the server answers.
  const res = useCacheFirstJson<unknown>(endpoint);
  const { setData } = res;
  const fetched = useMemo(
    () => (res.data ? normalizeCardLayout(res.data, cardsRef.current) : defaults),
    [res.data, defaults],
  );
  const [override, setOverride] = useState<CardLayout | null>(null);
  useEffect(() => {
    setOverride(null); // a newer server copy wins over the last local save
  }, [res.data]);
  const layout = override ?? fetched;
  const current = useRef(layout);
  useEffect(() => {
    current.current = layout;
  }, [layout]);
  const settled = !res.loading;
  const [everReady, setEverReady] = useState(settled);
  useEffect(() => {
    if (settled) setEverReady(true);
  }, [settled]);
  const ready = everReady || settled;

  const save = useCallback(
    async (next: CardLayout) => {
      const previous = current.current;
      const optimistic = normalizeCardLayout(next, cardsRef.current);
      setOverride(optimistic);
      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: optimistic.order, hidden: optimistic.hidden }),
        });
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        const saved: unknown = await res.json();
        setOverride(normalizeCardLayout(saved, cardsRef.current));
        setData(saved); // keep the cache (and the persisted copy) on the saved layout
      } catch (e) {
        setOverride(previous);
        throw e;
      }
    },
    [endpoint, setData],
  );

  const reset = useCallback(() => save(defaultCardLayout(cardsRef.current)), [save]);

  return { layout, ready, save, reset };
}
