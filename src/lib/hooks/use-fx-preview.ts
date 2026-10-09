"use client";

import { useEffect, useState } from "react";

export type FxPreview =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; rate: number; source: string; converted: number; date: string; to: string }
  | { state: "needs-override" }
  | { state: "error"; message: string };

export interface FxPreviewInput {
  /** Off = idle. Callers pass false when no preview applies (e.g. transfer mode, dialog closed). */
  enabled: boolean;
  /** Entered currency. */
  from: string;
  /** Target currency (the account / display currency). */
  to: string | null | undefined;
  /** Entered amount; the sign carries into `converted`. */
  amount: number;
  date: string;
}

/**
 * Debounced FX rate preview (GET /api/fx/preview) for a transaction whose
 * entered currency differs from the target currency. Idle when the two match.
 */
export function useFxPreview({ enabled, from, to, amount, date }: FxPreviewInput): FxPreview {
  const [preview, setPreview] = useState<FxPreview>({ state: "idle" });

  useEffect(() => {
    if (!enabled || !to || !from || !Number.isFinite(amount) || amount === 0 || from === to) {
      setPreview({ state: "idle" });
      return;
    }
    let cancelled = false;
    setPreview({ state: "loading" });
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        from,
        to,
        date,
        amount: String(Math.abs(amount)),
      });
      fetch(`/api/fx/preview?${params}`)
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (cancelled) return;
          if (!r.ok) {
            setPreview({ state: "error", message: d?.error ?? "Rate lookup failed" });
            return;
          }
          if (d?.needsOverride === true) {
            setPreview({ state: "needs-override" });
            return;
          }
          const sign = amount < 0 ? -1 : 1;
          setPreview({
            state: "ok",
            rate: Number(d.rate ?? 0),
            source: String(d.source ?? "—"),
            converted: sign * Number(d.converted ?? 0),
            date: String(d.date ?? date),
            to,
          });
        })
        .catch((e) => {
          if (!cancelled) setPreview({ state: "error", message: String(e?.message ?? "Network error") });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, from, to, amount, date]);

  return preview;
}
