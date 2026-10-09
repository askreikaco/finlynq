/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND", isLoading: false }) }));

import DividendsPage from "@/app/(app)/portfolio/dividends/page";

const DIVIDENDS_OK = {
  success: true,
  data: {
    groups: [],
    totals: { amount: 0, rowCount: 0, byCurrency: {} },
    mode: "native",
    reportingCurrency: "VND",
  },
};

let dividendsCalls: number;

// First call fails in the way given by `firstFailure`; later calls succeed.
function stubFetch(firstFailure: "unsuccessful" | "rejected") {
  dividendsCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/portfolio/dividends")) {
        dividendsCalls++;
        if (dividendsCalls === 1) {
          if (firstFailure === "rejected") throw new Error("network down");
          return { ok: true, status: 200, json: async () => ({ success: false }) };
        }
        return { ok: true, status: 200, json: async () => DIVIDENDS_OK };
      }
      return { ok: false, status: 404, json: async () => null };
    }),
  );
}

beforeEach(() => {
  dividendsCalls = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Dividends page error state", () => {
  it("shows the ErrorState alert when the response is unsuccessful, and retry clears it", async () => {
    stubFetch("unsuccessful");
    render(<DividendsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load dividends");
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(dividendsCalls).toBe(2);
  });

  it("shows the ErrorState alert when the fetch rejects, and retry clears it", async () => {
    stubFetch("rejected");
    render(<DividendsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load dividends");
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(dividendsCalls).toBe(2);
  });
});
