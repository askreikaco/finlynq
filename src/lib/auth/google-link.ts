/**
 * Google identity linking decision logic.
 *
 * For intent=link, determines the outcome: session mismatch, already linked to
 * another user, already linked to the same user (no-op), or proceed with linking.
 */

export type GoogleLinkDecision =
  | "session_mismatch"
  | "already_linked_other"
  | "already_linked_self"
  | "link";

export interface GoogleLinkInput {
  /** User ID from the verified session cookie (pf_session). */
  sessionUserId: string | null;
  /** User ID stored in the signed state cookie. */
  stateUid: string | undefined;
  /** User ID of an existing identity for this Google sub (if any). */
  existingIdentityUserId: string | null;
}

/**
 * Decide the outcome of a Google link attempt.
 *
 * Returns:
 *   - "session_mismatch" — no valid session or session user != state uid
 *   - "already_linked_other" — this Google account is linked to a different user
 *   - "already_linked_self" — this Google account is already linked to the current user (no-op)
 *   - "link" — proceed with linking
 */
export function decideGoogleLink(input: GoogleLinkInput): GoogleLinkDecision {
  const { sessionUserId, stateUid, existingIdentityUserId } = input;

  // Check session validity: must have a valid session and it must match the state uid
  if (!sessionUserId || sessionUserId !== stateUid) {
    return "session_mismatch";
  }

  // If there's an existing identity for this Google sub
  if (existingIdentityUserId !== null) {
    if (existingIdentityUserId === sessionUserId) {
      return "already_linked_self";
    } else {
      return "already_linked_other";
    }
  }

  // No existing identity — proceed with linking
  return "link";
}
