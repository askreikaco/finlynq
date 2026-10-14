import { useSyncExternalStore } from "react";

/** Runtime env flags from GET /api/config/flags (replaces props server wrapper pages/layouts passed down). */
export type Flags = { categoriesMerged: boolean; instanceAdmin: boolean; familyWealth: boolean; apiBuild: string | null };

const STORAGE_KEY = "spa-flags";
// familyWealth defaults ON like the server (lib/family/flag.ts); instanceAdmin defaults OFF (lib/admin/instance-flag.ts).
export const FLAG_DEFAULTS: Flags = { categoriesMerged: false, instanceAdmin: false, familyWealth: true, apiBuild: null };
const DEFAULTS = FLAG_DEFAULTS;

function readStored(): Flags {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Flags>) };
  } catch {
    // storage unavailable: defaults
  }
  return DEFAULTS;
}

let current: Flags = readStored();
let loaded = false;
const listeners = new Set<() => void>();

function set(next: Flags) {
  if (JSON.stringify(next) === JSON.stringify(current) && loaded) return;
  current = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

/** Start the fetch early (main.tsx calls it before first render); safe to call repeatedly. */
export function loadFlags(): Promise<void> {
  return fetch("/api/config/flags", { credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<Flags>>) : null))
    .then((j) => {
      if (j) set({ ...DEFAULTS, ...j });
    })
    .catch(() => undefined);
}

/** True once /api/config/flags answered in this page load (stored values from a previous visit do not count). */
export function useFlagsLoaded(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => loaded,
    () => false,
  );
}

export function useFlags(): Flags {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULTS,
  );
}
