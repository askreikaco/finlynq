import { describe, it, expect } from "vitest";
import { safeReturnTo, GROUPS_RETURN_FALLBACK } from "@/lib/nav/return-to";
import * as legacy from "@/lib/accounts/groups-return-to";

describe("safeReturnTo", () => {
  it("accepts same-app relative paths with query strings", () => {
    expect(safeReturnTo("/transactions")).toBe("/transactions");
    expect(safeReturnTo("/budgets?month=2026-10")).toBe("/budgets?month=2026-10");
  });

  it("falls back for null, undefined, empty and non-string input", () => {
    expect(safeReturnTo(null)).toBe(GROUPS_RETURN_FALLBACK);
    expect(safeReturnTo(undefined)).toBe(GROUPS_RETURN_FALLBACK);
    expect(safeReturnTo("")).toBe(GROUPS_RETURN_FALLBACK);
    expect(safeReturnTo(42 as unknown as string, "/x")).toBe("/x");
  });

  it("uses the supplied fallback, and '' is a valid fallback", () => {
    expect(safeReturnTo("//evil.test", "/portfolio")).toBe("/portfolio");
    expect(safeReturnTo("//evil.test", "")).toBe("");
  });

  it("rejects protocol-relative '//'", () => {
    expect(safeReturnTo("//evil.test")).toBe("/accounts");
    expect(safeReturnTo("//evil.test/x")).toBe("/accounts");
  });

  it("rejects backslash in any position", () => {
    expect(safeReturnTo("/\\evil.test")).toBe("/accounts");
    expect(safeReturnTo("/ok\\x")).toBe("/accounts");
  });

  it("rejects absolute URLs and script/data schemes", () => {
    expect(safeReturnTo("https://evil.test/x")).toBe("/accounts");
    expect(safeReturnTo("http://evil.test")).toBe("/accounts");
    expect(safeReturnTo("javascript:alert(1)")).toBe("/accounts");
    expect(safeReturnTo("data:text/html,x")).toBe("/accounts");
    expect(safeReturnTo("evil.test/path")).toBe("/accounts");
  });

  it("rejects whitespace and control characters that browsers strip into '//'", () => {
    for (const raw of ["/\t/evil.test", "/\n/evil.test", "/\r/evil.test", "/ /evil.test", "/\u0000x"]) {
      expect(safeReturnTo(raw), JSON.stringify(raw)).toBe("/accounts");
    }
  });

  it("rejects values longer than 2048 characters", () => {
    expect(safeReturnTo("/" + "a".repeat(2048))).toBe("/accounts");
    expect(safeReturnTo("/" + "a".repeat(2047))).toBe("/" + "a".repeat(2047));
  });
});

describe("groups-return-to compatibility re-export", () => {
  it("exposes the same function and fallback as the shared module", () => {
    expect(legacy.safeReturnTo).toBe(safeReturnTo);
    expect(legacy.GROUPS_RETURN_FALLBACK).toBe(GROUPS_RETURN_FALLBACK);
  });
});
