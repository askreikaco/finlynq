"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultLayout, normalizeLayout, type DashboardLayout } from "@/lib/dashboard-layout";

const URL = "/api/settings/dashboard-layout";

/**
 * Per-user dashboard layout (order + hidden). `ready` flips once the saved layout was
 * fetched (or the fetch failed → defaults) so the page doesn't flash the default order
 * before the saved one. `save` is optimistic and rolls back (and rethrows) on failure.
 */
export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout);
  const [ready, setReady] = useState(false);
  const current = useRef(layout);
  useEffect(() => { current.current = layout; }, [layout]);

  useEffect(() => {
    let alive = true;
    fetch(URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setLayout(normalizeLayout(d));
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async (next: DashboardLayout) => {
    const previous = current.current;
    const optimistic = normalizeLayout(next);
    setLayout(optimistic);
    try {
      const res = await fetch(URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optimistic),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      setLayout(normalizeLayout(await res.json()));
    } catch (e) {
      setLayout(previous);
      throw e;
    }
  }, []);

  const reset = useCallback(() => save(defaultLayout()), [save]);

  return { layout, ready, save, reset };
}
