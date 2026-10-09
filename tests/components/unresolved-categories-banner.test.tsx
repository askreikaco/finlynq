/**
 * @vitest-environment jsdom
 */
/**
 * UnresolvedCategoriesBanner (PKG5). "Create rule" navigates to the full-page
 * rule editor instead of opening a dialog; no FK lists are fetched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/import/pending",
}));

import { UnresolvedCategoriesBanner } from "@/components/staging/unresolved-categories-banner";

const fetchMock = vi.fn();

beforeEach(() => {
  nav.push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState({}, "", "/import/pending?id=batch1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

function renderBanner(payees: string[], onDismiss = vi.fn()) {
  render(
    <UnresolvedCategoriesBanner
      stagedImportId="batch1"
      rowIds={payees.map((_, i) => `row-${i}`)}
      payees={payees}
      onDismiss={onDismiss}
    />,
  );
  return onDismiss;
}

describe("UnresolvedCategoriesBanner", () => {
  it("lists each row's payee with a Create rule action and fetches nothing", () => {
    renderBanner(["STARBUCKS", "UBER"]);
    expect(screen.getByText("2 rows need a category before import")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Create rule/ })).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Create rule navigates to /settings/rules/new with the payee, staged batch and this page as returnTo", () => {
    renderBanner(["STARBUCKS", "UBER"]);
    fireEvent.click(screen.getAllByRole("button", { name: /Create rule/ })[1]);
    expect(nav.push).toHaveBeenCalledWith(
      "/settings/rules/new?payee=UBER&stagedImportId=batch1&returnTo=%2Fimport%2Fpending%3Fid%3Dbatch1",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an empty payee is passed as empty, not as the '(no payee)' label", () => {
    renderBanner([""]);
    fireEvent.click(screen.getByRole("button", { name: /Create rule/ }));
    const url = nav.push.mock.calls[0][0] as string;
    expect(new URL(url, "http://x").searchParams.get("payee")).toBe("");
  });

  it("does not render a rule dialog in place", () => {
    renderBanner(["STARBUCKS"]);
    fireEvent.click(screen.getByRole("button", { name: /Create rule/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Rule name")).toBeNull();
  });

  it("the dismiss control calls onDismiss", () => {
    const onDismiss = renderBanner(["STARBUCKS"]);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss banner" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
