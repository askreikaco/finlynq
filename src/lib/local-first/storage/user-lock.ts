/**
 * Exclusive per-name lock for on-device store operations that must not interleave (outbox writes vs a key rotation).
 * In-process: a promise chain per name. Across tabs: the Web Locks API when the browser has it.
 * Not re-entrant: never call withUserLock from inside a function already running under the same name.
 */
const chains = new Map<string, Promise<unknown>>();

export function withUserLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: { request<R>(n: string, o: { mode: "exclusive" }, cb: () => Promise<R>): Promise<R> } } }).navigator?.locks;
  const run = locks ? () => locks.request(name, { mode: "exclusive" }, fn) : fn;
  const prev = chains.get(name) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  chains.set(name, tail);
  void tail.then(() => {
    if (chains.get(name) === tail) chains.delete(name);
  });
  return next;
}
