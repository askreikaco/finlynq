import { FAMILY_STRINGS } from "@/lib/family/strings";
import { getSectionLabel } from "./section-labels";

/** JSON request helper: same-origin cookies, JSON body. Never logs the body (may hold a password). */
export function postJson(method: "POST" | "PUT", url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** True for the strict step-up 401 body of manage-guard.ts:requireFamilyStepUp. */
export async function isStepUpRequired(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const body = await res.clone().json();
    return body?.code === "step_up_required";
  } catch {
    return false;
  }
}

/**
 * User-facing message for a non-OK response. Server error strings are shown as TEXT only
 * (React escapes them); 409 reciprocal conflicts append the required sections.
 */
export async function errorMessage(res: Response, fallback: string = FAMILY_STRINGS.error_generic): Promise<string> {
  let body: { error?: unknown; requiredSections?: unknown } = {};
  try {
    body = await res.clone().json();
  } catch {
    /* non-JSON body */
  }
  const serverMsg = typeof body.error === "string" && body.error ? body.error : null;
  if (res.status === 429) return serverMsg ?? FAMILY_STRINGS.error_rate_limited;
  if (res.status === 401) return FAMILY_STRINGS.error_session_expired;
  if (res.status === 409) {
    const req = Array.isArray(body.requiredSections)
      ? (body.requiredSections as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const base = serverMsg ?? fallback;
    return req.length ? `${base} (${req.map(getSectionLabel).join(", ")})` : base;
  }
  return serverMsg ?? fallback;
}
