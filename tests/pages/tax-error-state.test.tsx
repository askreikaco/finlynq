/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/dev-mode-guard", () => ({ DevModeGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "CAD", isLoading: false }) }));

import TaxPage from "@/app/(app)/tax/page";

const TAX_OK = {
  tfsa: { totalRoom: 0, used: 0, remaining: 0, currentYearLimit: 0 },
  rrsp: { contributions: [] },
  resp: { contributions: [], grantExample: 0 },
  assetLocationAdvice: [],
  marginalRates: { at100k: { federal: 20, provincial: 10, combined: 30 } },
};

let taxCalls: number;

beforeEach(() => {
  taxCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/api/tax")) {
        taxCalls++;
        if (taxCalls === 1) return { ok: false, status: 500, json: async () => null };
        return { ok: true, status: 200, json: async () => TAX_OK };
      }
      return { ok: false, status: 404, json: async () => null };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Tax page error state", () => {
  it("shows the ErrorState alert when the tax fetch fails", async () => {
    render(<TaxPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load tax data");
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("retry refetches tax data, clears the alert and renders the loaded page", async () => {
    render(<TaxPage />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    await screen.findByText(/Marginal Tax Rates \(Ontario\)/);
    expect(taxCalls).toBe(2);
  });
});
