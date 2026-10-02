import { describe, it, expect } from "vitest";
import { routeTemplate } from "@/components/web-vitals";

describe("routeTemplate", () => {
  it("drops query strings and replaces ids", () => {
    expect(routeTemplate("/accounts/22?tab=x")).toBe("/accounts/:id");
    expect(routeTemplate("/settings/backfill/5c63044c-26cf-4645-ac80-366fb21710ed")).toBe("/settings/backfill/:id");
    expect(routeTemplate("/dashboard")).toBe("/dashboard");
  });
});
