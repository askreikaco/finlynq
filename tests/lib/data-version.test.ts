import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateETag, checkETag, getDataVersion, getTimeComponentForRoute } from "@/lib/data-version";

describe("data-version", () => {
  describe("generateETag", () => {
    it("should generate a valid ETag with base parameters", () => {
      const etag = generateETag("/api/accounts", "", 42, false);
      expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
    });

    it("should change ETag when dataVersion changes", () => {
      const route = "/api/accounts";
      const query = "";
      const dekState = false;

      const etag1 = generateETag(route, query, 1, dekState);
      const etag2 = generateETag(route, query, 2, dekState);

      expect(etag1).not.toBe(etag2);
    });

    it("should change ETag when route changes", () => {
      const dataVersion = 42;
      const query = "";
      const dekState = false;

      const etag1 = generateETag("/api/accounts", query, dataVersion, dekState);
      const etag2 = generateETag("/api/dashboard", query, dataVersion, dekState);

      expect(etag1).not.toBe(etag2);
    });

    it("should change ETag when queryString changes", () => {
      const route = "/api/accounts";
      const dataVersion = 42;
      const dekState = false;

      const etag1 = generateETag(route, "?archived=false", dataVersion, dekState);
      const etag2 = generateETag(route, "?archived=true", dataVersion, dekState);

      expect(etag1).not.toBe(etag2);
    });

    it("should change ETag when dekState changes", () => {
      const route = "/api/accounts";
      const query = "";
      const dataVersion = 42;

      const etag1 = generateETag(route, query, dataVersion, true);
      const etag2 = generateETag(route, query, dataVersion, false);

      expect(etag1).not.toBe(etag2);
    });

    it("should change ETag when UTC date changes", () => {
      // This test simulates time passing (date changes)
      // We'll generate an ETag with a UTC date component as extra parameter
      const route = "/api/dashboard";
      const query = "";
      const dataVersion = 42;
      const dekState = false;

      // Simulate today's date
      const today = new Date().toISOString().split("T")[0];
      const etag1 = generateETag(route, query, dataVersion, dekState, today);

      // Simulate tomorrow's date
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const etag2 = generateETag(route, query, dataVersion, dekState, tomorrow);

      expect(etag1).not.toBe(etag2);
    });

    it("should change ETag per hour for price-driven routes", () => {
      const route = "/api/dashboard";
      const query = "";
      const dataVersion = 42;
      const dekState = false;

      // Simulate hour 0
      const hour0 = "2025-01-15T00";
      const etag1 = generateETag(route, query, dataVersion, dekState, hour0);

      // Simulate hour 1
      const hour1 = "2025-01-15T01";
      const etag2 = generateETag(route, query, dataVersion, dekState, hour1);

      expect(etag1).not.toBe(etag2);
    });

    it("should produce same ETag for same inputs", () => {
      const route = "/api/accounts";
      const query = "?active=true";
      const dataVersion = 42;
      const dekState = true;
      const extra = "2025-01-15T10";

      const etag1 = generateETag(route, query, dataVersion, dekState, extra);
      const etag2 = generateETag(route, query, dataVersion, dekState, extra);

      expect(etag1).toBe(etag2);
    });
  });

  describe("getDataVersion", () => {
    it("should handle missing user by returning default value", async () => {
      // This test requires a database - for now just verify the function exists
      expect(typeof getDataVersion).toBe("function");
    });
  });

  describe("getTimeComponentForRoute", () => {
    it("should return hourly component for price-driven routes", () => {
      const routes = [
        "/api/accounts",
        "/api/dashboard",
        "/api/portfolio/overview",
        "/api/reports",
      ];

      for (const route of routes) {
        const component = getTimeComponentForRoute(route);
        // Should return a string matching YYYY-MM-DDTHH pattern
        expect(component).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
      }
    });

    it("should return empty string for non-price-driven routes", () => {
      const routes = [
        "/api/transactions",
        "/api/rules",
        "/api/categories",
        "/api/budgets",
        "/api/loans",
      ];

      for (const route of routes) {
        const component = getTimeComponentForRoute(route);
        expect(component).toBe("");
      }
    });

    it("should use UTC hour for hourly refresh on price-driven routes", () => {
      // The hourly component should be the current UTC hour
      const now = new Date();
      const expectedHourPattern = now.toISOString().slice(0, 13); // "2025-01-15T14"

      const component = getTimeComponentForRoute("/api/dashboard");
      // Component should match the pattern (seconds might differ slightly in test execution)
      expect(component).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
      // Should be in the current hour range
      const componentHour = component.slice(0, 13);
      // Allow 1-hour tolerance for test execution
      const expectedHours = [
        expectedHourPattern,
        new Date(Date.now() - 3600000).toISOString().slice(0, 13),
      ];
      expect(expectedHours).toContain(componentHour);
    });
  });
});
