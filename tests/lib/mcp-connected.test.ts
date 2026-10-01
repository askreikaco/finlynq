import { describe, it, expect } from "vitest";
import { isMcpConnected } from "@/lib/mcp/connected";

describe("isMcpConnected", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  it("returns true when OAuth apps are connected", () => {
    const result = isMcpConnected([{ id: 1 }], null, now);
    expect(result).toBe(true);
  });

  it("returns true when API key was used within 30 days", () => {
    // 1 day ago
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const result = isMcpConnected([], oneDayAgo, now);
    expect(result).toBe(true);
  });

  it("returns false when API key was used more than 30 days ago", () => {
    // 31 days ago
    const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const result = isMcpConnected([], thirtyOneDaysAgo, now);
    expect(result).toBe(false);
  });

  it("returns false when no apps and no API key usage", () => {
    const result = isMcpConnected([], null, now);
    expect(result).toBe(false);
  });

  it("returns true at the exact 30-day boundary (just before expiry)", () => {
    // Exactly 30 days ago minus 1 minute
    const thirtyDaysMinusOneMin = new Date(now.getTime() - (30 * 24 * 60 - 1) * 60 * 1000).toISOString();
    const result = isMcpConnected([], thirtyDaysMinusOneMin, now);
    expect(result).toBe(true);
  });

  it("returns false at exactly 30 days (boundary expired)", () => {
    // Exactly 30 days ago
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = isMcpConnected([], thirtyDaysAgo, now);
    expect(result).toBe(false);
  });

  it("uses current date when now is not provided", () => {
    const result = isMcpConnected([], new Date().toISOString(), new Date());
    expect(result).toBe(true);
  });

  it("handles invalid date strings gracefully", () => {
    const result = isMcpConnected([], "invalid-date", now);
    expect(result).toBe(false);
  });

  it("returns true when both apps and recent API key usage exist", () => {
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const result = isMcpConnected([{ id: 1 }], oneDayAgo, now);
    expect(result).toBe(true);
  });
});
