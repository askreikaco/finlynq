/**
 * Security event logging for audit trail.
 *
 * Log events like password changes, recovery attempts, device rotations, etc.
 * Fire-and-forget: errors are logged but don't fail the main operation.
 */

import { db } from "@/db";
import { userSecurityEvents } from "@/db/schema-pg";
import { logApiError } from "@/lib/validate";

export type SecurityEventType =
  | "recovery_code_generated"
  | "passkey_added"
  | "passkey_removed"
  | "recovery_reset_success"
  | "recovery_reset_failed"
  | "recovery_proof_failed"
  | "password_changed"
  | "device_revoked"
  | "device_rotated";

/**
 * Log a security event for a user.
 * Fire-and-forget: if the insertion fails, log it but don't throw.
 */
export async function logSecurityEvent(
  userId: string,
  event: SecurityEventType,
  options?: {
    method?: string; // "device", "code", "passkey", etc.
    ip?: string;
    userAgent?: string;
  }
): Promise<void> {
  try {
    await db.insert(userSecurityEvents).values({
      userId,
      event,
      method: options?.method ?? null,
      ip: options?.ip ?? null,
      userAgent: options?.userAgent ?? null,
      createdAt: new Date(),
    });
  } catch (err) {
    // Fire-and-forget: log the error but don't throw
    await logApiError("logSecurityEvent", event, err);
  }
}
