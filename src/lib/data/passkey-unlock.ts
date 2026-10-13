/**
 * App-side facade for passkey unlock of the on-device copy (flag: localStorage "finlynq.lf.passkey" === "1").
 * Components import from here, never from src/lib/local-first directly (same rule as local-read-cache-wipe.ts).
 */
import { isPasskeyUnlockFlagOn } from "@/lib/local-first/crypto/passkey-unlock";

export {
  enablePasskeyUnlock,
  unlockWithPasskey,
  disablePasskeyUnlock,
  getPasskeyUnlockStatus,
  hasPasskeyUnlockedSession,
  type PasskeyResult,
  type PasskeyUnlockStatus,
} from "@/lib/local-first/crypto/passkey-unlock";

export const isPasskeyUnlockOn = isPasskeyUnlockFlagOn;
