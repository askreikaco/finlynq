/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { REDIRECTS } from "@/lib/nav-config";

// /admin/env is no longer a page file (C-36). Its redirect to /admin/system lives in the REDIRECTS table that next.config consumes.
describe("Admin Env redirect", () => {
  it("REDIRECTS sends /admin/env to /admin/system", () => {
    expect(REDIRECTS).toContainEqual({ source: "/admin/env", destination: "/admin/system", permanent: false });
  });
});
