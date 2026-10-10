/**
 * "This and following" edit of an installment row (PUT /api/transactions { scope: "following" }):
 * the note suffix helpers. Pure: no I/O.
 *
 * Every installment note ends with its own " n/N" suffix (written by POST /api/transactions/installments).
 * A shared note edit must not overwrite the other rows' suffixes, so the edited row's suffix is stripped
 * from the submitted note and each row's own suffix is appended again.
 */

const SUFFIX_RE = /(?:^|\s)(\d+\/\d+)\s*$/;

/** The trailing "n/N" of an installment note, or null. */
export function installmentSuffix(note: string | null | undefined): string | null {
  const m = SUFFIX_RE.exec(note ?? "");
  return m ? m[1] : null;
}

/** The note without its trailing "n/N" suffix (trimmed). */
export function stripInstallmentSuffix(note: string | null | undefined): string {
  return (note ?? "").replace(SUFFIX_RE, "").trim();
}

/** A row's note for a shared base note: base + the row's own suffix ("" parts are dropped). */
export function withInstallmentSuffix(base: string, suffix: string | null): string {
  const b = base.trim();
  if (!suffix) return b;
  return b ? `${b} ${suffix}` : suffix;
}
