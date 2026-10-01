/**
 * Check if an MCP user is "connected" (has either OAuth apps or recent API key usage).
 *
 * A user is considered connected if:
 * - They have at least one OAuth app (apps.length > 0), OR
 * - They have used an MCP API key within the last 30 days
 */

/**
 * Determine if a user is connected to MCP.
 *
 * @param apps Array of connected OAuth apps (length > 0 means connected)
 * @param mcpApiKeyLastUsedAt ISO timestamp of last API key usage, or null
 * @param now Current date/time for calculating the 30-day window (defaults to new Date())
 * @returns true if the user is connected via OAuth or recent API key usage
 */
export function isMcpConnected(
  apps: { id: number }[],
  mcpApiKeyLastUsedAt: string | null,
  now: Date = new Date()
): boolean {
  // OAuth apps are the primary indicator
  if (apps.length > 0) {
    return true;
  }

  // Check API key usage within the last 30 days
  if (mcpApiKeyLastUsedAt) {
    try {
      const lastUsed = new Date(mcpApiKeyLastUsedAt);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (lastUsed > thirtyDaysAgo) {
        return true;
      }
    } catch {
      // Invalid date format, treat as not used
    }
  }

  return false;
}
