/**
 * Invisible accounts (2026-10-07) — MCP balance tools.
 *
 * `get_account_balances` keeps an invisible account LISTED (flagged
 * `invisible: true`) but excludes it from `totalReporting`; `get_net_worth`
 * excludes it in SQL. The #210 parity contract
 * (`get_net_worth.total.net.amount === get_account_balances.totalReporting
 * .amount`) must still hold.
 *
 * Fake `DbLike` in the mcp-investment-balance-overlay.test.ts style: it serves
 * the per-account balance rows and honours an `a.invisible = false` predicate
 * the way Postgres would, so a handler that forgets the filter sums the
 * invisible row and fails.
 */

import { describe, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";

process.env.PF_JWT_SECRET = "test-jwt-secret-for-vitest-32chars!!";
process.env.PF_PEPPER = process.env.PF_PEPPER ?? "test-pepper-32chars-for-vitest-only!!";
process.env.PF_STAGING_KEY = process.env.PF_STAGING_KEY ?? "test-staging-key-32chars-for-vitest!";

vi.mock("../../src/lib/holdings-value", () => ({
  getHoldingsValueByAccount: vi.fn(async () => new Map()),
  verifyHoldingDecryptHealth: vi.fn(async () => ({ failed: 0, total: 0 })),
}));
vi.mock("../../src/lib/fx-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/fx-service")>();
  return { ...actual, getRate: vi.fn(async () => 1) };
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPgTools } from "../../mcp-server/register-tools-pg";

// Bank 500 + card -200 visible; a 10,000 "Invisible" asset that must never
// reach a total.
const ACCOUNT_ROWS = [
  { id: 1, name_ct: null, alias_ct: null, type: "A", group: "Banks", currency: "USD", is_investment: false, invisible: false, balance: 500, total: 500 },
  { id: 2, name_ct: null, alias_ct: null, type: "L", group: "Credit Cards", currency: "USD", is_investment: false, invisible: false, balance: -200, total: -200 },
  { id: 3, name_ct: null, alias_ct: null, type: "A", group: "Other", currency: "USD", is_investment: false, invisible: true, balance: 10000, total: 10000 },
];

function serialize(q: unknown): string {
  if (!q || typeof q !== "object") return String(q);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sqlObj = q as any;
  const chunks = sqlObj.queryChunks ?? sqlObj.chunks ?? [];
  let out = "";
  for (const c of chunks) {
    if (c && typeof c === "object" && Array.isArray((c as { value?: unknown[] }).value)) {
      out += (c as { value: string[] }).value.join("");
    } else if (c && typeof c === "object" && "queryChunks" in (c as object)) {
      out += serialize(c);
    } else if (typeof c === "string") {
      out += c;
    }
  }
  return out;
}

function bootstrap() {
  const db = {
    execute: async (q: unknown) => {
      const text = serialize(q);
      if (/FROM\s+accounts\s+a\b/i.test(text) && /a\.is_investment/i.test(text)) {
        const rows = /a\.invisible\s*=\s*false/i.test(text)
          ? ACCOUNT_ROWS.filter((r) => !r.invisible)
          : ACCOUNT_ROWS;
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const server = new McpServer({ name: "invisible-test", version: "0.0.0" });
  registerPgTools(server, db, "default", randomBytes(32));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools as Record<string, { handler: (a: unknown, e: unknown) => Promise<unknown> }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parse(res: any): any {
  return JSON.parse(res.content[0].text).data;
}

describe("MCP balance tools — invisible accounts", () => {
  it("get_account_balances lists the invisible account, flagged, but leaves it out of totalReporting", async () => {
    const tools = bootstrap();
    const data = parse(await tools["get_account_balances"].handler({ reportingCurrency: "USD" }, {}));
    expect(data.accounts.map((a: { id: number }) => a.id)).toEqual([1, 2, 3]);
    const hidden = data.accounts.find((a: { id: number }) => a.id === 3);
    expect(hidden.invisible).toBe(true);
    expect(hidden.balance).toBe(10000);
    expect(data.accounts.find((a: { id: number }) => a.id === 1).invisible).toBe(false);
    // 500 + (-200); the 10,000 invisible asset is not counted.
    expect(data.totalReporting.amount).toBe(300);
  });

  it("get_net_worth excludes invisible accounts and keeps #210 parity", async () => {
    const tools = bootstrap();
    const bal = parse(await tools["get_account_balances"].handler({ reportingCurrency: "USD" }, {}));
    const nw = parse(await tools["get_net_worth"].handler({ reportingCurrency: "USD" }, {}));
    expect(nw.total.assets.amount).toBe(500);
    expect(nw.total.net.amount).toBe(300);
    expect(nw.byCurrency.USD).toMatchObject({ assets: 500, liabilities: -200, net: 300 });
    expect(nw.total.net.amount).toBe(bal.totalReporting.amount);
  });
});
