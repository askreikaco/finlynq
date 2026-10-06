/**
 * SWR cache provider backed by memory, pre-filled from (and written through to)
 * the encrypted on-device store in persist.ts. Only safe `/api/*` string keys with data
 * are persisted, and only while `enabled()` (trusted device, DEK unlocked).
 *
 * Uses a fail-closed ALLOW-LIST of safe keys (financial data needed for cold start),
 * plus a BLOCK-LIST to catch any bypasses. Existing blocked keys in the encrypted store
 * are purged on hydration to prevent stale sensitive data reuse.
 */
import { savePersisted } from "./persist";

type State = { data?: unknown; [k: string]: unknown };

/**
 * Allowed key prefixes (fail-closed). Keys must match one of these AND not match NEVER_PERSIST.
 * Derived from actual useApi/useSWR calls in src that provide cold-start performance for
 * financial screens. Safe display-only settings included (language, currency, sort preferences).
 */
const PERSIST_ALLOWED = new Set([
  "/api/accounts",
  "/api/age-of-money",
  "/api/budgets",
  "/api/categories",
  "/api/dashboard",
  "/api/fire",
  "/api/forecast",
  "/api/goals",
  "/api/health-score",
  "/api/holdings",
  "/api/loans",
  "/api/portfolio",
  "/api/prices",
  "/api/recap",
  "/api/reconcile/links",
  "/api/reconcile/summary",
  "/api/recurring",
  "/api/reports",
  "/api/rebalancing",
  "/api/scenarios",
  "/api/securities",
  "/api/subscriptions",
  "/api/transactions",
  // Safe settings: display-only preferences, no credentials/secrets
  "/api/settings/account-group-order",
  "/api/settings/active-currencies",
  "/api/settings/dashboard-layout",
  "/api/settings/dev-mode",
  "/api/settings/display-currency",
  "/api/settings/dropdown-order",
  "/api/settings/language",
  "/api/settings/reconcile-thresholds",
  "/api/settings/reporting-currency",
  "/api/settings/tx-columns",
  "/api/settings/tx-filters",
  "/api/settings/tx-sort",
  "/api/spotlight",
  "/api/tax",
]);

/**
 * Keys that must NEVER be persisted: auth/security/sensitive settings.
 * Blocks: auth, admin, oauth, family, import, prompts, chat, feedback, user,
 * and sensitive account settings.
 */
const NEVER_PERSIST = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/admin(\/|$)/,
  /^\/api\/oauth(\/|$)/,
  /^\/api\/family(\/|$)/,
  /^\/api\/import(\/|$)/,
  /^\/api\/prompts(\/|$)/,
  /^\/api\/feedback(\/|$)/,
  /^\/api\/chat(\/|$)/,
  /^\/api\/user(\/|$)/,
  /^\/api\/settings\/(sign-in-methods|devices|connected-apps|passkeys|recovery-codes|api-key|change-|bank-feeds|backfill|email-retention|confirm-csv-mapping|reconcile-hidden-accounts|reporting-currency\/status)(\/|$)/,
];

function normalizeKey(key: string): string {
  try {
    // Decode percent-encoding (handles %2F, %61, etc.)
    let normalized = decodeURIComponent(key);
    // Lower-case for consistent matching
    normalized = normalized.toLowerCase();
    // Remove fragment
    normalized = normalized.split("#")[0];
    // Remove query string
    normalized = normalized.split("?")[0];
    // Collapse multiple slashes
    normalized = normalized.replace(/\/+/g, "/");
    // Reject path traversal
    if (normalized.includes("..")) return "";
    // Strip all trailing slashes
    normalized = normalized.replace(/\/+$/, "");
    return normalized;
  } catch {
    return "";
  }
}

function isSafeToNeverPersist(key: string): boolean {
  if (typeof key !== "string" || !key.startsWith("/api/")) return false;

  const normalized = normalizeKey(key);
  if (!normalized) return false;

  // Must match block-list (these should NEVER persist)
  return NEVER_PERSIST.some((pattern) => pattern.test(normalized));
}

function isSafeToPersist(key: string): boolean {
  if (typeof key !== "string" || !key.startsWith("/api/")) return false;

  const normalized = normalizeKey(key);
  if (!normalized) return false;

  // Must NOT match block-list
  if (isSafeToNeverPersist(key)) return false;

  // Must match allow-list prefix
  return Array.from(PERSIST_ALLOWED).some((allowed) => normalized === allowed || normalized.startsWith(allowed + "/"));
}

export function createPersistentCache(opts: {
  userId: string;
  build: string;
  initial: Map<string, unknown>;
  enabled: () => boolean;
  flushDelayMs?: number;
}): Map<string, State> {
  const queue = new Map<string, unknown>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    if (!opts.enabled()) {
      queue.clear();
      return;
    }
    const batch = new Map(queue);
    queue.clear();
    void savePersisted(opts.userId, opts.build, batch).catch(() => undefined);
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, opts.flushDelayMs ?? 500);
  };

  class PersistentMap extends Map<string, State> {
    set(key: string, value: State): this {
      const prev = super.get(key)?.data;
      super.set(key, value);
      if (
        isSafeToPersist(key) &&
        value?.data !== undefined &&
        value.data !== prev &&
        opts.enabled()
      ) {
        queue.set(key, value.data);
        schedule();
      }
      return this;
    }
    delete(key: string): boolean {
      if (typeof key === "string" && key.startsWith("/api/")) {
        if (isSafeToNeverPersist(key) && opts.enabled()) {
          // Always queue removal of blocked keys to purge old encrypted entries
          queue.set(key, undefined);
          schedule();
        } else if (isSafeToPersist(key) && opts.enabled()) {
          // Normal delete for safe keys
          queue.set(key, undefined);
          schedule();
        }
      }
      return super.delete(key);
    }
  }

  const map = new PersistentMap();
  for (const [k, data] of opts.initial) {
    if (typeof k === "string") {
      if (isSafeToNeverPersist(k)) {
        // Purge blocked keys from memory AND queue for deletion from store
        if (opts.enabled()) {
          queue.set(k, undefined);
        }
      } else if (isSafeToPersist(k)) {
        // Restore only safe keys to memory
        Map.prototype.set.call(map, k, { data });
      }
    }
  }
  if (queue.size > 0 && opts.enabled()) {
    schedule();
  }
  return map;
}
