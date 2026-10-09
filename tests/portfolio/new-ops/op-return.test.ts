// @vitest-environment node
import { describe, it, expect } from "vitest";
import { safeReturnHref, DEFAULT_OP_RETURN } from "@/components/portfolio/forms/op-page";

describe("safeReturnHref (?returnTo= on the operation pages)", () => {
  it("falls back to /portfolio when absent", () => {
    expect(safeReturnHref(null)).toBe(DEFAULT_OP_RETURN);
    expect(safeReturnHref("")).toBe("/portfolio");
  });

  it("keeps same-app relative paths with their query", () => {
    expect(safeReturnHref("/transactions")).toBe("/transactions");
    expect(safeReturnHref("/accounts/12?tab=sleeves")).toBe("/accounts/12?tab=sleeves");
    expect(safeReturnHref("/portfolio/new?account=3")).toBe("/portfolio/new?account=3");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "portfolio",
  ])("rejects %j and falls back", (raw) => {
    expect(safeReturnHref(raw)).toBe("/portfolio");
  });
});
