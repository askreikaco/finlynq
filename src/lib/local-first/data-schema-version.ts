/**
 * Version token for everything persisted on the device (encrypted read-cache snapshot,
 * IndexedDB SWR cache). It binds the sealed snapshot manifest and the cache meta row.
 *
 * Bump ONLY when the persisted row/cache shape changes. It must NOT follow the deploy build
 * id (NEXT_PUBLIC_APP_BUILD): keying by build wiped the on-device copy on every deploy and
 * broke offline mode. A changed value makes old snapshots/caches read as "no snapshot"
 * (wipe and rehydrate from the server), never a crash.
 */
export const DATA_SCHEMA_VERSION = "ds1";
