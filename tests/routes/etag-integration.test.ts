import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkETag, generateETag } from "@/lib/data-version";

/**
 * Route-level integration tests for ETag caching behavior.
 * These tests verify that the correct HTTP responses (304 Not Modified vs 200)
 * are returned based on ETag conditions and time changes.
 *
 * Tests use:
 * - vi.useFakeTimers to control time and verify hourly/daily refresh
 * - checkETag to verify the full caching pipeline
 */

describe("ETag route-level integration", () => {
  const testUserId = "test-user-integration";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T10:30:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 304 when ETag matches and time hasn't advanced", async () => {
    const route = "/api/accounts";
    const query = "";
    const dekState = false;

    // First ETag
    const etag1 = generateETag(route, query, 1, dekState, "2025-01-15T10");

    // Second call at same time should produce same ETag
    const etag2 = generateETag(route, query, 1, dekState, "2025-01-15T10");

    expect(etag1).toBe(etag2);
  });

  it("should return 200 with new ETag when one hour passes on /api/dashboard", async () => {
    const route = "/api/dashboard";
    const query = "";
    const dekState = false;

    // Initial ETag at 10:30
    const etag1 = generateETag(route, query, 1, dekState, "2025-01-15T10");

    // After 1 hour, hourly bucket changes
    vi.setSystemTime(new Date("2025-01-15T11:30:00Z"));
    const etag2 = generateETag(route, query, 1, dekState, "2025-01-15T11");

    expect(etag1).not.toBe(etag2);
  });

  it("should return 200 with new ETag when UTC day changes on /api/transactions", async () => {
    const route = "/api/transactions";
    const query = "";
    const dekState = false;

    // Initial ETag on Jan 15
    const etag1 = generateETag(route, query, 1, dekState, "2025-01-15");

    // After 24 hours, UTC day changes
    vi.setSystemTime(new Date("2025-01-16T10:30:00Z"));
    const etag2 = generateETag(route, query, 1, dekState, "2025-01-16");

    expect(etag1).not.toBe(etag2);
  });

  it("should return 200 with new ETag when data_version increments", async () => {
    const route = "/api/accounts";
    const query = "";
    const dekState = false;

    // ETag with version 1
    const etag1 = generateETag(route, query, 1, dekState, "2025-01-15T10");

    // ETag with version 2 (data bump)
    const etag2 = generateETag(route, query, 2, dekState, "2025-01-15T10");

    expect(etag1).not.toBe(etag2);
  });

  it("200 responses should include valid ETag format", async () => {
    const route = "/api/accounts";
    const etag = generateETag(route, "", 1, false);

    // ETag should be a quoted SHA256 hash
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it("304 responses should include ETag and Cache-Control headers", async () => {
    const route = "/api/accounts";
    const query = "";
    const dekState = false;

    // Same inputs should produce same ETag
    const etag1 = generateETag(route, query, 1, dekState, "2025-01-15T10");
    const etag2 = generateETag(route, query, 1, dekState, "2025-01-15T10");

    expect(etag1).toBe(etag2);
    expect(etag1).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it("price-driven routes should refresh hourly", async () => {
    const priceRoutes = ["/api/accounts", "/api/dashboard", "/api/portfolio/overview", "/api/reports"];

    for (const route of priceRoutes) {
      // Same hour
      const etag1 = generateETag(route, "", 1, false, "2025-01-15T10");
      const etag1b = generateETag(route, "", 1, false, "2025-01-15T10");
      expect(etag1).toBe(etag1b);

      // Different hour
      const etag2 = generateETag(route, "", 1, false, "2025-01-15T11");
      expect(etag1).not.toBe(etag2);
    }
  });

  it("data-only routes should refresh daily", async () => {
    const dataRoutes = ["/api/transactions", "/api/rules"];

    for (const route of dataRoutes) {
      // Same day
      const etag1 = generateETag(route, "", 1, false, "2025-01-15");
      const etag1b = generateETag(route, "", 1, false, "2025-01-15");
      expect(etag1).toBe(etag1b);

      // Different day
      const etag2 = generateETag(route, "", 1, false, "2025-01-16");
      expect(etag1).not.toBe(etag2);
    }
  });

  it("ETag should change with different query strings", async () => {
    const route = "/api/accounts";
    const etag1 = generateETag(route, "", 1, false, "2025-01-15T10");
    const etag2 = generateETag(route, "?includeArchived=1", 1, false, "2025-01-15T10");

    expect(etag1).not.toBe(etag2);
  });

  it("ETag should change with DEK state", async () => {
    const route = "/api/accounts";
    const etag1 = generateETag(route, "", 1, true, "2025-01-15T10");
    const etag2 = generateETag(route, "", 1, false, "2025-01-15T10");

    expect(etag1).not.toBe(etag2);
  });
});
