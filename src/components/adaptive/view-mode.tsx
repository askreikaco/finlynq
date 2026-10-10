"use client";

/**
 * Cards / List choice for a data view (G2-08, owner D6 and D6b).
 *
 * - Default per view key and size class: VIEW_MODE_DEFAULTS (one table).
 * - Stored per user, per view, per size class in localStorage under `pf-view-mode`
 *   (JSON object keyed `${viewKey}:${sizeClass}`). A choice on one size class never
 *   changes another. Without a userId nothing is read or written (in-memory only).
 * - SSR and the first client render use the default for "compact" (the context default);
 *   the stored choice is applied after mount, so hydration never mismatches.
 * - DataView mounts neither view until the stored choice is loaded (`pending`), so the default
 *   view never flashes and is never mounted and unmounted.
 * - All hooks share one in-memory store, so ViewModeToggle and DataView on the same page
 *   always agree. The session user id is one shared request (user-storage.ts).
 */

import * as React from "react";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SizeClass } from "@/components/ui/size-class";
import { readUserItem, writeUserItem, useSessionUserId } from "@/lib/client/user-storage";
import { useAppSizeClass } from "./size-class-context";

export type ViewMode = "cards" | "list";

/** Per-user localStorage base; stored as `pf-view-mode:${userId}`. */
export const VIEW_MODE_STORAGE_KEY = "pf-view-mode";

/** Longest DataView waits for the session before it shows the default view (ms). */
export const VIEW_MODE_SESSION_WAIT_MS = 2500;

export type ViewKey = "transactions" | "accounts" | "portfolio" | "budgets" | "goals" | "loans" | "subscriptions";

/**
 * Default view per view key and size class (owner D6). Edit only here.
 * Compact: cards. Regular: cards, except transactions (list). Wide: list.
 */
export const VIEW_MODE_DEFAULTS: Record<ViewKey, Record<SizeClass, ViewMode>> = {
  transactions: { compact: "cards", regular: "list", wide: "list" },
  accounts: { compact: "cards", regular: "cards", wide: "list" },
  portfolio: { compact: "cards", regular: "cards", wide: "list" },
  budgets: { compact: "cards", regular: "cards", wide: "list" },
  goals: { compact: "cards", regular: "cards", wide: "list" },
  loans: { compact: "cards", regular: "cards", wide: "list" },
  subscriptions: { compact: "cards", regular: "cards", wide: "list" },
};

/** Used only for a view key missing from VIEW_MODE_DEFAULTS (untyped callers). */
const FALLBACK_DEFAULTS: Record<SizeClass, ViewMode> = { compact: "cards", regular: "cards", wide: "list" };

export function defaultViewMode(viewKey: ViewKey, sizeClass: SizeClass): ViewMode {
  return (VIEW_MODE_DEFAULTS[viewKey] ?? FALLBACK_DEFAULTS)[sizeClass];
}

export function viewModeKey(viewKey: ViewKey, sizeClass: SizeClass): string {
  return `${viewKey}:${sizeClass}`;
}

export function isViewMode(value: unknown): value is ViewMode {
  return value === "cards" || value === "list";
}

type Prefs = Record<string, ViewMode>;
/** Store snapshot. loadedFor: the user these prefs belong to (undefined = nothing loaded yet). */
type Store = { loadedFor: string | null | undefined; prefs: Prefs };

const EMPTY_PREFS: Prefs = {};
const INITIAL_STORE: Store = { loadedFor: undefined, prefs: EMPTY_PREFS };
const listeners = new Set<() => void>();
/** Replaced (never mutated) on every change, so useSyncExternalStore sees each update. */
let store: Store = INITIAL_STORE;
/** Choices made before the session resolved. Applied to the first user that loads (see flushQueued). */
let queued: Array<{ key: string; mode: ViewMode }> = [];

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStore(): Store {
  return store;
}

function getServerStore(): Store {
  return INITIAL_STORE;
}

function emit(next: Store): void {
  store = next;
  for (const listener of listeners) listener();
}

/** Parse the stored JSON. Unknown keys and values are dropped. Never throws. */
export function parseViewModePrefs(raw: string | null): Prefs {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Prefs = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isViewMode(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function readStoredPrefs(userId: string): Prefs {
  return parseViewModePrefs(readUserItem(VIEW_MODE_STORAGE_KEY, userId));
}

/** Make the store hold this user's prefs. Synchronous: the storage read needs no request. */
function loadPrefsFor(userId: string | null): void {
  if (store.loadedFor === userId) return;
  emit({ loadedFor: userId, prefs: userId ? readStoredPrefs(userId) : EMPTY_PREFS });
}

/** Apply choices queued before the session resolved, once the user is known. */
function flushQueued(userId: string | null): void {
  if (queued.length === 0) return;
  loadPrefsFor(userId);
  const items = queued;
  queued = [];
  let next = userId ? readStoredPrefs(userId) : store.prefs;
  for (const { key, mode } of items) next = { ...next, [key]: mode };
  if (userId) writeUserItem(VIEW_MODE_STORAGE_KEY, userId, JSON.stringify(next));
  emit({ loadedFor: userId, prefs: next });
}

function storeMode(userId: string | null, key: string, mode: ViewMode): void {
  loadPrefsFor(userId);
  if (!userId) {
    // No user: in-memory only, nothing written to storage.
    emit({ loadedFor: null, prefs: { ...store.prefs, [key]: mode } });
    return;
  }
  const next = { ...readStoredPrefs(userId), [key]: mode };
  writeUserItem(VIEW_MODE_STORAGE_KEY, userId, JSON.stringify(next));
  emit({ loadedFor: userId, prefs: next });
}

/**
 * Mode for one view at the current size class, plus `pending`: true until the session has resolved
 * and this user's stored prefs are loaded. A signed-out (null) user is never pending once the
 * session has resolved. DataView waits for `pending` before mounting either view.
 * setMode persists per user; a call before the session resolves is queued and applied on load.
 */
export function useViewModeState(viewKey: ViewKey): { mode: ViewMode; setMode: (mode: ViewMode) => void; pending: boolean } {
  const sizeClass = useAppSizeClass();
  const { userId, ready } = useSessionUserId();
  const snap = React.useSyncExternalStore(subscribe, getStore, getServerStore);
  // After VIEW_MODE_SESSION_WAIT_MS without an answer, show the default view for this size class.
  // The session request keeps running: when it answers, the stored choice applies.
  const [waitedOut, setWaitedOut] = React.useState(false);
  React.useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setWaitedOut(true), VIEW_MODE_SESSION_WAIT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  // Layout effect: the stored prefs land in the same commit, before paint and before any observer
  // sees the DOM, so DataView never shows its pending placeholder for a frame after the session resolves.
  React.useLayoutEffect(() => {
    if (!ready) return;
    loadPrefsFor(userId);
    flushQueued(userId);
  }, [ready, userId]);

  const loaded = ready && (userId === null || snap.loadedFor === userId);
  // Only prefs that belong to this user; a store still holding another user's prefs shows none.
  const current = ready && snap.loadedFor === userId ? snap.prefs : EMPTY_PREFS;
  const key = viewModeKey(viewKey, sizeClass);
  const mode = current[key] ?? defaultViewMode(viewKey, sizeClass);

  const setMode = React.useCallback(
    (next: ViewMode) => {
      if (!isViewMode(next)) return;
      if (!ready) {
        queued = [...queued, { key, mode: next }];
        return;
      }
      storeMode(userId, key, next);
    },
    [ready, userId, key],
  );

  return { mode, setMode, pending: !loaded && !waitedOut };
}

/**
 * [mode, setMode] for one view at the current size class.
 * setMode persists per user (see module header). Invalid values are ignored.
 */
export function useViewMode(viewKey: ViewKey): [ViewMode, (mode: ViewMode) => void] {
  const { mode, setMode } = useViewModeState(viewKey);
  return [mode, setMode];
}

const OPTIONS: ReadonlyArray<{ mode: ViewMode; label: string; Icon: typeof LayoutGrid }> = [
  { mode: "cards", label: "Cards", Icon: LayoutGrid },
  { mode: "list", label: "List", Icon: List },
];

/**
 * Two-segment Cards / List control. A radiogroup with arrow-key movement.
 * Targets are 32px on fine pointers and 44px on coarse pointers.
 */
export function ViewModeToggle({ viewKey, className }: { viewKey: ViewKey; className?: string }) {
  const [mode, setMode] = useViewMode(viewKey);
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const move = (from: number, delta: number) => {
    const next = (from + delta + OPTIONS.length) % OPTIONS.length;
    setMode(OPTIONS[next].mode);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="View"
      className={cn("inline-grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-card p-0.5", className)}
    >
      {OPTIONS.map(({ mode: option, label, Icon }, i) => {
        const selected = option === mode;
        return (
          <button
            key={option}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setMode(option)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              "pointer-coarse:h-11 pointer-coarse:px-4",
              selected ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
