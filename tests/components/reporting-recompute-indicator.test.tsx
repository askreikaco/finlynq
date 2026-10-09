/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { ReportingRecomputeIndicator } from "@/components/reporting-recompute-indicator";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";

afterEach(cleanup);

describe("ReportingRecomputeIndicator", () => {
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

  it("renders with normal classes when avoidFab is not set", async () => {
    vi.mocked(usePathname).mockReturnValue("/budgets");

    const { container } = render(<ReportingRecomputeIndicator />);

    await waitFor(() => {
      const indicator = container.querySelector("div.fixed");
      expect(indicator).toBeTruthy();
      expect(indicator?.className).toContain("bottom-[calc(var(--mobile-bar-clearance)-8px)]");
      expect(indicator?.className).toContain("md:bottom-4");
    });
  });

  it("renders with normal classes when avoidFab is false", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    const { container } = render(<ReportingRecomputeIndicator avoidFab={false} />);

    await waitFor(() => {
      const indicator = container.querySelector("div.fixed");
      expect(indicator).toBeTruthy();
      expect(indicator?.className).toContain("bottom-[calc(var(--mobile-bar-clearance)-8px)]");
      expect(indicator?.className).toContain("md:bottom-4");
    });
  });

  it("renders with FAB-avoidance classes on /dashboard when avoidFab is true", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    const { container } = render(<ReportingRecomputeIndicator avoidFab={true} />);

    await waitFor(() => {
      const indicator = container.querySelector("div.fixed");
      expect(indicator).toBeTruthy();
      expect(indicator?.className).toContain("bottom-[calc(var(--mobile-bar-clearance)+64px)]");
      expect(indicator?.className).toContain("md:bottom-24");
    });
  });

  it("renders with FAB-avoidance classes on /transactions when avoidFab is true", async () => {
    vi.mocked(usePathname).mockReturnValue("/transactions");

    const { container } = render(<ReportingRecomputeIndicator avoidFab={true} />);

    await waitFor(() => {
      const indicator = container.querySelector("div.fixed");
      expect(indicator).toBeTruthy();
      expect(indicator?.className).toContain("bottom-[calc(var(--mobile-bar-clearance)+64px)]");
      expect(indicator?.className).toContain("md:bottom-24");
    });
  });

  it("renders with normal classes on /budgets when avoidFab is true", async () => {
    vi.mocked(usePathname).mockReturnValue("/budgets");

    const { container } = render(<ReportingRecomputeIndicator avoidFab={true} />);

    await waitFor(() => {
      const indicator = container.querySelector("div.fixed");
      expect(indicator).toBeTruthy();
      expect(indicator?.className).toContain("bottom-[calc(var(--mobile-bar-clearance)-8px)]");
      expect(indicator?.className).toContain("md:bottom-4");
    });
  });

  it("displays running state with progress", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    const { getByText } = render(<ReportingRecomputeIndicator avoidFab={false} />);

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

    const { getByText } = render(<ReportingRecomputeIndicator avoidFab={false} />);

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

    const { container } = render(<ReportingRecomputeIndicator avoidFab={false} />);

    await waitFor(() => {
      const indicators = container.querySelectorAll("div.fixed");
      // Should not have the indicator div when not in progress
      expect(indicators.length).toBe(0);
    });
  });
});
