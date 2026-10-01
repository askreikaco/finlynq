/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { useEffect } from "react";

let cur = { displayCurrency: "USD", isLoading: true, setDisplayCurrency: async () => {} };
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => cur }));

import { LanguageProvider, useLanguage } from "@/components/language-provider";

let mounts = 0;
function Probe() {
  const { locale } = useLanguage();
  useEffect(() => { mounts++; }, []);
  return <div data-testid="loc">{locale}</div>;
}

beforeEach(() => {
  mounts = 0;
  localStorage.clear();
  cur = { displayCurrency: "USD", isLoading: true, setDisplayCurrency: async () => {} };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ pref: "auto" }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const tree = () => <LanguageProvider><Probe /></LanguageProvider>;

describe("LanguageProvider first load", () => {
  it("no cache: waits for currency, mounts children once as vi (never as en first)", async () => {
    const { rerender } = render(tree());
    await act(async () => {});
    expect(screen.queryByTestId("loc")).toBeNull();
    cur = { ...cur, displayCurrency: "VND", isLoading: false };
    rerender(tree());
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("vi-VN"));
    expect(mounts).toBe(1);
  });
  it("cache hit: renders immediately as vi and does not remount when live data agrees", async () => {
    localStorage.setItem("pf-language-cache", JSON.stringify({ pref: "auto", cur: "VND" }));
    const { rerender } = render(tree());
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("vi-VN"));
    cur = { ...cur, displayCurrency: "VND", isLoading: false };
    rerender(tree());
    await act(async () => {});
    expect(screen.getByTestId("loc").textContent).toBe("vi-VN");
    expect(mounts).toBe(1);
    expect(JSON.parse(localStorage.getItem("pf-language-cache")!)).toEqual({ pref: "auto", cur: "VND" });
  });
  it("en user: single mount", async () => {
    cur = { ...cur, displayCurrency: "USD", isLoading: false };
    render(tree());
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("en-CA"));
    expect(mounts).toBe(1);
  });
});
