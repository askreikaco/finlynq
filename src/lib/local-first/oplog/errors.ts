/**
 * Error classes for the op-log codec. PROTOTYPE, unreviewed.
 * Messages are fixed strings; they carry no key or plaintext detail.
 */
export { AuthError } from "../crypto/aead";

/** Frame bytes end before the length prefix says they should (checked before any decryption). */
export class TruncatedFrameError extends Error {
  constructor() {
    super("truncated frame");
    this.name = "TruncatedFrameError";
  }
}

/** Frame version byte is not 2. */
export class UnsupportedVersionError extends Error {
  readonly version: number;
  constructor(version: number) {
    super("unsupported frame version");
    this.name = "UnsupportedVersionError";
    this.version = version;
  }
}

/** A write tried to replace an existing (deviceId, seq) log entry. The log is append-only. */
export class AppendOnlyViolation extends Error {
  constructor() {
    super("append-only violation");
    this.name = "AppendOnlyViolation";
  }
}

/** Frame is structurally invalid (bad header field, trailing bytes, bad id). Checked before any decryption. */
export class MalformedFrameError extends Error {
  constructor(reason: string) {
    super(`malformed frame: ${reason}`);
    this.name = "MalformedFrameError";
  }
}
