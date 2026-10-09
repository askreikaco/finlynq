"use client";

/**
 * Density preference (G2-08, owner D-density). Device-level, like pf-font: stored in
 * localStorage under `pf-density`, never per user, never synced.
 *
 * Sets data-density="comfortable|compact" on <html>. The `dense:` variant
 * (globals.css) matches descendants of [data-density=compact]. The FOUC script in
 * src/app/layout.tsx sets "compact" before first paint; this provider syncs state after mount.
 */

import * as React from "react";

export type Density = "comfortable" | "compact";
export const DENSITY_OPTIONS: readonly Density[] = ["comfortable", "compact"];
/** Device-level localStorage key. layout.tsx hardcodes the same string in its FOUC script. */
export const DENSITY_STORAGE_KEY = "pf-density";
export const DEFAULT_DENSITY: Density = "comfortable";

interface DensityContextValue {
  density: Density;
  setDensity: (density: Density) => void;
}

const DensityContext = React.createContext<DensityContextValue | null>(null);

export function isDensity(value: unknown): value is Density {
  return value === "comfortable" || value === "compact";
}

function applyDensity(density: Density): void {
  document.documentElement.setAttribute("data-density", density);
}

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = React.useState<Density>(DEFAULT_DENSITY);

  // Read after mount (never during render) so SSR and hydration render the default.
  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(DENSITY_STORAGE_KEY);
    } catch {
      // Storage blocked: default.
    }
    const next = isDensity(stored) ? stored : DEFAULT_DENSITY;
    setDensityState(next);
    applyDensity(next);
  }, []);

  const setDensity = React.useCallback((next: Density) => {
    if (!isDensity(next)) return;
    setDensityState(next);
    applyDensity(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // Storage blocked: applies for this session only.
    }
  }, []);

  const value = React.useMemo(() => ({ density, setDensity }), [density, setDensity]);
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

/** Current density and setter. Outside a provider: the default, and a no-op setter. */
export function useDensity(): DensityContextValue {
  const ctx = React.useContext(DensityContext);
  return ctx ?? { density: DEFAULT_DENSITY, setDensity: () => {} };
}
