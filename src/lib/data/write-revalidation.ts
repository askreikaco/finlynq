/**
 * "An edit refreshes only what is on screen" (performance plan, Phase 1).
 *
 * The app's writes are ~244 hand-written fetch() calls. Rather than touch each,
 * a successful same-origin write (POST/PUT/PATCH/DELETE to /api/*) schedules ONE
 * revalidation of the API keys currently in the SWR cache. SWR only refetches keys
 * with a mounted hook — the metrics on screen — and every other cached screen
 * revalidates when it is next shown (revalidateIfStale), painting its cached copy
 * first. Writes that cannot change displayed data (auth, telemetry, per-user UI
 * prefs) are excluded.
 */
import { mutate } from "swr";

const NO_REVALIDATE: RegExp[] = [
  /^\/api\/auth\//,
  /^\/api\/csp-report/,
  /^\/api\/metrics/,
  /^\/api\/feedback/,
  /^\/api\/version/,
  /^\/api\/settings\/(tx-columns|tx-filters|tx-sort|dashboard-layout|account-group-order|dropdown-order|api-key|change-password|change-email|passkeys|recovery-codes|sign-in-methods|devices|connected-apps)/,
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isRevalidatingWrite(method: string | undefined, path: string): boolean {
  if (!WRITE_METHODS.has((method ?? "GET").toUpperCase())) return false;
  if (!path.startsWith("/api/")) return false;
  return !NO_REVALIDATE.some((re) => re.test(path));
}

/** SWR keys this app caches are request URLs; only API keys are revalidated. */
export function isApiKey(key: unknown): boolean {
  return typeof key === "string" && key.startsWith("/api/");
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Coalesce a burst of writes (bulk edits, multi-step saves) into one refresh. */
export function scheduleRevalidation(delayMs = 60): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void mutate(isApiKey);
  }, delayMs);
}

function pathOf(input: RequestInfo | URL): string | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname : null;
  } catch {
    return null;
  }
}

/** Wrap window.fetch once; returns an uninstall function. */
export function installWriteRevalidation(): () => void {
  if (typeof window === "undefined") return () => {};
  const orig = window.fetch;
  const wrapped: typeof window.fetch = async (input, init) => {
    const res = await orig(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const path = pathOf(input);
    if (res.ok && path && isRevalidatingWrite(method, path)) scheduleRevalidation();
    return res;
  };
  window.fetch = wrapped;
  return () => {
    if (window.fetch === wrapped) window.fetch = orig;
  };
}
