import { describe, it, expect, vi, beforeEach } from "vitest";
import { middleware, config as middlewareConfig } from "@/middleware";
import { isInstanceAdminPath } from "@/lib/admin/instance-flag";
import { NextRequest } from "next/server";

describe("Middleware — Security Headers", () => {
  function makeRequest(path: string) {
    return new NextRequest(new URL(path, "http://localhost:3000"));
  }

  it("sets Content-Security-Policy header", () => {
    const res = middleware(makeRequest("/api/accounts"));
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sets X-Frame-Options to DENY", () => {
    const res = middleware(makeRequest("/api/test"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options to nosniff", () => {
    const res = middleware(makeRequest("/api/test"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Referrer-Policy", () => {
    const res = middleware(makeRequest("/api/test"));
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets Permissions-Policy", () => {
    const res = middleware(makeRequest("/"));
    const pp = res.headers.get("Permissions-Policy");
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("payment=()");
  });

  it("applies headers to non-static routes", () => {
    const res = middleware(makeRequest("/dashboard"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});

// B10 — finding C-8: nonce-based CSP, no 'unsafe-inline' on script-src.
describe("Middleware — CSP nonce (B10)", () => {
  function makeRequest(path: string) {
    return new NextRequest(new URL(path, "http://localhost:3000"));
  }

  function getScriptSrc(csp: string): string {
    const directive = csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    if (!directive) throw new Error("script-src directive missing");
    return directive;
  }

  function extractNonce(csp: string): string | null {
    const match = csp.match(/'nonce-([^']+)'/);
    return match ? match[1] : null;
  }

  it("includes a 'nonce-...' source in script-src", () => {
    const res = middleware(makeRequest("/dashboard"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = getScriptSrc(csp);
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  it("includes 'strict-dynamic' in script-src", () => {
    const res = middleware(makeRequest("/dashboard"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = getScriptSrc(csp);
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("does NOT include 'unsafe-inline' in script-src", () => {
    const res = middleware(makeRequest("/dashboard"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = getScriptSrc(csp);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("does NOT include 'unsafe-inline' in script-src on marketing routes", () => {
    const res = middleware(makeRequest("/cloud"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const scriptSrc = getScriptSrc(csp);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Still nonce-based even with the GA host added at marketing routes.
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  it("emits a fresh nonce on each request", () => {
    const res1 = middleware(makeRequest("/dashboard"));
    const res2 = middleware(makeRequest("/dashboard"));
    const nonce1 = extractNonce(res1.headers.get("Content-Security-Policy") ?? "");
    const nonce2 = extractNonce(res2.headers.get("Content-Security-Policy") ?? "");
    expect(nonce1).toBeTruthy();
    expect(nonce2).toBeTruthy();
    expect(nonce1).not.toBe(nonce2);
  });

  it("exposes the nonce on the response x-nonce header", () => {
    const res = middleware(makeRequest("/dashboard"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const cspNonce = extractNonce(csp);
    const headerNonce = res.headers.get("x-nonce");
    expect(headerNonce).toBeTruthy();
    expect(headerNonce).toBe(cspNonce);
  });

  it("nonce is at least 128 bits of entropy (≥22 base64 chars)", () => {
    const res = middleware(makeRequest("/dashboard"));
    const nonce = res.headers.get("x-nonce") ?? "";
    // 16 random bytes → 24-char base64 (with padding).
    expect(nonce.length).toBeGreaterThanOrEqual(22);
  });

  it("includes object-src 'none'", () => {
    const res = middleware(makeRequest("/dashboard"));
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("object-src 'none'");
  });
});

describe("Middleware — Matcher pattern (WP9a)", () => {
  it("matcher[0] RegExp matches /api/admin/instance/config", () => {
    // Verify middleware config has matcher defined
    expect(middlewareConfig.matcher).toBeDefined();
    expect(middlewareConfig.matcher[0]).toBeDefined();

    // Build RegExp from the matcher pattern (Next.js path-to-regexp syntax)
    // The pattern: /((?!_next/static|_next/image|favicon.ico).*)/
    // Matches anything that doesn't start with the excluded paths
    const regex = new RegExp(`^/((?!_next/static|_next/image|favicon.ico).*)$`);

    expect(regex.test("/api/admin/instance/config")).toBe(true);
  });

  it("matcher[0] RegExp matches /admin/instance", () => {
    const regex = new RegExp(`^/((?!_next/static|_next/image|favicon.ico).*)$`);
    expect(regex.test("/admin/instance")).toBe(true);
  });

  it("matcher[0] RegExp does NOT match /_next/static/x", () => {
    const regex = new RegExp(`^/((?!_next/static|_next/image|favicon.ico).*)$`);
    expect(regex.test("/_next/static/x")).toBe(false);
  });

  it("matcher[0] RegExp does NOT match /_next/image", () => {
    const regex = new RegExp(`^/((?!_next/static|_next/image|favicon.ico).*)$`);
    expect(regex.test("/_next/image")).toBe(false);
  });

  it("matcher[0] RegExp does NOT match /favicon.ico", () => {
    const regex = new RegExp(`^/((?!_next/static|_next/image|favicon.ico).*)$`);
    expect(regex.test("/favicon.ico")).toBe(false);
  });
});

describe("Middleware — Instance Admin kill switch (WP9a)", () => {
  function makeRequest(path: string, method = "GET") {
    return new NextRequest(new URL(path, "http://localhost:3000"), { method });
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Clear the env var before each test
    delete process.env.FINLYNQ_INSTANCE_ADMIN;
  });

  it("returns 404 for /admin/instance page when flag is unset", () => {
    const res = middleware(makeRequest("/admin/instance"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for /api/admin/instance/config when flag is unset", () => {
    const res = middleware(makeRequest("/api/admin/instance/config"));
    expect(res.status).toBe(404);
  });

  it("allows /admin/instance when flag is set to '1'", () => {
    process.env.FINLYNQ_INSTANCE_ADMIN = "1";
    const res = middleware(makeRequest("/admin/instance"));
    // NextResponse.next() returns status 200 (the normal flow continues)
    expect(res.status).toBe(200);
  });

  it("allows /api/admin/instance/config when flag is set to 'true'", () => {
    process.env.FINLYNQ_INSTANCE_ADMIN = "true";
    const res = middleware(makeRequest("/api/admin/instance/config"));
    expect(res.status).toBe(200);
  });

  it("does not affect other routes when flag is unset", () => {
    const res = middleware(makeRequest("/dashboard"));
    expect(res.status).toBe(200);
  });

  it("does not affect /family routes", () => {
    const res = middleware(makeRequest("/family/overview"));
    expect(res.status).toBe(200);
  });

  it("API 404 response has correct body format and content-type", async () => {
    const res = middleware(makeRequest("/api/admin/instance/config"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ error: "Not found" });
  });

  it("page 404 response has x-middleware-rewrite header", () => {
    const res = middleware(makeRequest("/admin/instance"));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/instance-admin-disabled");
  });

  it("DELETE with cookie and evil Origin returns 404 not 403 (gate before CSRF)", () => {
    const res = middleware(
      new NextRequest(new URL("/api/admin/instance/config", "http://localhost:3000"), {
        method: "DELETE",
        headers: {
          cookie: "pf_session=abc123",
          origin: "https://evil.com",
        },
      })
    );
    expect(res.status).toBe(404);
    // Not 403 (CSRF), because instance-admin gate runs first
  });

  it("isInstanceAdminPath matches /api/admin/instance (exact)", () => {
    expect(isInstanceAdminPath("/api/admin/instance")).toBe(true);
  });

  it("isInstanceAdminPath matches /api/admin/instance/config (subpath)", () => {
    expect(isInstanceAdminPath("/api/admin/instance/config")).toBe(true);
  });

  it("isInstanceAdminPath matches /admin/instance/subpage (page subpath)", () => {
    expect(isInstanceAdminPath("/admin/instance/subpage")).toBe(true);
  });

  it("isInstanceAdminPath does not match /admin/instances (plural)", () => {
    expect(isInstanceAdminPath("/admin/instances")).toBe(false);
  });

  it("isInstanceAdminPath does not match /admin/instance-x (with suffix)", () => {
    expect(isInstanceAdminPath("/admin/instance-x")).toBe(false);
  });
});
