/**
 * Refresh every transaction list after a write (create, edit, delete).
 *
 * Two kinds of cache keys hold a transactions list:
 *  - plain keys ("/api/transactions?...") from single-request fetches. The
 *    filter-based mutate reaches these.
 *  - infinite keys ("$inf$/api/transactions?...") from useSWRInfinite (the
 *    paged list). SWR's filter-based mutate skips every key that starts with
 *    "$inf$" (swr/dist/_internal, mutate: `!/^\$(inf|sub)\$/.test(key)`), so a
 *    filter alone never refreshes a paged list. Each infinite key is passed to
 *    mutate directly, which revalidates all loaded pages of that list.
 */
import type { Cache, ScopedMutator } from "swr";

const PLAIN_PREFIX = "/api/transactions";
const INFINITE_PREFIX = `$inf$${PLAIN_PREFIX}`;

export async function revalidateTransactionLists(mutate: ScopedMutator, cache: Cache): Promise<void> {
  const infiniteKeys: string[] = [];
  for (const key of cache.keys()) {
    if (key.startsWith(INFINITE_PREFIX)) infiniteKeys.push(key);
  }
  await Promise.all([
    mutate((k) => typeof k === "string" && k.startsWith(PLAIN_PREFIX)),
    ...infiniteKeys.map((key) => mutate(key)),
  ]);
}
