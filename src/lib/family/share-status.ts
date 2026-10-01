/**
 * Share status machine and lifecycle management.
 *
 * Tracks the state transitions for a family share:
 * - pending: invite sent, awaiting owner/viewer action
 * - awaiting_owner_unlock: viewer has accepted, awaiting owner login to finalize keys
 * - active: fully functional, viewer can see data
 * - suspended: viewer left, can be reactivated by re-sharing
 * - revoked: terminated by owner/viewer, cannot be reactivated
 * - declined: viewer declined the invite
 * - expired: invite expired before acceptance
 * - key_reset: owner reset keys (labels generic until sweep)
 *
 * This file provides:
 * - isValidTransition() to check if a state change is allowed
 * - Status type definitions
 * - Predicate functions for common queries
 */

export type FamilyShareStatus =
  | "pending"
  | "awaiting_owner_unlock"
  | "active"
  | "suspended"
  | "revoked"
  | "declined"
  | "expired"
  | "key_reset";

export const VALID_SHARE_STATUSES: FamilyShareStatus[] = [
  "pending",
  "awaiting_owner_unlock",
  "active",
  "suspended",
  "revoked",
  "declined",
  "expired",
  "key_reset",
];

/**
 * Valid state transitions.
 * Key: current status; value: array of valid next statuses.
 */
const VALID_TRANSITIONS: Record<FamilyShareStatus, FamilyShareStatus[]> = {
  pending: [
    "awaiting_owner_unlock", // viewer accepted
    "declined",               // viewer declined
    "expired",                // invite expired
    "revoked",                // owner revoked while pending
  ],
  awaiting_owner_unlock: [
    "active",     // owner login sweep finalized keys
    "revoked",    // owner revoked while pending
    "key_reset",  // owner reset keys
  ],
  active: [
    "suspended",  // viewer left
    "revoked",    // owner/viewer revoked
    "key_reset",  // owner reset keys
  ],
  suspended: [
    "active",     // reactivated by re-share
    "revoked",    // terminated permanently
    "key_reset",  // owner reset keys
  ],
  revoked: [
    "pending", // re-share (creates new row, but logically "start over")
  ],
  declined: [
    "pending", // re-share (creates new row)
  ],
  expired: [
    "pending", // re-share (creates new row)
  ],
  key_reset: [
    "active",  // labels swept, back to normal operation
  ],
};

/**
 * Check if a transition from currentStatus to nextStatus is valid.
 */
export function isValidTransition(
  currentStatus: FamilyShareStatus,
  nextStatus: FamilyShareStatus,
): boolean {
  const validNextStatuses = VALID_TRANSITIONS[currentStatus];
  return validNextStatuses.includes(nextStatus);
}

/**
 * Predicate: is this share live (viewer can access data)?
 */
export function isShareLive(status: FamilyShareStatus): boolean {
  return status === "active" || status === "awaiting_owner_unlock";
}

/**
 * Predicate: is this share pending (awaiting some action)?
 */
export function isSharePending(status: FamilyShareStatus): boolean {
  return status === "pending" || status === "awaiting_owner_unlock";
}

/**
 * Predicate: is this share terminal (no further transitions)?
 * Terminal = revoked, declined, or expired (viewer view has ended).
 */
export function isShareTerminal(status: FamilyShareStatus): boolean {
  return status === "revoked" || status === "declined" || status === "expired";
}

/**
 * Predicate: can the viewer still access data with this status?
 */
export function canViewerAccess(status: FamilyShareStatus): boolean {
  return status === "active" || status === "awaiting_owner_unlock";
}

/**
 * Predicate: is key rotation required after this state?
 */
export function requiresKeyRotation(status: FamilyShareStatus): boolean {
  return status === "key_reset";
}
