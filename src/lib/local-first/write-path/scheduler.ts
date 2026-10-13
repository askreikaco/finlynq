/**
 * Drain scheduler (local-first L3). Decides WHEN the outbox drain runs; drain.ts decides what it sends.
 *
 * Triggers: window `online`, document `visibilitychange` to visible, a timer set to the next entry's backoff time
 * (nextAttemptAt), and kick() right after an enqueue. Single-flight: a trigger while a run is in progress is
 * folded into one follow-up run. stop() removes every listener and timer (lock, logout, untrusted device, flag off);
 * a run still in flight is not re-armed. A paused drain (signed out / locked, 401/403/423) arms no timer.
 * Nothing runs while the browser reports offline (navigator.onLine false); the `online` event resumes.
 */
import { isPasskeyLockedError } from "../crypto/passkey-unlock";
import type { DrainReport } from "./drain";
import type { OutboxEntry } from "./types";

export const SCHEDULER_MIN_DELAY_MS = 1_000;
export const SCHEDULER_MAX_DELAY_MS = 15 * 60_000 + 5_000;

export interface SchedulerDeps {
  drain: () => Promise<DrainReport>;
  /** Reads the outbox to find the next due time. */
  list: () => Promise<OutboxEntry[]>;
  /** Live check; false stops the scheduler. */
  allow?: () => boolean;
  now?: () => number;
  isOnline?: () => boolean;
  win?: Pick<Window, "addEventListener" | "removeEventListener"> | null;
  doc?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState"> | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

export interface DrainScheduler {
  start(): void;
  stop(): void;
  /** Request a drain now (after an enqueue). Resolves when that run has finished. */
  kick(): Promise<void>;
  readonly running: boolean;
}

export function createDrainScheduler(deps: SchedulerDeps): DrainScheduler {
  const now = deps.now ?? Date.now;
  const win = deps.win === undefined ? (typeof window === "undefined" ? null : window) : deps.win;
  const doc = deps.doc === undefined ? (typeof document === "undefined" ? null : document) : deps.doc;
  const isOnline = deps.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const setT = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearT = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let active = false;
  let timer: unknown = null;
  let inflight: Promise<void> | null = null;
  let again = false;

  const clearTimerNow = () => {
    if (timer !== null) clearT(timer);
    timer = null;
  };

  async function arm(): Promise<void> {
    clearTimerNow();
    if (!active) return;
    let due: number | null = null;
    try {
      for (const e of await deps.list()) if (e.status === "pending" && (due === null || e.nextAttemptAt < due)) due = e.nextAttemptAt;
    } catch {
      return;
    }
    if (!active || due === null) return;
    const delay = Math.min(SCHEDULER_MAX_DELAY_MS, Math.max(SCHEDULER_MIN_DELAY_MS, due - now()));
    timer = setT(() => {
      timer = null;
      void trigger();
    }, delay);
  }

  async function runOnce(): Promise<void> {
    do {
      again = false;
      if (!active) return;
      if (deps.allow && !deps.allow()) {
        stop();
        return;
      }
      if (!isOnline()) return;
      let paused = false;
      try {
        const report = await deps.drain();
        paused = report.paused || report.skipped;
      } catch (err) {
        // Passkey-locked: the outbox cannot be read. Paused until the page is unlocked (kick), no retry timer, no warning.
        if (isPasskeyLockedError(err)) paused = true;
        else console.warn("[local-first] drain failed", err);
      }
      if (!active) return;
      if (!paused) await arm();
    } while (again && active);
  }

  function trigger(): Promise<void> {
    if (!active) return Promise.resolve();
    if (inflight) {
      again = true;
      return inflight;
    }
    inflight = runOnce().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  const onOnline = () => void trigger();
  const onVisible = () => {
    if (doc && doc.visibilityState === "visible") void trigger();
  };

  function start(): void {
    if (active) return;
    active = true;
    win?.addEventListener("online", onOnline);
    doc?.addEventListener("visibilitychange", onVisible);
    void trigger();
  }

  function stop(): void {
    active = false;
    again = false;
    clearTimerNow();
    win?.removeEventListener("online", onOnline);
    doc?.removeEventListener("visibilitychange", onVisible);
  }

  return {
    start,
    stop,
    kick: () => trigger(),
    get running() {
      return active;
    },
  };
}
