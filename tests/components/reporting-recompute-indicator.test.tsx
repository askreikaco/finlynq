/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { Notice } from "@/components/notice";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";

afterEach(cleanup);

describe("Notice source=reporting-recompute", () => {
  beforeEach(() => {
    // Default mock for fetch
    global.fetch = vi.fn((): Promise<Response> =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            inFlight: true,
            startedAt: new Date().toISOString(),
            finishedAt: null,
            done: 50,
            total: 100,
            targetCurrency: "USD",
          }),
      } as unknown as Response),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["/budgets", "/dashboard", "/transactions"])(
    "sits just above the tab bar on phones and at regular:bottom-4 on %s",
    async (path) => {
      vi.mocked(usePathname).mockReturnValue(path);

      const { container } = render(<Notice source="reporting-recompute" />);

      await waitFor(() => {
        const indicator = container.querySelector("div.fixed");
        expect(indicator).toBeTruthy();
        expect(indicator?.className).toContain(
          "max-regular:bottom-[calc(var(--mobile-bar-clearance)+0.5rem)]",
        );
        expect(indicator?.className).not.toContain("+80px");
        expect(indicator?.className).toContain("regular:bottom-4");
        expect(indicator?.className).not.toContain("regular:bottom-24");
        expect(indicator?.className).not.toContain("+64px");
      });
    },
  );

  it("displays running state with progress", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    const { getByText } = render(<Notice source="reporting-recompute" />);

    await waitFor(() => {
      expect(getByText(/Recalculating reports/)).toBeTruthy();
      expect(getByText(/50\/100/)).toBeTruthy();
    });
  });

  it("displays completed state", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    global.fetch = vi.fn((): Promise<Response> =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            inFlight: false,
            startedAt: new Date(Date.now() - 2000).toISOString(),
            finishedAt: new Date().toISOString(),
            done: 100,
            total: 100,
            targetCurrency: "USD",
            finished: true,
          }),
      } as unknown as Response),
    );

    const { getByText } = render(<Notice source="reporting-recompute" />);

    await waitFor(() => {
      expect(getByText(/Reports updated/)).toBeTruthy();
    });
  });

  it("hides when no recompute is in progress", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    global.fetch = vi.fn((): Promise<Response> =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            inFlight: false,
            startedAt: null,
            finishedAt: null,
            done: 0,
            total: 0,
            targetCurrency: "USD",
            finished: false,
          }),
      } as unknown as Response),
    );

    const { container } = render(<Notice source="reporting-recompute" />);

    await waitFor(() => {
      const indicators = container.querySelectorAll("div.fixed");
      // Should not have the indicator div when not in progress
      expect(indicators.length).toBe(0);
    });
  });
});
