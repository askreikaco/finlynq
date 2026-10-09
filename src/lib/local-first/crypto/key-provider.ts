/**
 * KeyProvider seam (D2/D3/D6). PROTOTYPE, unreviewed.
 * DevPassphraseKeyProvider: dev-only, NO auth, NO network. The caller persists the 16-byte salt
 * (e.g. in the prototype IndexedDB) and passes it back on the next run.
 */
import {
  ARGON2_SET_A,
  deriveKeysFromPassphrase,
  type Argon2Params,
  type LogKeys,
} from "./kdf";

export type { LogKeys };

export interface KeyProvider {
  getKeys(logId: string): Promise<LogKeys>;
}

export const DEV_SALT_BYTES = 16;

export function generateDevSalt(): Uint8Array {
  const s = new Uint8Array(DEV_SALT_BYTES);
  globalThis.crypto.getRandomValues(s);
  return s;
}

export interface DevPassphraseKeyProviderOptions {
  passphrase: string;
  /** Persisted salt from an earlier run. Omit to generate a fresh random 16-byte salt. */
  salt?: Uint8Array;
  params?: Argon2Params;
}

export class DevPassphraseKeyProvider implements KeyProvider {
  /** Caller must persist this and supply it next time to get the same keys. */
  readonly salt: Uint8Array;
  private readonly passphrase: string;
  private readonly params: Argon2Params;
  private readonly cache = new Map<string, Promise<LogKeys>>();

  constructor(opts: DevPassphraseKeyProviderOptions) {
    if (opts.passphrase.length === 0) throw new Error("passphrase must not be empty");
    if (opts.salt !== undefined && opts.salt.length !== DEV_SALT_BYTES) {
      throw new Error(`salt must be ${DEV_SALT_BYTES} bytes`);
    }
    this.passphrase = opts.passphrase;
    this.salt = opts.salt ? new Uint8Array(opts.salt) : generateDevSalt();
    this.params = opts.params ?? ARGON2_SET_A;
  }

  getKeys(logId: string): Promise<LogKeys> {
    let p = this.cache.get(logId);
    if (!p) {
      p = deriveKeysFromPassphrase(this.passphrase, this.salt, logId, this.params);
      p.catch(() => this.cache.delete(logId));
      this.cache.set(logId, p);
    }
    return p;
  }
}
