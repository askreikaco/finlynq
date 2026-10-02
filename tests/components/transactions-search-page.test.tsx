/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

let query = "";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => "/transactions/search",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import SearchPage from "@/app/(app)/transactions/search/page";

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderPage(q: string) {
  query = q;
  render(<SearchPage />);
  return screen.findByRole("button", { name: /^Search$/ });
}

describe("mobile transaction search page", () => {
  it("prefills from the URL and returns the filters to returnTo", async () => {
    const searchBtn = await renderPage("returnTo=%2Ftransactions&search=coffee&direction=out");
    expect((screen.getByPlaceholderText("Payee or note") as HTMLInputElement).value).toBe("coffee");
    expect(screen.getByRole("radio", { name: "Outgoing" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Incoming" }));
    fireEvent.click(searchBtn);
    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = new URL(push.mock.calls[0][0], "https://x.test");
    expect(url.pathname).toBe("/transactions");
    expect(url.searchParams.get("search")).toBe("coffee");
    expect(url.searchParams.get("direction")).toBe("in");
  });

  it("never navigates off-site: absolute or protocol-relative returnTo falls back to /transactions", async () => {
    for (const bad of ["https%3A%2F%2Fevil.test%2Fx", "%2F%2Fevil.test", "%2F%5Cevil.test"]) {
      push.mockClear();
      const btn = await renderPage(`returnTo=${bad}`);
      fireEvent.click(btn);
      await waitFor(() => expect(push).toHaveBeenCalled());
      expect(String(push.mock.calls[0][0]).startsWith("/transactions")).toBe(true);
      cleanup();
    }
  });

  it("returns to the account page it came from", async () => {
    const btn = await renderPage("returnTo=%2Faccounts%2F22");
    fireEvent.click(btn);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(String(push.mock.calls[0][0]).startsWith("/accounts/22")).toBe(true);
  });
});
