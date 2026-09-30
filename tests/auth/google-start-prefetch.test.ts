/**
 * Tests for prefetch detection in Google OAuth start.
 */

import { describe, it, expect } from "vitest";
import { isPrefetchRequest } from "@/app/api/auth/google/start/route";

describe("isPrefetchRequest", () => {
  it("should return false for normal navigation with text/html accept", () => {
    const headers = new Headers({
      accept: "text/html,application/xhtml+xml",
    });
    expect(isPrefetchRequest(headers)).toBe(false);
  });

  it("should return true when sec-purpose contains prefetch", () => {
    const headers = new Headers({
      "sec-purpose": "prefetch",
    });
    expect(isPrefetchRequest(headers)).toBe(true);
  });

  it("should return true when sec-purpose contains prefetch (case-insensitive)", () => {
    const headers = new Headers({
      "sec-purpose": "PREFETCH",
    });
    expect(isPrefetchRequest(headers)).toBe(true);
  });

  it("should return true when purpose contains prefetch", () => {
    const headers = new Headers({
      purpose: "prefetch",
    });
    expect(isPrefetchRequest(headers)).toBe(true);
  });

  it("should return true when purpose contains prefetch (case-insensitive)", () => {
    const headers = new Headers({
      purpose: "PrEfEtch",
    });
    expect(isPrefetchRequest(headers)).toBe(true);
  });

  it("should return true when x-middleware-prefetch is present", () => {
    const headers = new Headers({
      "x-middleware-prefetch": "true",
    });
    expect(isPrefetchRequest(headers)).toBe(true);
  });

  it("should return true when next-router-prefetch is present", () => {
    const headers = new Headers({
      "next-router-prefetch": "true",
    });
    expect(isPrefetchRequest(headers)).toBe(true);
  });

  it("should return false when no prefetch headers are present", () => {
    const headers = new Headers({
      accept: "text/html",
      authorization: "Bearer token",
    });
    expect(isPrefetchRequest(headers)).toBe(false);
  });

  it("should return false when headers are empty", () => {
    const headers = new Headers();
    expect(isPrefetchRequest(headers)).toBe(false);
  });

  it("should return false when purpose is present but does not contain prefetch", () => {
    const headers = new Headers({
      purpose: "other",
    });
    expect(isPrefetchRequest(headers)).toBe(false);
  });
});
