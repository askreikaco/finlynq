"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [layout, setLayout] = useState<CardLayout>(defaults);
  const [ready, setReady] = useState(false);
  const current = useRef(layout);
  useEffect(() => {
    current.current = layout;
  }, [layout]);

  useEffect(() => {
    let alive = true;
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setLayout(normalizeCardLayout(d, cardsRef.current));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [endpoint]);

  const save = useCallback(
    async (next: CardLayout) => {
      const previous = current.current;
      const optimistic = normalizeCardLayout(next, cardsRef.current);
      setLayout(optimistic);
      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: optimistic.order, hidden: optimistic.hidden }),
        });
        if (!res.ok) throw new Error(`save failed (${res.status})`);
        setLayout(normalizeCardLayout(await res.json(), cardsRef.current));
      } catch (e) {
        setLayout(previous);
        throw e;
      }
    },
    [endpoint],
  );

  const reset = useCallback(() => save(defaultCardLayout(cardsRef.current)), [save]);

  return { layout, ready, save, reset };
}
