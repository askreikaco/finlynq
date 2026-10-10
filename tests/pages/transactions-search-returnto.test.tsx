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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Raw query values as they arrive in the URL (percent-encoded). searchParams decodes them once.
const HOSTILE = [
  "/%09/evil.test", // decodes to "/<TAB>/evil.test": browsers strip the tab, giving "//evil.test"
  "/%0A/evil.test", // LF
  "/%0D/evil.test", // CR
  "/%20/evil.test", // space
  "//evil.test", // protocol-relative
  "/%5Cevil.test", // backslash
  "https%3A%2F%2Fevil.test%2Fx", // absolute URL
  "javascript%3Aalert(1)", // script scheme
];

async function renderWith(returnTo: string) {
  query = `returnTo=${returnTo}`;
  render(<SearchPage />);
  return screen.findByRole("button", { name: /^Search$/ });
}

describe("transactions/search returnTo: hostile values fall back to /transactions", () => {
  for (const bad of HOSTILE) {
    it(`rejects returnTo=${bad} for the submit navigation and the back link`, async () => {
      const btn = await renderWith(bad);
      fireEvent.click(btn);
      await waitFor(() => expect(push).toHaveBeenCalled());
      const target = String(push.mock.calls[0][0]);
      const url = new URL(target, "https://app.test");
      expect(url.origin).toBe("https://app.test");
      expect(url.pathname).toBe("/transactions");
      expect(target).not.toMatch(/[\t\r\n\\]/);
      const back = screen.getByRole("link", { name: "Back" });
      expect(back.getAttribute("href")).toBe("/transactions");
    });
  }
});

describe("transactions/search returnTo: same-app paths still work", () => {
  it("keeps /accounts/22 for submit and back", async () => {
    const btn = await renderWith("%2Faccounts%2F22");
    fireEvent.click(btn);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(new URL(String(push.mock.calls[0][0]), "https://app.test").pathname).toBe("/accounts/22");
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/accounts/22");
  });
});
