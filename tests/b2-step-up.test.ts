import { describe, it, expect } from "vitest";
import { isFreshSession } from "@/lib/auth/step-up";

describe("step-up: isFreshSession (< 10 min old)", () => {
  it("returns false when iat is missing", () => {
    expect(isFreshSession(undefined)).toBe(false);
  });

  it("returns false when iat is NaN", () => {
    expect(isFreshSession(NaN)).toBe(false);
  });

  it("returns true when iat is < 10 min old (9:59)", () => {
    const now = Math.floor(Date.now() / 1000);
    const iat = now - 9 * 60 - 59; // 9:59 ago
    expect(isFreshSession(iat)).toBe(true);
  });

  it("returns false when iat is > 10 min old (10:01)", () => {
    const now = Math.floor(Date.now() / 1000);
    const iat = now - 10 * 60 - 1; // 10:01 ago
    expect(isFreshSession(iat)).toBe(false);
  });

  it("returns false when iat is exactly 10 min old", () => {
    const now = Math.floor(Date.now() / 1000);
    const iat = now - 10 * 60; // exactly 10 min ago
    expect(isFreshSession(iat)).toBe(false);
  });

  it("returns true when iat is very recent (0 seconds ago)", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isFreshSession(now)).toBe(true);
  });
});
