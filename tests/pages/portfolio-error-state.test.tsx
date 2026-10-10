/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }), usePathname: () => "/portfolio" }));
vi.mock("@/hooks/use-dev-mode", () => ({ useDevMode: () => false }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/portfolio/PerformanceChart", () => ({ PerformanceChart: () => <div data-testid="perf-chart" /> }));
vi.mock("@/components/portfolio/lot-inspector-dialog", () => ({ LotInspectorDialog: () => null }));
vi.mock("@/components/holdings/holding-edit-form", () => ({ HoldingEditForm: () => null }));
vi.mock("@/app/(app)/portfolio/_components/allocation-charts", () => ({ AllocationCharts: () => null }));
vi.mock("@/app/(app)/portfolio/_components/holdings-by-account", () => ({ HoldingsByAccount: () => <div data-testid="by-account" /> }));

const overview = vi.hoisted(() => ({ current: null as unknown }));
const reloadFn = vi.hoisted(() => vi.fn());
vi.mock("@/app/(app)/portfolio/_hooks/use-portfolio", () => ({
  usePortfolioOverview: () => ({ data: overview.current, loading: false, reload: reloadFn }),
  useBenchmarks: () => ({ benchmarks: [], benchmarkLoading: false }),
}));

import PortfolioPage from "@/app/(app)/portfolio/page";

describe("portfolio page error state", () => {
  beforeEach(() => { reloadFn.mockClear(); });

  it("shows ErrorState with retry when overview data is missing", async () => {
    overview.current = null;
    render(<PortfolioPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load portfolio");
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(reloadFn).toHaveBeenCalledTimes(1);
  });

  it("shows ErrorState when overview has no summary", async () => {
    overview.current = { holdings: [], byHolding: [] };
    render(<PortfolioPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load portfolio");
  });

  it("shows ErrorState (no crash) when the API returns an error object without holdings", async () => {
    overview.current = { error: "Internal error" };
    render(<PortfolioPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load portfolio");
  });
});
