/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));
const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "", size: "wide" as "compact" | "regular" | "wide" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  usePathname: () => "/goals",
}));
vi.mock("@/components/adaptive/size-class-context", () => ({ useAppSizeClass: () => H.size }));

import { ListDetailLayout, ListDetailNewButton } from "@/components/mobile/list-detail-layout";
import { PANE_CLASS, SPLIT_GRID_CLASS, parseSel, withSel } from "@/lib/list-detail/selection";

beforeEach(() => {
  H.push.mockReset();
  H.replace.mockReset();
  H.search = "";
  H.size = "wide";
});
afterEach(cleanup);

const renderLayout = () =>
  render(
    <ListDetailLayout
      entity="goal"
      newLabel="Add Goal"
      list={<div data-testid="the-list">rows</div>}
      pane={(api) => (
        <div data-testid="the-form" data-id={api.selectedId ?? ""} data-new={String(api.isNew)}>
          <button onClick={() => api.afterSaved()}>saved</button>
          <button onClick={api.afterDeleted}>deleted</button>
        </div>
      )}
    />,
  );

describe("parseSel / withSel", () => {
  it("parses none, new, ids and rejects junk", () => {
    expect(parseSel(null)).toEqual({ kind: "none" });
    expect(parseSel("")).toEqual({ kind: "none" });
    expect(parseSel("new")).toEqual({ kind: "new" });
    expect(parseSel("42")).toEqual({ kind: "item", id: "42" });
    expect(parseSel("a1b2-c_3")).toEqual({ kind: "item", id: "a1b2-c_3" });
    expect(parseSel("../etc")).toEqual({ kind: "none" });
    expect(parseSel("x".repeat(65))).toEqual({ kind: "none" });
  });
  it("sets, replaces and removes sel while keeping other params", () => {
    expect(withSel("", 5)).toBe("?sel=5");
    expect(withSel("month=2026-10", "new")).toBe("?month=2026-10&sel=new");
    expect(withSel("sel=3&month=2026-10", 9)).toBe("?sel=9&month=2026-10");
    expect(withSel("sel=3", null)).toBe("");
    expect(withSel(new URLSearchParams("a=1&sel=3"), null)).toBe("?a=1");
  });
});

describe("pane geometry", () => {
  it("grid is list 2fr | pane 1fr", () => {
    expect(SPLIT_GRID_CLASS).toContain("grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(SPLIT_GRID_CLASS).toContain("items-start");
  });
  it("the pane sticks below the top bar: header height + safe area + 1rem, and scrolls inside", () => {
    expect(PANE_CLASS).toContain("sticky");
    expect(PANE_CLASS).toContain("top-[calc(var(--phone-header-h,3.75rem)+var(--sat,0px)+1rem)]");
    expect(PANE_CLASS).toContain("max-h-[calc(100dvh-var(--phone-header-h,3.75rem)-var(--sat,0px)-2rem)]");
    expect(PANE_CLASS).toContain("overflow-y-auto");
  });
});

describe("ListDetailLayout", () => {
  it("regular+: renders the grid, the list and the pane with the geometry classes", () => {
    H.size = "regular";
    renderLayout();
    const pane = screen.getByTestId("list-detail-pane");
    expect(pane.className).toContain("sticky");
    expect(pane.className).toContain("top-[calc(var(--phone-header-h,3.75rem)+var(--sat,0px)+1rem)]");
    expect(pane.closest("[data-slot=list-detail]")!.className).toContain("grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(screen.getByTestId("the-list")).toBeTruthy();
  });

  it("shows the prompt card with a New button when nothing is selected, and New sets ?sel=new", () => {
    renderLayout();
    expect(screen.getByTestId("list-detail-empty").textContent).toContain("Select an item to edit, or create a new one");
    expect(screen.queryByTestId("the-form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add Goal/ }));
    expect(H.push).toHaveBeenCalledWith("/goals?sel=new", { scroll: false });
  });

  it("?sel=<id> renders the form for that id; ?sel=new renders create", () => {
    H.search = "sel=7";
    renderLayout();
    expect(screen.getByTestId("the-form").getAttribute("data-id")).toBe("7");
    cleanup();
    H.search = "sel=new";
    renderLayout();
    expect(screen.getByTestId("the-form").getAttribute("data-new")).toBe("true");
  });

  it("afterDeleted clears the selection (history replaced)", () => {
    H.search = "month=2026-10&sel=7";
    renderLayout();
    fireEvent.click(screen.getByText("deleted"));
    expect(H.replace).toHaveBeenCalledWith("/goals?month=2026-10", { scroll: false });
  });

  it("afterSaved on create closes the pane; on edit it keeps the selection and remounts the form", () => {
    H.search = "sel=new";
    renderLayout();
    fireEvent.click(screen.getByText("saved"));
    expect(H.replace).toHaveBeenCalledWith("/goals", { scroll: false });
    cleanup();
    H.replace.mockReset();
    H.search = "sel=7";
    renderLayout();
    const before = screen.getByTestId("the-form");
    fireEvent.click(screen.getByText("saved"));
    expect(H.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("the-form")).not.toBe(before);
  });

  it("phones (compact): no pane, only the list, ?sel ignored", () => {
    H.size = "compact";
    H.search = "sel=7";
    renderLayout();
    expect(screen.queryByTestId("list-detail-pane")).toBeNull();
    expect(screen.queryByTestId("the-form")).toBeNull();
    expect(screen.getByTestId("the-list")).toBeTruthy();
  });
});

describe("ListDetailNewButton", () => {
  it("regular+: sets ?sel=new instead of navigating", () => {
    render(<ListDetailNewButton href="/goals/new" label="Add Goal" />);
    const ev = fireEvent.click(screen.getByRole("link", { name: "Add Goal" }));
    expect(ev).toBe(false); // default prevented
    expect(H.push).toHaveBeenCalledWith("/goals?sel=new", { scroll: false });
  });
  it("phones: a plain link to the create route", () => {
    H.size = "compact";
    render(<ListDetailNewButton href="/goals/new" label="Add Goal" />);
    const a = screen.getByRole("link", { name: "Add Goal" });
    expect(a.getAttribute("href")).toBe("/goals/new");
    expect(fireEvent.click(a)).toBe(true);
    expect(H.push).not.toHaveBeenCalled();
  });
});

describe("ListRow selected", () => {
  it("marks the open row (style + aria-current + data-selected) and leaves others alone", async () => {
    const { ListRow } = await import("@/components/mobile/list-row");
    render(
      <div>
        <ListRow title="A" onPress={() => {}} selected />
        <ListRow title="B" onPress={() => {}} />
      </div>,
    );
    const [a, b] = screen.getAllByRole("button");
    expect(a.getAttribute("data-selected")).toBe("true");
    expect(a.getAttribute("aria-current")).toBe("true");
    expect(a.className).toContain("bg-muted");
    expect(b.getAttribute("data-selected")).toBeNull();
  });
});
