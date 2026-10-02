import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mutate = vi.fn();
vi.mock("swr", () => ({ mutate: (...a: unknown[]) => mutate(...a) }));

import { installWriteRevalidation, isApiKey, isRevalidatingWrite } from "@/lib/data/write-revalidation";

describe("write revalidation", () => {
  beforeEach(() => {
    mutate.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("only data writes to /api trigger it; auth, telemetry and UI prefs do not", () => {
    expect(isRevalidatingWrite("POST", "/api/transactions")).toBe(true);
    expect(isRevalidatingWrite("delete", "/api/accounts")).toBe(true);
    expect(isRevalidatingWrite("PUT", "/api/settings/display-currency")).toBe(true);
    expect(isRevalidatingWrite("GET", "/api/transactions")).toBe(false);
    expect(isRevalidatingWrite("POST", "/api/auth/logout")).toBe(false);
    expect(isRevalidatingWrite("POST", "/api/csp-report")).toBe(false);
    expect(isRevalidatingWrite("PUT", "/api/settings/tx-columns")).toBe(false);
    expect(isRevalidatingWrite("POST", "/other")).toBe(false);
    expect(isApiKey("/api/accounts")).toBe(true);
    expect(isApiKey(["/api/x", 1])).toBe(false);
  });

  it("a burst of successful writes schedules ONE revalidation of API keys; failed writes none", async () => {
    const base = vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) =>
      new Response("{}", { status: init?.method === "PATCH" ? 500 : 200 }),
    );
    vi.stubGlobal("window", { fetch: base, location: { origin: "https://app.test" } });
    const uninstall = installWriteRevalidation();
    await window.fetch("/api/transactions", { method: "POST" });
    await window.fetch("/api/transactions/5", { method: "PUT" });
    await window.fetch("/api/accounts", { method: "PATCH" }); // 500
    await window.fetch("/api/accounts"); // GET
    vi.advanceTimersByTime(100);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toBe(isApiKey);

    mutate.mockReset();
    await window.fetch("/api/accounts", { method: "PATCH" });
    vi.advanceTimersByTime(100);
    expect(mutate).not.toHaveBeenCalled();
    uninstall();
    expect(window.fetch).toBe(base);
  });
});
