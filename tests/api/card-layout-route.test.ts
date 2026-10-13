/**
 * Generic card layout route, with the DB mocked (no Postgres needed): auth, page validation, per-user and
 * per-page storage, sanitising on write.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createMockRequest } from "../helpers/api-test-utils";

const state = vi.hoisted(() => ({
  rows: new Map<string, string>(),
  userId: "user-a" as string | null,
}));

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async () =>
    state.userId
      ? { authenticated: true, context: { userId: state.userId, method: "passphrase", mfaVerified: false, dek: Buffer.alloc(32, 1), sessionId: "s" } }
      : { authenticated: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
  ),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conds: unknown[]) => conds,
  eq: (column: string, value: unknown) => ({ column, value }),
}));

vi.mock("@/db", () => {
  const settings = { key: "key", userId: "userId", value: "value" };
  const keyOf = (conds: { column: string; value: unknown }[]) => {
    const get = (c: string) => conds.find((x) => x.column === c)?.value as string;
    return `${get("key")}|${get("userId")}`;
  };
  return {
    schema: { settings },
    db: {
      select: () => ({
        from: () => ({
          where: (conds: { column: string; value: unknown }[]) => ({
            limit: async () => {
              const v = state.rows.get(keyOf(conds));
              return v === undefined ? [] : [{ value: v }];
            },
          }),
        }),
      }),
      insert: () => ({
        values: (row: { key: string; userId: string; value: string }) => ({
          onConflictDoUpdate: async () => {
            state.rows.set(`${row.key}|${row.userId}`, row.value);
          },
        }),
      }),
    },
  };
});

import { GET, PUT } from "@/app/api/settings/card-layout/route";

const url = (page?: string) => `/api/settings/card-layout${page === undefined ? "" : `?page=${page}`}`;
const put = (page: string, body: unknown) => PUT(createMockRequest(url(page), { method: "PUT", body }));
const get = (page?: string) => GET(createMockRequest(url(page)));

beforeEach(() => {
  state.rows.clear();
  state.userId = "user-a";
});

describe("/api/settings/card-layout", () => {
  it("requires a session", async () => {
    state.userId = null;
    expect((await get("accounts")).status).toBe(401);
    expect((await put("accounts", { order: [], hidden: [] })).status).toBe(401);
  });

  it("rejects a missing or malformed page id", async () => {
    expect((await get()).status).toBe(400);
    expect((await get("Bad Id")).status).toBe(400);
    expect((await get("../etc")).status).toBe(400);
    expect((await put("", { order: [], hidden: [] })).status).toBe(400);
  });

  it("a page with nothing saved returns an empty layout (the client falls back to its defaults)", async () => {
    const res = await get("accounts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order: [], hidden: [] });
  });

  it("PUT stores the layout per user and page, and GET returns it", async () => {
    const res = await put("accounts", { order: ["summary", "net-worth"], hidden: ["net-worth"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ order: ["summary", "net-worth"], hidden: ["net-worth"] });
    expect(await (await get("accounts")).json()).toEqual({ order: ["summary", "net-worth"], hidden: ["net-worth"] });
    // another page of the same user is separate
    expect(await (await get("reports")).json()).toEqual({ order: [], hidden: [] });
    // another user of the same page is separate
    state.userId = "user-b";
    expect(await (await get("accounts")).json()).toEqual({ order: [], hidden: [] });
  });

  it("drops duplicate ids on write (ids are checked against the page's cards on the client)", async () => {
    const res = await put("reports", { order: ["trend", "trend", "summary"], hidden: ["summary", "summary"] });
    expect(await res.json()).toEqual({ order: ["trend", "summary"], hidden: ["summary"] });
  });

  it("rejects a body that is not { order: string[], hidden: string[] }", async () => {
    expect((await put("reports", { order: "nope", hidden: [] })).status).toBe(400);
    expect((await put("reports", { order: [1, 2], hidden: [] })).status).toBe(400);
  });
});
