import { tryDecryptField } from "@/lib/crypto/envelope";

/**
 * Decrypt a row's listed text fields in place.
 *
 * Mutates a `decryptFailures` counter on the caller. We intentionally write
 * `null` to the field on auth-tag failure rather than the raw `v1:` ciphertext
 * (the previous `?? v` fallback) — embedding ciphertext in a backup leaks
 * it past the user's session and would trip the "tryDecryptField returns
 * null on failure" invariant from CLAUDE.md.
 */
export function decryptRowFields(
  dek: Buffer | null,
  row: Record<string, unknown>,
  fields: readonly string[],
  failures: { count: number }
): Record<string, unknown> {
  if (!dek) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === "string") {
      const dec = tryDecryptField(dek, v, `export.${f}`);
      if (dec === null && v.startsWith("v1:")) {
        // Auth-tag failure on a real envelope — preserve the row but mark
        // the field null and bump the counter so the caller can surface
        // a partial-export warning.
        out[f] = null;
        failures.count++;
      } else {
        out[f] = dec ?? v;
      }
    }
  }
  return out;
}
