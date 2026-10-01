/** zod shapes for the browser's WebAuthn JSON (bounded: these arrive pre-verification). */
import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

const b64 = z.string().min(1).max(16384);
const ext = z.record(z.string().max(64), z.unknown()).default({});

export const registrationResponseSchema = z.object({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: ext,
  response: z.object({
    clientDataJSON: b64,
    attestationObject: b64,
    authenticatorData: b64.optional(),
    transports: z.array(z.string().max(32)).max(8).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    publicKey: b64.optional(),
  }),
}) as unknown as z.ZodType<RegistrationResponseJSON>;

export const authenticationResponseSchema = z.object({
  id: z.string().min(1).max(1024),
  rawId: z.string().min(1).max(1024),
  type: z.literal("public-key"),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  clientExtensionResults: ext,
  response: z.object({
    clientDataJSON: b64,
    authenticatorData: b64,
    signature: b64,
    userHandle: z.string().max(1024).optional(),
  }),
}) as unknown as z.ZodType<AuthenticationResponseJSON>;

export const challengeTokenSchema = z.string().min(20).max(4096);

/** Browser-supplied credential-id hint (non-secret; lets the client pass the per-credential PRF salt in one prompt). */
export const credentialIdHintSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/);

/** PRF output as sent by the client: base64url of exactly 32 bytes (re-checked by parsePrfOutput). */
export const prfOutputSchema = z.string().min(43).max(43).regex(/^[A-Za-z0-9_-]+$/);
