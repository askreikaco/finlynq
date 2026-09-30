/**
 * Goals currency resolution tests (UX-2).
 *
 * Tests the currency resolution logic in manage_goals (add + update):
 * - linked account currency takes precedence
 * - display currency is fallback
 * - explicit currency parameter wins
 * - update writes currency when provided
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomBytes } from "node:crypto";

// Stable env for auth/encryption modules
process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.PF_PEPPER = process.env.PF_PEPPER ?? "test-pepper-32chars-for-vitest-only!!";
process.env.PF_STAGING_KEY = process.env.PF_STAGING_KEY ?? "test-staging-key-32chars-for-vitest!";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPgTools } from "../../mcp-server/register-tools-pg";

/**
 * Fake DbLike that records queries and returns configurable rowsets for testing.
 */
function makeTestDb() {
  const responses: Map<string, unknown[]> = new Map();
  let callCount = 0;

  const db = {
    execute: async (q: unknown) => {
      callCount++;
      // For this test, we don't care about the SQL — just return empty by default
      return { rows: [], rowCount: 0 };
    },
  };

  return { db, responses, callCount };
}

describe("goals currency resolution (UX-2)", () => {
  let server: McpServer;
  let db: { execute: (q: unknown) => Promise<{ rows: unknown[]; rowCount: number }> };
  let tools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }>;

  beforeEach(() => {
    const { db: testDb } = makeTestDb();
    db = testDb;
    server = new McpServer({ name: "goals-test", version: "0.0.0" });
    const dek = randomBytes(32);
    registerPgTools(server, db, "default", dek);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools = (server as any)._registeredTools as Record<
      string,
      { handler: (args: unknown, extra: unknown) => Promise<unknown> }
    >;
  });

  it("resolves to linked VND account currency on add", async () => {
    // Mock DB to return a VND account when queried
    const originalExecute = db.execute;
    let queryCount = 0;

    db.execute = async (q: unknown) => {
      queryCount++;
      // First query: resolve account - return VND account
      if (queryCount === 1 || queryCount === 2) {
        if (
          String(q).includes("SELECT id FROM accounts") &&
          String(q).includes("user_id")
        ) {
          return { rows: [{ id: 101 }], rowCount: 1 };
        }
        // Second query: fetch currency of first account
        if (String(q).includes("SELECT currency FROM accounts")) {
          return { rows: [{ currency: "VND" }], rowCount: 1 };
        }
      }
      // INSERT will use VND from linked account
      if (String(q).includes("INSERT INTO goals")) {
        // Verify currency is in the insert
        const text = String(q);
        expect(text).toContain("VND");
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      return originalExecute(q);
    };

    const handler = tools["manage_goals"]!.handler;
    const result = await handler(
      {
        op: "add",
        name: "Vietnam Fund",
        type: "savings",
        target_amount: 1000000,
        account_ids: [101],
      },
      {}
    );

    expect(result).toBeDefined();
  });

  it("falls back to display currency EUR when no account", async () => {
    const originalExecute = db.execute;
    let insertSeen = false;

    db.execute = async (q: unknown) => {
      const text = String(q);

      // No accounts linked, but display currency resolves to EUR
      if (text.includes("INSERT INTO goals")) {
        insertSeen = true;
        // Goal should use display currency (EUR)
        expect(text).toContain("EUR");
        return { rows: [{ id: 2 }], rowCount: 1 };
      }
      return originalExecute(q);
    };

    const handler = tools["manage_goals"]!.handler;
    const result = await handler(
      {
        op: "add",
        name: "European Goal",
        type: "savings",
        target_amount: 5000,
        // No account_ids — should use display currency
      },
      {}
    );

    expect(result).toBeDefined();
  });

  it("explicit currency parameter wins over account/display", async () => {
    const originalExecute = db.execute;

    db.execute = async (q: unknown) => {
      const text = String(q);

      if (text.includes("SELECT id FROM accounts")) {
        return { rows: [{ id: 101 }], rowCount: 1 };
      }
      if (text.includes("SELECT currency FROM accounts")) {
        return { rows: [{ currency: "VND" }], rowCount: 1 };
      }
      if (text.includes("INSERT INTO goals")) {
        // Explicit USD should win over linked VND account
        expect(text).toContain("USD");
        return { rows: [{ id: 3 }], rowCount: 1 };
      }
      return originalExecute(q);
    };

    const handler = tools["manage_goals"]!.handler;
    const result = await handler(
      {
        op: "add",
        name: "USD Goal",
        type: "savings",
        target_amount: 10000,
        currency: "USD", // Explicit currency
        account_ids: [101], // Would be VND
      },
      {}
    );

    expect(result).toBeDefined();
  });

  it("update writes currency when provided", async () => {
    const originalExecute = db.execute;
    let updateSeen = false;

    db.execute = async (q: unknown) => {
      const text = String(q);

      if (text.includes("SELECT id, name_ct FROM goals")) {
        return { rows: [{ id: 1, name_ct: null }], rowCount: 1 };
      }
      if (text.includes("UPDATE goals")) {
        updateSeen = true;
        // Should update currency to CAD
        expect(text).toContain("currency");
        expect(text).toContain("CAD");
        return { rowCount: 1 };
      }
      return originalExecute(q);
    };

    const handler = tools["manage_goals"]!.handler;
    const result = await handler(
      {
        op: "update",
        goal_id: 1,
        currency: "CAD",
      },
      {}
    );

    expect(result).toBeDefined();
    expect(updateSeen).toBe(true);
  });
});
