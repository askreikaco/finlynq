/**
 * Tests for clientIp function (M6).
 *
 * Covers:
 * - x-real-ip header takes priority
 * - x-forwarded-for first entry is used when x-real-ip is absent
 * - Both absent returns "unknown"
 * - Whitespace is trimmed
 */

import { describe, it, expect } from "vitest";
import { clientIp } from "@/lib/client-ip";

describe("clientIp", () => {
  it("should return x-real-ip when present", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "192.168.1.1" },
    });
    expect(clientIp(req)).toBe("192.168.1.1");
  });

  it("should trim x-real-ip whitespace", () => {
    const req = new Request("http://localhost", {
      headers: { "x-real-ip": "  192.168.1.1  " },
    });
    expect(clientIp(req)).toBe("192.168.1.1");
  });

  it("should prefer x-real-ip over x-forwarded-for", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-real-ip": "192.168.1.1",
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
      },
    });
    expect(clientIp(req)).toBe("192.168.1.1");
  });

  it("should use first entry of x-forwarded-for when x-real-ip is absent", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" },
    });
    expect(clientIp(req)).toBe("10.0.0.1");
  });

  it("should trim x-forwarded-for first entry whitespace", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  10.0.0.1  , 10.0.0.2" },
    });
    expect(clientIp(req)).toBe("10.0.0.1");
  });

  it("should return unknown when neither header is present", () => {
    const req = new Request("http://localhost");
    expect(clientIp(req)).toBe("unknown");
  });

  it("should return unknown when x-forwarded-for is empty", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "" },
    });
    expect(clientIp(req)).toBe("unknown");
  });

  it("should fallback when x-real-ip is empty string", () => {
    const req = new Request("http://localhost", {
      headers: {
        "x-real-ip": "",
        "x-forwarded-for": "10.0.0.1",
      },
    });
    // Empty string is falsy, should fall back to x-forwarded-for
    expect(clientIp(req)).toBe("10.0.0.1");
  });
});
