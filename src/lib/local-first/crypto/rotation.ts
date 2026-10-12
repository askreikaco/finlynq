/**
 * On-device key rotation (local-first, crypto step). Flag-gated by the callers (Settings > Data > Offline mode).
 *
 * What rotates: the per-user device key that seals the offline outbox (queued, unsynced writes) and the read-cache
 * snapshot. The outbox is the only data that cannot be rebuilt, so it is re-sealed under the new key (see
 * OutboxStore.rotateKeys: keyring + sweep, crash-safe). The snapshot and the API data cache are copies of server data:
 * they are cleared and refill from the server. The server stays the source of truth throughout, so no rotation step
 * can lose server data; the worst case of a bug is an empty local copy.
 */
import type { OutboxStore } from "../write-path/outbox-store";
import { wipeSnapshotData } from "../read-cache/persist-store";
import { deviceKeys, type DeviceKeyMeta } from "./device-key-provider";

/** Keys older than this rotate on their own, when nothing is queued. */
export const AUTO_ROTATE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface RotationReport {
  rotated: boolean;
  outboxResealed: number;
  outboxDropped: number;
  snapshotCleared: boolean;
  dataCacheCleared: boolean;
}

export interface RotationDeps {
  outbox: OutboxStore;
  /** Defaults to deleting the read-cache snapshot database. */
  clearSnapshot?: (userId: string) => Promise<void>;
  /** Clears the on-device copy of API responses (the SWR cache). Optional: skipped when absent. */
  clearDataCache?: (userId: string) => Promise<void>;
}

async function attempt(fn: (() => Promise<void>) | undefined): Promise<boolean> {
  if (!fn) return false;
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

/** Rotates the device key, re-seals the outbox, clears the disposable copies. Never throws for a cache failure. */
export async function rotateOnDeviceKeys(userId: string, deps: RotationDeps): Promise<RotationReport> {
  const r = await deps.outbox.rotateKeys();
  if (!r.rotated) return { rotated: false, outboxResealed: 0, outboxDropped: 0, snapshotCleared: false, dataCacheCleared: false };
  // The old snapshot is sealed under the previous key and would be unreadable anyway: clear it so nothing stale lingers.
  const snapshotCleared = await attempt(() => (deps.clearSnapshot ?? wipeSnapshotData)(userId));
  const dataCacheCleared = await attempt(deps.clearDataCache ? () => deps.clearDataCache!(userId) : undefined);
  return { rotated: true, outboxResealed: r.resealed, outboxDropped: r.dropped, snapshotCleared, dataCacheCleared };
}

/** Pure policy: rotate a key of unknown age, or one older than maxAgeMs. */
export function shouldAutoRotate(meta: DeviceKeyMeta | null, now: number, maxAgeMs: number = AUTO_ROTATE_MAX_AGE_MS): boolean {
  if (!meta) return true;
  return now - (meta.rotatedAt ?? meta.createdAt) > maxAgeMs;
}

/**
 * Rotates on its own when the key is due AND nothing is queued. A pending sweep from an interrupted rotation is
 * always finished first. Returns the report, or null when nothing was done.
 */
export async function maybeAutoRotateKeys(userId: string, deps: RotationDeps, now: number = Date.now()): Promise<RotationReport | null> {
  await deps.outbox.finishPendingSweep();
  const ring = await deviceKeys.findKeyring(userId);
  if (!ring.current) return null; // no key yet: nothing to rotate
  if (!shouldAutoRotate(await deviceKeys.getKeyMeta(userId), now)) return null;
  if ((await deps.outbox.list()).length > 0) return null; // never auto-rotate over queued writes
  return rotateOnDeviceKeys(userId, deps);
}
