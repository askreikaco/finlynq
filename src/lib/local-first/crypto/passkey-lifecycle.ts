/**
 * Passkey lifecycle for the on-device offline data (local-first). PROTOTYPE, unreviewed.
 * Orders the record step (passkey-unlock.ts), the outbox re-seal (write-path/outbox-store.ts) and the snapshot wipe.
 *
 * ENROL (record first, then re-seal, then flip):
 *   1. ceremony, then the record is written with sealed = false. From here puts are double-sealed, and a reload leaves
 *      the page locked until the passkey is presented again.
 *   2. one re-seal transaction turns every single record into a double record; the commit sets sealed = true.
 *   3. any failure: the re-seal wrote nothing, so a second re-seal back to single runs and the record is deleted.
 *   The record goes first on purpose. Re-sealing first would leave double records with no record to unwrap their
 *   inner key after a crash, which is unrecoverable.
 *
 * FINISH (after any unlock): if the record still says sealed = false, re-seal again. Crash-safe and idempotent: records
 *   already double are left alone.
 *
 * DISABLE: needs the ceremony. One re-seal turns every double record back to single, the commit deletes the record.
 *   A crash before the commit leaves the record in place, so the page stays locked and disable can be run again.
 */
import { createOutboxStore, ResealError } from "../write-path/outbox-store";
import { wipeSnapshotData } from "../read-cache/persist-store";
import { deriveInnerKey } from "./passkey-seal";
import {
  enablePasskeyUnlock,
  readPasskeyUnlockRecord,
  setRecordSealed,
  unlockSecretFor,
  unlockWithPasskey,
  wipePasskeyUnlock,
  type PasskeyDeps,
  type PasskeyResult,
} from "./passkey-unlock";

function failedFrom(err: unknown): number | undefined {
  return err instanceof ResealError ? err.failed : undefined;
}

/** Enrols this browser for `userId` on the trusted device `deviceId`. Returns ok only when every record is double-sealed. */
export async function enrollPasskeySeal(userId: string, deviceId: string, deps?: PasskeyDeps): Promise<PasskeyResult> {
  const r = await enablePasskeyUnlock(userId, deps, deviceId);
  if (!r.ok) return r;
  const secret = unlockSecretFor(userId);
  if (!secret) return { ok: false, code: "failed" };
  const inner = await deriveInnerKey(secret, "outbox", userId);
  const box = createOutboxStore(userId, deviceId);
  try {
    const rep = await box.resealLayers({ fromInner: null, toInner: inner, commit: () => setRecordSealed(userId, true) });
    // The snapshot is a disposable copy of server data: it is rebuilt sealed. A leftover single snapshot is ignored by
    // the snapshot loader while enrolled, so a failed wipe here is not a leak.
    await wipeSnapshotData(userId).catch(() => undefined);
    return { ok: true, rewritten: rep.rewritten };
  } catch (err) {
    if (err instanceof ResealError) {
      // Nothing was written (the re-seal checks every record before it writes), so every record is still single.
      await wipePasskeyUnlock(userId).catch(() => undefined);
    } else {
      // A later step failed after records were written: they are double, so re-seal them back to single first.
      try {
        await box.resealLayers({ fromInner: inner, toInner: null, commit: () => wipePasskeyUnlock(userId) });
      } catch {
        // The record stays (the browser stays enrolled and locked). Unlock again to finish the rollback.
      }
    }
    return { ok: false, code: "failed", failed: failedFrom(err) };
  }
}

/**
 * After an unlock: completes an interrupted enrolment (record sealed = false). No-op when nothing is pending.
 * The device id comes from the record (stored at enrolment), so no network is needed.
 */
export async function finishPasskeySeal(userId: string): Promise<void> {
  const rec = await readPasskeyUnlockRecord(userId);
  if (!rec || rec.sealed !== false || !rec.deviceId) return;
  const secret = unlockSecretFor(userId);
  if (!secret) return;
  const inner = await deriveInnerKey(secret, "outbox", userId);
  await createOutboxStore(userId, rec.deviceId).resealLayers({ fromInner: inner, toInner: inner, commit: () => setRecordSealed(userId, true) });
}

/** Turns passkey unlock off for `userId`: ceremony if needed, re-seal back to single, delete the record. */
export async function disablePasskeySeal(
  userId: string,
  deviceId: string,
  opts: { unsyncedCount: number; confirmed: boolean },
  deps?: PasskeyDeps,
): Promise<PasskeyResult> {
  if (opts.unsyncedCount > 0 && !opts.confirmed) return { ok: false, code: "unsynced_blocked" };
  if (!unlockSecretFor(userId)) {
    const u = await unlockWithPasskey(userId, deps);
    if (!u.ok) return u;
  }
  const secret = unlockSecretFor(userId);
  if (!secret) return { ok: false, code: "failed" };
  const inner = await deriveInnerKey(secret, "outbox", userId);
  try {
    await createOutboxStore(userId, deviceId).resealLayers({ fromInner: inner, toInner: null, commit: () => wipePasskeyUnlock(userId) });
  } catch (err) {
    return { ok: false, code: "failed", failed: failedFrom(err) };
  }
  await wipeSnapshotData(userId).catch(() => undefined);
  return { ok: true };
}
