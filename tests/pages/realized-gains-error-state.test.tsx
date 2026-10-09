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

import RealizedGainsPage from "@/app/(app)/portfolio/realized-gains/page";

const RG_OK = {
  success: true,
  data: {
    rows: [],
    totals: { realizedGain: 0, qtyClosed: 0, rowCount: 0, byCurrency: {} },
  },
};

let rgCalls: number;
let mode: "reject" | "fail" | "ok";

beforeEach(() => {
  rgCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/portfolio/realized-gains")) {
        rgCalls++;
        if (rgCalls === 1 && mode === "reject") throw new Error("network down");
        if (rgCalls === 1 && mode === "fail") return { ok: true, status: 200, json: async () => ({ success: false }) };
        return { ok: true, status: 200, json: async () => RG_OK };
      }
      return { ok: false, status: 404, json: async () => null };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Realized gains page error state", () => {
  it("shows the ErrorState alert when the API reports success=false", async () => {
    mode = "fail";
    render(<RealizedGainsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load realized gains");
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("shows the ErrorState alert when the fetch rejects", async () => {
    mode = "reject";
    render(<RealizedGainsPage />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't load realized gains");
  });

  it("retry refetches realized gains and clears the alert on success", async () => {
    mode = "reject";
    render(<RealizedGainsPage />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(rgCalls).toBe(2);
  });
});
