import { describe, it, expect } from "vitest";
import { isCategoriesMergedEnabled } from "@/lib/categories/flag";

describe("isCategoriesMergedEnabled", () => {
  it("returns false when env var unset", () => {
    expect(isCategoriesMergedEnabled({})).toBe(false);
  });

  it("returns true for '1'", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "1" })).toBe(true);
  });

  it("returns true for 'true'", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "true" })).toBe(true);
  });

  it("returns true for 'on'", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "on" })).toBe(true);
  });

  it("returns true for 'yes'", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "yes" })).toBe(true);
  });

  it("returns true for 'TRUE' (case insensitive)", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "TRUE" })).toBe(true);
  });

  it("returns false for '0'", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "0" })).toBe(false);
  });

  it("returns false for 'false'", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "false" })).toBe(false);
  });

  it("returns false for random string", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "random" })).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: "" })).toBe(false);
  });

  it("returns true for space-padded ' 1 '", () => {
    expect(isCategoriesMergedEnabled({ FINLYNQ_CATEGORIES_MERGED: " 1 " })).toBe(true);
  });
});
