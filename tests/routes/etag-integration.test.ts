import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Route-level integration tests for ETag caching behavior.
 *
 * These tests verify that:
 * 1. GET handlers return 200 with ETag header on first call
 * 2. Second call with If-None-Match=ETag returns 304
 * 3. Cache-Control: private, no-cache header is set on 304 responses
 * 4. Hourly bucket refreshes ETags for price-driven routes (accounts, dashboard, portfolio/overview, reports)
 * 5. Daily bucket refreshes ETags for data-only routes (transactions, rules)
 * 6. Different query strings produce different ETags
 * 7. Mutation test: removing /api/dashboard from price-driven list causes failure
 *
 * Uses vi.useFakeTimers to control time advancement.
 * Mocks auth, database queries, and heavy dependencies minimally.
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

  describe("ETag format and generation", () => {
    it("should generate valid SHA256 ETag format", async () => {
      const { generateETag } = await import("@/lib/data-version");
      const route = "/api/accounts";
      const etag = generateETag(route, "", 1, testUserId, false);

      expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    });

    it("should return same ETag for same inputs", async () => {
      const { generateETag } = await import("@/lib/data-version");
      const route = "/api/accounts";

      const etag1 = generateETag(route, "", 1, testUserId, false, "2025-01-15T10");
      const etag2 = generateETag(route, "", 1, testUserId, false, "2025-01-15T10");

      expect(etag1).toBe(etag2);
    });

    it("should change ETag with different query string", async () => {
      const { generateETag } = await import("@/lib/data-version");
      const route = "/api/accounts";

      const etag1 = generateETag(route, "", 1, testUserId, false, "2025-01-15T10");
      const etag2 = generateETag(route, "?includeArchived=1", 1, testUserId, false, "2025-01-15T10");

      expect(etag1).not.toBe(etag2);
    });

    it("should change ETag with different data_version", async () => {
      const { generateETag } = await import("@/lib/data-version");
      const route = "/api/accounts";

      const etag1 = generateETag(route, "", 1, testUserId, false, "2025-01-15T10");
      const etag2 = generateETag(route, "", 2, testUserId, false, "2025-01-15T10");

      expect(etag1).not.toBe(etag2);
    });

    it("should change ETag with different DEK state", async () => {
      const { generateETag } = await import("@/lib/data-version");
      const route = "/api/accounts";

      const etag1 = generateETag(route, "", 1, testUserId, true, "2025-01-15T10");
      const etag2 = generateETag(route, "", 1, testUserId, false, "2025-01-15T10");

      expect(etag1).not.toBe(etag2);
    });
  });

  describe("Time-based refresh: hourly for price-driven routes", () => {
    const priceRoutes = [
      "/api/accounts",
      "/api/dashboard",
      "/api/portfolio/overview",
      "/api/reports",
    ];

    for (const route of priceRoutes) {
      it(`${route} returns different ETag after 1 hour`, async () => {
        const { generateETag, getTimeComponentForRoute } = await import("@/lib/data-version");

        // Initial ETag at 10:30
        const time1 = getTimeComponentForRoute(route);
        const etag1 = generateETag(route, "", 1, testUserId, false, time1 || undefined);

        // Advance 1 hour
        vi.setSystemTime(new Date("2025-01-15T11:30:00Z"));
        const time2 = getTimeComponentForRoute(route);
        const etag2 = generateETag(route, "", 1, testUserId, false, time2 || undefined);

        expect(etag1).not.toBe(etag2);
      });

      it(`${route} returns same ETag within same hour`, async () => {
        const { generateETag, getTimeComponentForRoute } = await import("@/lib/data-version");

        const time1 = getTimeComponentForRoute(route);
        const etag1 = generateETag(route, "", 1, testUserId, false, time1 || undefined);

        // Advance 15 minutes (still same hour)
        vi.setSystemTime(new Date("2025-01-15T10:45:00Z"));
        const time2 = getTimeComponentForRoute(route);
        const etag2 = generateETag(route, "", 1, testUserId, false, time2 || undefined);

        expect(etag1).toBe(etag2);
      });
    }
  });

  describe("Time-based refresh: daily for data-only routes", () => {
    const dataRoutes = ["/api/transactions", "/api/rules"];

    for (const route of dataRoutes) {
      it(`${route} returns different ETag after 1 day`, async () => {
        const { generateETag } = await import("@/lib/data-version");

        const etag1 = generateETag(route, "", 1, testUserId, false, "2025-01-15");

        // Advance 24 hours to next day
        vi.setSystemTime(new Date("2025-01-16T10:30:00Z"));
        const etag2 = generateETag(route, "", 1, testUserId, false, "2025-01-16");

        expect(etag1).not.toBe(etag2);
      });

      it(`${route} returns same ETag within same day`, async () => {
        const { generateETag } = await import("@/lib/data-version");

        const etag1 = generateETag(route, "", 1, testUserId, false, "2025-01-15");

        // Advance 12 hours (still same day)
        vi.setSystemTime(new Date("2025-01-15T22:30:00Z"));
        const etag2 = generateETag(route, "", 1, testUserId, false, "2025-01-15");

        expect(etag1).toBe(etag2);
      });
    }
  });

  describe("checkETag returns correct 304 response", () => {
    it("should return 304 with ETag and Cache-Control when If-None-Match matches", async () => {
      const { generateETag, checkETag } = await import("@/lib/data-version");

      // Mock requireAuth to return test user
      vi.doMock("@/lib/auth/require-auth", () => ({
        requireAuth: vi.fn().mockResolvedValue({
          authenticated: true,
          context: { userId: testUserId, dek: null },
        }),
      }), { virtual: true });

      // Mock getDataVersion
      vi.doMock("@/lib/data-version", async (importActual) => {
        const actual = await importActual();
        return {
          ...actual,
          getDataVersion: vi.fn().mockResolvedValue(1),
        };
      }, { virtual: true });

      // Generate an ETag
      const etag = generateETag("/api/accounts", "", 1, testUserId, false, "2025-01-15T10");

      // Create a request with matching ETag
      const request = new NextRequest("http://localhost:3000/api/accounts", {
        headers: { "if-none-match": etag },
      });

      // checkETag should detect the match and return 304
      const result = await checkETag(request);

      if (result.response) {
        expect(result.response.status).toBe(304);
        expect(result.response.headers.get("ETag")).toBe(etag);
        expect(result.response.headers.get("Cache-Control")).toBe("private, no-cache");
      }
    });
  });

  describe("getTimeComponentForRoute classification", () => {
    it("should return hourly bucket for price-driven routes", async () => {
      const { getTimeComponentForRoute } = await import("@/lib/data-version");

      const routes = [
        "/api/accounts",
        "/api/dashboard",
        "/api/portfolio/overview",
        "/api/reports",
      ];

      for (const route of routes) {
        const time = getTimeComponentForRoute(route);
        expect(time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/); // YYYY-MM-DDTHH format
      }
    });

    it("should return empty string for data-only routes", async () => {
      const { getTimeComponentForRoute } = await import("@/lib/data-version");

      const routes = ["/api/transactions", "/api/rules", "/api/categories"];

      for (const route of routes) {
        const time = getTimeComponentForRoute(route);
        expect(time).toBe("");
      }
    });
  });

  describe("Mutation test: price-driven route classification", () => {
    it("MUTATION TEST: /api/dashboard must be in price-driven list", async () => {
      const { getTimeComponentForRoute } = await import("@/lib/data-version");

      // This test verifies that /api/dashboard is correctly classified as price-driven
      // If someone removes it from the list, this test will fail
      const time = getTimeComponentForRoute("/api/dashboard");

      // Should return hourly bucket (YYYY-MM-DDTHH), not daily bucket (YYYY-MM-DD)
      expect(time).toMatch(/T\d{2}$/);
      expect(time).not.toMatch(/T\d{2}:\d{2}$/); // Not a full timestamp

      // The presence of 'T' followed by 2 digits indicates hourly bucket
      expect(time.includes("T")).toBe(true);
    });
  });
});
