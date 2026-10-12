// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { CurrencyProvider, useDisplayCurrency } from "@/components/currency-provider";
import { LOCAL_WRITE_QUEUE_KEY } from "@/lib/local-first/write-path/flag";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

function Probe() {
  const { displayCurrency, isLoading } = useDisplayCurrency();
  return <div>{isLoading ? "loading" : `cur:${displayCurrency}`}</div>;
}

describe("CurrencyProvider offline", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LOCAL_WRITE_QUEUE_KEY, "1");
    localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the remembered currency when the network is down", async () => {
    localStorage.setItem("finlynq.lf.displayCurrency", "VND");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<CurrencyProvider><Probe /></CurrencyProvider>);
    await waitFor(() => expect(screen.getByText("cur:VND")).toBeTruthy());
  });
});
