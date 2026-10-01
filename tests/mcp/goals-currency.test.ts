/**
 * manage_goals currency resolution (UX-2). DB-free: a fake executor answers
 * lookups and captures INSERT/UPDATE, rendered to SQL + params.
 */
import { describe, it, expect, beforeAll } from "vitest";

process.env.PF_JWT_SECRET = process.env.PF_JWT_SECRET ?? "test-jwt-secret-for-vitest-32chars!!";
process.env.PF_PEPPER = process.env.PF_PEPPER ?? "test-pepper-32chars-for-vitest-only!!";
process.env.PF_STAGING_KEY = process.env.PF_STAGING_KEY ?? "test-staging-key-32chars-for-vitest!";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { registerPgTools } from "../../mcp-server/register-tools-pg";
import { withAutoAnnotations } from "../../mcp-server/auto-annotations";

type Tool = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any;
  handler: (args: Record<string, unknown>, extra: unknown) => Promise<{ content: Array<{ text: string }> }>;
};

const dialect = new PgDialect();
let executed: Array<{ sql: string; params: unknown[] }> = [];
let tool: Tool;

beforeAll(() => {
  const server = withAutoAnnotations(new McpServer({ name: "goals-currency-test", version: "0.0.0" }));
  registerPgTools(
    server,
    {
      execute: async (query: SQL) => {
        const r = dialect.sqlToQuery(query);
        executed.push({ sql: r.sql, params: r.params });
        if (/SELECT currency FROM accounts/.test(r.sql)) return { rows: [{ currency: "EUR" }], rowCount: 1 };
        if (/FROM settings/.test(r.sql)) return { rows: [{ value: "VND" }], rowCount: 1 };
        if (/SELECT id FROM accounts/.test(r.sql)) return { rows: [{ id: 5 }], rowCount: 1 };
        if (/SELECT id, name_ct FROM goals/.test(r.sql)) return { rows: [{ id: 9, name_ct: null }], rowCount: 1 };
        if (/^\s*INSERT INTO goals /.test(r.sql)) return { rows: [{ id: 1 }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      },
    },
    "default",
    Buffer.alloc(32),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool = (server as any)._registeredTools.manage_goals as Tool;
});

const insertOf = () => executed.find((q) => /^\s*INSERT INTO goals /.test(q.sql));
const base = { op: "add", name: "G", type: "savings", target_amount: 100 };

describe("manage_goals currency", () => {
  it("add: explicit currency wins over account and display currency", async () => {
    executed = [];
    await tool.handler({ ...base, currency: "USD", account_ids: [5] }, {});
    const ins = insertOf();
    expect(ins, "INSERT issued").toBeTruthy();
    expect(ins!.params).toContain("USD");
    expect(ins!.params).not.toContain("EUR");
    expect(ins!.params).not.toContain("VND");
  });

  it("add: falls back to the linked account's currency", async () => {
    executed = [];
    await tool.handler({ ...base, account_ids: [5] }, {});
    const ins = insertOf();
    expect(ins!.params).toContain("EUR");
    expect(ins!.params).not.toContain("VND");
  });

  it("add: falls back to display currency when unlinked", async () => {
    executed = [];
    await tool.handler({ ...base }, {});
    expect(insertOf()!.params).toContain("VND");
  });

  it("update: writes currency; omitted currency leaves it alone", async () => {
    executed = [];
    await tool.handler({ op: "update", goal_id: 9, currency: "JPY" }, {});
    const upd = executed.find((q) => /^\s*UPDATE goals SET/.test(q.sql));
    expect(upd!.sql).toMatch(/currency = \$\d+/);
    expect(upd!.params).toContain("JPY");
    executed = [];
    await tool.handler({ op: "update", goal_id: 9, target_amount: 5 }, {});
    expect(executed.find((q) => /^\s*UPDATE goals SET/.test(q.sql))!.sql).not.toMatch(/currency =/);
  });

  it("schema rejects a malformed currency", () => {
    expect(tool.inputSchema.safeParse({ ...base, currency: "usd" }).success).toBe(false);
  });
});
