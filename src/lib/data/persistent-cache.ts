/**
 * SWR cache provider backed by memory, pre-filled from (and written through to)
 * the encrypted on-device store in persist.ts. Only `/api/*` string keys with data
 * are persisted, and only while `enabled()` (trusted device, DEK unlocked).
 */
import { savePersisted } from "./persist";

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
      if (typeof key === "string" && key.startsWith("/api/") && value?.data !== undefined && value.data !== prev && opts.enabled()) {
        queue.set(key, value.data);
        schedule();
      }
      return this;
    }
    delete(key: string): boolean {
      if (typeof key === "string" && key.startsWith("/api/") && opts.enabled()) {
        queue.set(key, undefined);
        schedule();
      }
      return super.delete(key);
    }
  }

  const map = new PersistentMap();
  for (const [k, data] of opts.initial) Map.prototype.set.call(map, k, { data });
  return map;
}
