/** The overview refuses every non-"account" auth context with 403 BEFORE touching data. */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ method: "oauth" as string, touched: 0 }));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => ({
    authenticated: true,
    context: { userId: "u1", method: h.method, mfaVerified: true, dek: Buffer.alloc(32, 1), sessionId: "s" },
  }),
}));
vi.mock("@/lib/family/overview/gate", () => ({
  viewerPassesMfaGate: async () => {
    h.touched++;
    return true;
  },
}));

import { GET } from "@/app/api/family/overview/route";

describe("overview is session-only", () => {
  for (const method of ["oauth", "api_key", "passphrase", "pending"]) {
    it(`rejects ${method} with 403 before the 2FA gate or any data access`, async () => {
      h.method = method;
      h.touched = 0;
      const r = await GET(new NextRequest("http://localhost/api/family/overview", { method: "GET" }));
      expect(r.status).toBe(403);
      expect(h.touched).toBe(0);
      expect(await r.text()).not.toMatch(/members/);
    });
  }
});
