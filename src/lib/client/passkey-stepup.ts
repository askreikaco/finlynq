/**
 * Browser side of the passkey step-up (src/lib/auth/passkey-stepup.ts).
 * A passkey-only account must send { passkeyStepUp: { token, response } }
 * with delete-account, wipe-account, admin email-integration and admin user
 * edits (and when removing a passkey from a session that never passed 2FA).
 * One token per attempt: it is single use and bound to the action + session.
 */
import { getAssertionWithPrf } from "@/lib/client/passkey-prf";
import type { AuthenticationResponseJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

export type StepUpAction =
  | "delete-account"
  | "wipe-account"
  | "admin-email-integration"
  | "admin-user-update"
  | "passkey-remove";

export interface PasskeyStepUp {
  token: string;
  response: AuthenticationResponseJSON;
}

export type PasskeyStepUpResult =
  | { ok: true; passkeyStepUp: PasskeyStepUp }
  | { ok: false; code: "cancelled" | "failed" };

export async function getPasskeyStepUp(action: StepUpAction): Promise<PasskeyStepUpResult> {
  try {
    const res = await fetch("/api/auth/step-up/passkey/options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action }),
    });
    if (!res.ok) return { ok: false, code: "failed" };
    const json = (await res.json()) as { options: PublicKeyCredentialRequestOptionsJSON; token: string };
    const assertion = await getAssertionWithPrf(json.options, null);
    return { ok: true, passkeyStepUp: { token: json.token, response: assertion.response } };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    return { ok: false, code: name === "NotAllowedError" || name === "AbortError" ? "cancelled" : "failed" };
  }
}
