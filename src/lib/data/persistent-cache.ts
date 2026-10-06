/**
 * SWR cache provider backed by memory, pre-filled from (and written through to)
 * the encrypted on-device store in persist.ts. Only safe `/api/*` string keys with data
 * are persisted, and only while `enabled()` (trusted device, DEK unlocked).
 *
 * Uses a fail-closed ALLOW-LIST of safe keys plus a BLOCK-LIST secondary layer.
 * Hydration skips blocked keys (they are purged separately by purgeDisallowed in persist.ts).
 */
import { savePersisted } from "./persist";
import { isSafeToNeverPersist, isSafeToPersist } from "./persist-policy";

type State = { data?: unknown; [k: string]: unknown };

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
      // Even when disabled, don't drop removal entries (they purge sensitive data)
      // Only drop data writes, keep undefined (removals) for persistence
      const batch = new Map<string, unknown>();
      for (const [k, v] of queue) {
        if (v === undefined) batch.set(k, undefined);
      }
      queue.clear();
      if (batch.size > 0) {
        void savePersisted(opts.userId, opts.build, batch).catch(() => undefined);
      }
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
      if (isSafeToPersist(key) && value?.data !== undefined && value.data !== prev && opts.enabled()) {
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
      if (isSafeToPersist(k)) {
        // Restore only safe keys to memory
        Map.prototype.set.call(map, k, { data });
      } else if (isSafeToNeverPersist(k)) {
        // Queue blocked keys for deletion to purge old encrypted entries
        queue.set(k, undefined);
      }
    }
  }
  // Trigger purge of blocked keys if any were found
  if (queue.size > 0 && opts.enabled()) {
    schedule();
  }
  return map;
}
