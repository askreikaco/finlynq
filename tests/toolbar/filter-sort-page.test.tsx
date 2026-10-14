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
  usePathname: () => "/filter/goals",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { FilterSortPage } from "@/components/filter-sort-page";
import { FILTER_CONFIGS } from "@/lib/toolbar/list-configs";

beforeEach(() => {
  push.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const goals = FILTER_CONFIGS.goals;
const go = () => new URL(String(push.mock.calls[0][0]), "https://x.test");

describe("FilterSortPage", () => {
  it("shows Sort (Date default) then the list's filters", () => {
    query = "returnTo=%2Fgoals";
    render(<FilterSortPage config={goals} />);
    const radios = screen.getAllByRole("radio", { checked: true });
    expect(screen.getByRole("radiogroup", { name: "Sort by" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Deadline/ }).getAttribute("aria-checked")).toBe("true");
    expect(radios.length).toBeGreaterThan(1);
    expect(screen.getByRole("radiogroup", { name: "Status" })).toBeTruthy();
  });

  it("Apply returns to returnTo with filters + sort merged, keeping range and q", async () => {
    query = "returnTo=%2Fgoals%3Frange%3Dthis_year%26q%3Dcar";
    render(<FilterSortPage config={goals} />);
    fireEvent.click(screen.getByRole("radio", { name: "Completed" }));
    fireEvent.click(screen.getByRole("radio", { name: "Name" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const u = go();
    expect(u.pathname).toBe("/goals");
    expect(u.searchParams.get("status")).toBe("completed");
    expect(u.searchParams.get("sort")).toBe("name");
    expect(u.searchParams.get("dir")).toBeNull();
    expect(u.searchParams.get("range")).toBe("this_year");
    expect(u.searchParams.get("q")).toBe("car");
  });

  it("direction toggle flips A-Z / Z-A and Apply writes ?dir=", async () => {
    query = "returnTo=%2Fgoals";
    render(<FilterSortPage config={goals} />);
    fireEvent.click(screen.getByRole("radio", { name: "Name" }));
    const toggle = screen.getByRole("button", { name: /Name direction: A-Z/ });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /Name direction: Z-A/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(go().searchParams.get("sort")).toBe("name");
    expect(go().searchParams.get("dir")).toBe("desc");
  });

  it("toggling an unselected sort selects it in the flipped direction", () => {
    query = "returnTo=%2Fgoals";
    render(<FilterSortPage config={goals} />);
    fireEvent.click(screen.getByRole("button", { name: /Amount direction: Biggest first/ }));
    expect(screen.getByRole("radio", { name: "Amount" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: /Amount direction: Smallest first/ })).toBeTruthy();
  });

  it("Reset clears every owned param and returns to returnTo", async () => {
    query = "returnTo=%2Fgoals%3Frange%3Dthis_year%26status%3Dactive%26sort%3Dname&status=active&sort=name";
    render(<FilterSortPage config={goals} />);
    expect(screen.getByRole("radio", { name: "Active" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const u = go();
    expect(u.pathname).toBe("/goals");
    expect(u.searchParams.get("status")).toBeNull();
    expect(u.searchParams.get("sort")).toBeNull();
    expect(u.searchParams.get("range")).toBe("this_year");
  });

  it("never navigates off-site", async () => {
    for (const bad of ["https%3A%2F%2Fevil.test%2Fx", "%2F%2Fevil.test", "%2F%5Cevil.test"]) {
      push.mockClear();
      query = `returnTo=${bad}`;
      render(<FilterSortPage config={goals} />);
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(push).toHaveBeenCalled());
      expect(String(push.mock.calls[0][0]).startsWith("/goals")).toBe(true);
      cleanup();
    }
  });
});
