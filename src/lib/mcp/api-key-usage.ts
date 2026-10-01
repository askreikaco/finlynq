/**
 * MCP API key usage tracking — record when a user successfully authenticates
 * via an MCP API key.
 *
 * Throttled in-memory + DB-side: the column is only updated if the stored
 * timestamp is NULL or > 1 hour stale. Fire-and-forget: errors are logged
 * (console.warn) and never throw/reject.
 */

import { db } from "@/db";
import { users } from "@/db/schema-pg";
import { eq, lt, or, isNull, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

// In-memory throttle: Map<userId, lastWriteMs>
// Prevents redundant DB writes within the 1-hour window.
const throttleMap = new Map<string, number>();
const THROTTLE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Record MCP API key usage for a user. Throttled: a second call within 1 hour
 * for the same user skips the DB write. DB-side: the UPDATE is conditional,
 * only updating if mcp_api_key_last_used_at is NULL or > 1 hour stale.
 *
 * Fire-and-forget: errors are logged (console.warn), never thrown. Safe to
 * call without awaiting in a way that would delay/fail the MCP request.
 */
export async function recordMcpApiKeyUse(userId: string): Promise<void> {
  try {
    const now = Date.now();
    const lastWrite = throttleMap.get(userId);

    // In-memory throttle: skip if written < 1h ago
    if (lastWrite !== undefined && now - lastWrite < THROTTLE_MS) {
      return;
    }

    // Update with DB-side throttle: only update if NULL or > 1h stale
    await db
      .update(users)
      .set({ mcpApiKeyLastUsedAt: new Date() })
      .where(
        and(
          eq(users.id, userId),
          or(
            isNull(users.mcpApiKeyLastUsedAt),
            lt(
              users.mcpApiKeyLastUsedAt,
              sql`now() - interval '1 hour'`
            )
          )
        )
      );

    // Record the write time for in-memory throttle
    throttleMap.set(userId, now);
  } catch (error) {
    console.warn(
      `[MCP API key usage] Failed to record for user ${userId}:`,
      error instanceof Error ? error.message : String(error)
    );
    // Never throw or reject
  }
}
