/**
 * Software WebAuthn authenticator (ES256, attestation "none") that produces
 * REAL attestation / assertion payloads in the browser JSON shape. Used to
 * drive the genuine @simplewebauthn/server verification (nothing mocked).
 * Knobs let tests forge wrong origin / rpID / UV / counter / key.
 */
import crypto from "crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");
const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest();

export interface Knobs {
  origin: string;
  rpId: string;
  uv?: boolean; // default true
  up?: boolean; // default true
  backedUp?: boolean;
}

export class SoftAuthenticator {
  readonly credentialId = crypto.randomBytes(32);
  counter = 0;
  readonly signCounterEnabled: boolean;
  private privateKey: crypto.KeyObject;
  private publicJwk: { x: string; y: string };

  constructor(opts: { counters?: boolean } = {}) {
    this.signCounterEnabled = opts.counters ?? true;
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: "jwk" }) as { x: string; y: string };
    this.publicJwk = { x: jwk.x, y: jwk.y };
  }

  get id(): string {
    return b64u(this.credentialId);
  }

  private coseKey(): Uint8Array {
    return isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty EC2
        [3, -7], // alg ES256
        [-1, 1], // crv P-256
        [-2, Buffer.from(this.publicJwk.x, "base64url")],
        [-3, Buffer.from(this.publicJwk.y, "base64url")],
      ])
    );
  }

  private flags(k: Knobs, attested: boolean): number {
    let f = 0;
    if (k.up !== false) f |= 0x01;
    if (k.uv !== false) f |= 0x04;
    if (k.backedUp) f |= 0x08 | 0x10;
    if (attested) f |= 0x40;
    return f;
  }

  private counterBytes(n: number): Buffer {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n >>> 0);
    return b;
  }

  private clientData(type: "webauthn.create" | "webauthn.get", challenge: string, origin: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  }

  attest(challenge: string, k: Knobs, transports: string[] = ["internal"]): RegistrationResponseJSON {
    const cose = this.coseKey();
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(k.rpId),
      Buffer.from([this.flags(k, true)]),
      this.counterBytes(this.counter),
      Buffer.alloc(16), // aaguid zeros
      credIdLen,
      this.credentialId,
      Buffer.from(cose),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]) as never
    );
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(this.clientData("webauthn.create", challenge, k.origin)),
        attestationObject: b64u(attestationObject),
        transports: transports as never,
      },
    };
  }

  /** `counter`: explicit authenticator counter; default = increment (if counters enabled). */
  assert(
    challenge: string,
    k: Knobs,
    o: { counter?: number; userHandle?: string; signWith?: SoftAuthenticator } = {}
  ): AuthenticationResponseJSON {
    if (o.counter !== undefined) this.counter = o.counter;
    else if (this.signCounterEnabled) this.counter += 1;
    const authData = Buffer.concat([sha256(k.rpId), Buffer.from([this.flags(k, false)]), this.counterBytes(this.counter)]);
    const cd = this.clientData("webauthn.get", challenge, k.origin);
    const signer = o.signWith ?? this;
    const signature = crypto.sign("sha256", Buffer.concat([authData, sha256(cd)]), signer.privateKey);
    return {
      id: this.id,
      rawId: this.id,
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(cd),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        ...(o.userHandle ? { userHandle: o.userHandle } : {}),
      },
    };
  }
}
