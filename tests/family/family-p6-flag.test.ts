/**
 * P6: FAMILY_WEALTH_ENABLED kill switch (default ON) + invite-page Referrer-Policy.
 * Pure (no DB): exercises the real middleware and flag helpers.
 */
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isFamilyWealthEnabled, isFamilyWealthPath } from "@/lib/family/flag";

const req = (path: string, method = "GET") => new NextRequest(new URL(path, "http://localhost:3000"), { method });

afterEach(() => {
  delete process.env.FAMILY_WEALTH_ENABLED;
});

describe("isFamilyWealthEnabled", () => {
  it("defaults ON (unset, empty, or any non-off value)", () => {
    for (const v of [undefined, "", "1", "true", "on", "yes", "garbage"]) {
      expect(isFamilyWealthEnabled({ FAMILY_WEALTH_ENABLED: v })).toBe(true);
    }
  });
  it("is OFF for 0/false/off/no in any case, with whitespace", () => {
    for (const v of ["0", "false", "FALSE", "off", "No", " false "]) {
      expect(isFamilyWealthEnabled({ FAMILY_WEALTH_ENABLED: v })).toBe(false);
    }
  });
  it("path matcher covers pages and API, not look-alikes", () => {
    for (const p of ["/family", "/family/accept", "/api/family/overview", "/api/family/manage/list"]) {
      expect(isFamilyWealthPath(p)).toBe(true);
    }
    for (const p of ["/familyx", "/api/familyfoo", "/families", "/api/accounts", "/"]) {
      expect(isFamilyWealthPath(p)).toBe(false);
    }
  });
});

describe("middleware with the flag", () => {
  it("enabled (default): family routes pass through", () => {
    for (const p of ["/family", "/family/accept?token=x", "/api/family/overview", "/api/family/manage/list"]) {
      const res = middleware(req(p));
      expect(res.status, p).not.toBe(404);
    }
  });

  it("disabled: pages rewrite to a 404, API answers 404 JSON; everything else is untouched", async () => {
    process.env.FAMILY_WEALTH_ENABLED = "false";
    const api = middleware(req("/api/family/overview"));
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: "Not found" });
    expect(middleware(req("/api/family/manage/invite", "POST")).status).toBe(404);
    const page = middleware(req("/family"));
    expect(page.status).toBe(404);
    expect(middleware(req("/family/accept?token=abc")).status).toBe(404);
    for (const p of ["/dashboard", "/api/accounts", "/api/auth/session", "/familyx"]) {
      expect(middleware(req(p)).status, p).not.toBe(404);
    }
  });
});

describe("Referrer-Policy on invite pages", () => {
  it("no-referrer for /family and /family/*; unchanged elsewhere", () => {
    expect(middleware(req("/family/accept?token=t")).headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(middleware(req("/family")).headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(middleware(req("/dashboard")).headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(middleware(req("/familyx")).headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
