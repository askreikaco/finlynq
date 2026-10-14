import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async () => ({ authenticated: true, context: { userId: "default", method: "passphrase" as const, mfaVerified: false, dek: Buffer.alloc(32, 0xaa), sessionId: "test-session-jti" } })),
}));
// Validation fails before any query runs, so the db is never touched by these cases.
vi.mock("@/db", () => ({ db: {}, schema: {} }));

import { GET } from "@/app/api/reports/category/route";
import { createMockRequest } from "../helpers/api-test-utils";

const get = (qs: string) => GET(createMockRequest(`http://localhost:3000/api/reports/category?${qs}`));

describe("GET /api/reports/category from/to validation", () => {
  it.each([
    ["only from", "categoryId=1&from=2026-01-01"],
    ["only to", "categoryId=1&to=2026-01-31"],
    ["not a date", "categoryId=1&from=2026-01&to=2026-02-01"],
    ["impossible day", "categoryId=1&from=2026-02-30&to=2026-03-01"],
    ["from after to", "categoryId=1&from=2026-03-02&to=2026-03-01"],
    ["empty values", "categoryId=1&from=&to="],
  ])("400 for %s", async (_n, qs) => {
    const res = await get(qs);
    expect(res.status).toBe(400);
  });

  it("still requires categoryId", async () => {
    expect((await get("from=2026-01-01&to=2026-01-31")).status).toBe(400);
  });
});
