/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from "vitest";

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

describe("Admin Env page", () => {
  it("calls redirect with /admin/system", async () => {
    // Import after mock is set up
    const EnvPage = (await import("@/app/(app)/admin/env/page")).default;

    // Call the component (it's a server component that redirects)
    EnvPage();

    expect(mockRedirect).toHaveBeenCalledWith("/admin/system");
  });
});
