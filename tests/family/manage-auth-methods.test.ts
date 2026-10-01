/**
 * Every /api/family/manage route rejects non-"account" auth contexts (oauth, passphrase, api_key)
 * with 403 BEFORE touching any data. requireAuth is stubbed to return each foreign context.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ method: "oauth" as string }));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => ({
    authenticated: true,
    context: { userId: "u1", method: h.method, mfaVerified: true, dek: Buffer.alloc(32, 1), sessionId: "s" },
  }),
}));

import { POST as invitePOST } from "@/app/api/family/manage/invite/route";
import { POST as acceptPOST } from "@/app/api/family/manage/accept/route";
import { POST as declinePOST } from "@/app/api/family/manage/decline/route";
import { POST as resendPOST } from "@/app/api/family/manage/resend/route";
import { POST as revokePOST } from "@/app/api/family/manage/revoke/route";
import { PUT as updatePUT } from "@/app/api/family/manage/update-sections/route";
import { GET as listGET } from "@/app/api/family/manage/list/route";

const sid = "00000000-0000-4000-8000-000000000000";
const cases: Array<[string, (r: NextRequest) => Promise<Response>, string, unknown]> = [
  ["invite", invitePOST, "POST", { viewerEmail: "z@z.com", sections: ["accounts"] }],
  ["accept", acceptPOST, "POST", { token: "x" }],
  ["decline", declinePOST, "POST", { token: "x" }],
  ["resend", resendPOST, "POST", { shareId: sid }],
  ["revoke", revokePOST, "POST", { shareId: sid }],
  ["update-sections", updatePUT as never, "PUT", { shareId: sid, sections: ["accounts"] }],
  ["list", listGET as never, "GET", undefined],
];

describe("manage routes are session-only", () => {
  for (const method of ["oauth", "api_key", "passphrase"]) {
    it(`rejects ${method} on all 7 routes with 403`, async () => {
      h.method = method;
      for (const [name, handler, verb, body] of cases) {
        const r = await handler(
          new NextRequest(`http://localhost/api/family/manage/${name}`, {
            method: verb,
            headers: { "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
          }),
        );
        expect(r.status, `${method}/${name}`).toBe(403);
      }
    });
  }
});
