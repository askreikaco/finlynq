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

import * as fs from "node:fs";
import { ListDetailLayout, ListDetailNewButton, usePaneTitle } from "@/components/mobile/list-detail-layout";
import { PANE_CLASS, SPLIT_GRID_CLASS, parseMode, parseSel, withMode, withSel } from "@/lib/list-detail/selection";

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
      pane={(api) => (
        <div data-testid="the-form" data-id={api.selectedId ?? ""} data-new={String(api.isNew)}>
          <button onClick={() => api.afterSaved()}>saved</button>
          <button onClick={api.afterDeleted}>deleted</button>
        </div>
      )}
    >
      <div data-testid="the-toolbar">toolbar</div>
      <div data-testid="the-cards">cards</div>
      <section data-testid="the-list">rows</section>
    </ListDetailLayout>,
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
  it("grid is list 3fr | pane 1fr", () => {
    expect(SPLIT_GRID_CLASS).toContain("grid-cols-[minmax(0,3fr)_minmax(0,1fr)]");
    expect(SPLIT_GRID_CLASS).toContain("items-start");
  });
  it("the pane sticks below the top bar: header height + safe area + 1rem, is viewport-tall minus that offset, and scrolls inside", () => {
    expect(PANE_CLASS).toContain("sticky");
    expect(PANE_CLASS).toContain("top-[calc(var(--phone-header-h,3.75rem)+var(--sat,0px)+1rem)]");
    expect(PANE_CLASS).toContain(" h-[calc(100dvh-var(--phone-header-h,3.75rem)-var(--sat,0px)-2rem)]");
    expect(PANE_CLASS).toContain("overflow-y-auto");
  });
});

describe("ListDetailLayout", () => {
  it("wide: renders the grid, the list and the pane with the geometry classes", () => {
    H.size = "wide";
    renderLayout();
    const pane = screen.getByTestId("list-detail-pane");
    expect(pane.className).toContain("sticky");
    expect(pane.className).toContain("top-[calc(var(--phone-header-h,3.75rem)+var(--sat,0px)+1rem)]");
    expect(pane.closest("[data-slot=list-detail]")!.className).toContain("grid-cols-[minmax(0,3fr)_minmax(0,1fr)]");
    expect(screen.getByTestId("the-list")).toBeTruthy();
  });

  it("the pane is a sibling of the WHOLE page body (toolbar, cards, list), not of the list section", () => {
    renderLayout();
    const grid = document.querySelector("[data-slot=list-detail]")!;
    const pane = screen.getByTestId("list-detail-pane");
    const main = grid.querySelector("[data-slot=list-detail-main]")!;
    expect(pane.parentElement).toBe(grid);
    expect(main.parentElement).toBe(grid);
    expect(grid.children).toHaveLength(2);
    expect(grid.firstElementChild).toBe(main);
    for (const id of ["the-toolbar", "the-cards", "the-list"]) expect(main.contains(screen.getByTestId(id))).toBe(true);
    // the list section is NOT the pane's sibling: it is nested in the page body column
    expect(screen.getByTestId("the-list").parentElement).toBe(main);
    expect(screen.getByTestId("the-list").nextElementSibling).toBeNull();
    expect(pane.contains(screen.getByTestId("the-toolbar"))).toBe(false);
    // full page height column: h-[...] (not just max-h) + sticky + internal scroll
    expect(pane.className).toMatch(/(^| )h-\[calc\(100dvh-/);
    expect(pane.className).toContain("overflow-y-auto");
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

  it("below wide (phones, portrait tablets): no pane, only the list, ?sel ignored", () => {
    for (const size of ["compact", "regular"] as const) {
      cleanup();
      H.size = size;
      H.search = "sel=7";
      renderLayout();
      expect(screen.queryByTestId("list-detail-pane")).toBeNull();
      expect(screen.queryByTestId("the-form")).toBeNull();
      expect(screen.getByTestId("the-list")).toBeTruthy();
      // phone / regular unchanged: the page body renders bare (no grid, no main column wrapper)
      expect(document.querySelector("[data-slot=list-detail]")).toBeNull();
      expect(document.querySelector("[data-slot=list-detail-main]")).toBeNull();
      expect(screen.getByTestId("the-toolbar")).toBeTruthy();
    }
  });

  it("enabled=false renders the list alone even at wide", () => {
    render(<ListDetailLayout enabled={false} newLabel="x" pane={() => <div />}><div data-testid="the-list" /></ListDetailLayout>);
    expect(screen.queryByTestId("list-detail-pane")).toBeNull();
  });
});

describe("ListDetailNewButton", () => {
  it("wide: sets ?sel=new instead of navigating", () => {
    render(<ListDetailNewButton href="/goals/new" label="Add Goal" />);
    const ev = fireEvent.click(screen.getByRole("link", { name: "Add Goal" }));
    expect(ev).toBe(false); // default prevented
    expect(H.push).toHaveBeenCalledWith("/goals?sel=new", { scroll: false });
  });
  it("below wide: a plain link to the create route", () => {
    H.size = "regular";
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

describe("parseMode / withMode (?mode=edit)", () => {
  it("parses edit only for the exact value; everything else is the detail view", () => {
    expect(parseMode("edit")).toBe("edit");
    expect(parseMode(null)).toBe("view");
    expect(parseMode("")).toBe("view");
    expect(parseMode("EDIT")).toBe("view");
    expect(parseMode("view")).toBe("view");
  });
  it("sets and removes mode while keeping other params; withSel always resets it", () => {
    expect(withMode("sel=7", "edit")).toBe("?sel=7&mode=edit");
    expect(withMode("sel=7&mode=edit", "view")).toBe("?sel=7");
    expect(withMode("month=2026-10&sel=7&mode=edit", "view")).toBe("?month=2026-10&sel=7");
    expect(withMode(new URLSearchParams("sel=7"), "edit")).toBe("?sel=7&mode=edit");
    expect(withMode("", "view")).toBe("");
    // selecting another row (or clearing) leaves edit mode
    expect(withSel("sel=7&mode=edit", 9)).toBe("?sel=9");
    expect(withSel("sel=7&mode=edit&month=1", null)).toBe("?month=1");
  });
});

const NamedDetail = () => {
  usePaneTitle("Checking");
  return <span data-testid="named">named</span>;
};

describe("ListDetailLayout detail-first pane", () => {
  const renderDetailLayout = (extra: Partial<React.ComponentProps<typeof ListDetailLayout>> = {}) =>
    render(
      <ListDetailLayout
        entity="account"
        newLabel="Add Account"
        detailTitle="Account"
        detailHref={(id) => `/accounts/${id}`}
        renderDetail={(id, api) => (
          <div data-testid="the-detail" data-id={id}>
            <NamedDetail />
            <button onClick={api.edit}>inner-edit</button>
          </div>
        )}
        renderForm={(api) => (
          <div data-testid="the-form" data-id={api.selectedId ?? ""} data-new={String(api.isNew)}>
            <button onClick={() => api.afterSaved(api.selectedId ?? undefined)}>saved</button>
            <button onClick={api.cancel}>cancel</button>
          </div>
        )}
        {...extra}
      >
        <div data-testid="the-list">rows</div>
      </ListDetailLayout>,
    );

  it("?sel=<id> shows the DETAIL (not the form), with the pane header: title, Open page link, Edit, Close", () => {
    H.search = "sel=7";
    renderDetailLayout();
    expect(screen.getByTestId("the-detail").getAttribute("data-id")).toBe("7");
    expect(screen.queryByTestId("the-form")).toBeNull();
    expect(screen.getByTestId("list-detail-pane").getAttribute("data-pane-view")).toBe("detail");
    const header = document.querySelector("[data-slot=list-detail-pane-header]")!;
    expect(header.querySelector("h2")!.textContent).toBe("Checking"); // usePaneTitle
    expect(screen.getByRole("link", { name: /Open page/ }).getAttribute("href")).toBe("/accounts/7");
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("the header title falls back to detailTitle until the detail sets one", () => {
    H.search = "sel=7";
    render(
      <ListDetailLayout newLabel="x" detailTitle="Account" renderDetail={() => <div data-testid="the-detail" />} renderForm={() => <div />}>
        <div />
      </ListDetailLayout>,
    );
    expect(document.querySelector("[data-slot=list-detail-pane-header] h2")!.textContent).toBe("Account");
  });

  it("Edit sets ?mode=edit (pushed); Close clears the selection", () => {
    H.search = "month=2026-10&sel=7";
    renderDetailLayout();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(H.push).toHaveBeenCalledWith("/goals?month=2026-10&sel=7&mode=edit", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(H.replace).toHaveBeenCalledWith("/goals?month=2026-10", { scroll: false });
  });

  it("?sel=<id>&mode=edit shows the form (no detail header)", () => {
    H.search = "sel=7&mode=edit";
    renderDetailLayout();
    expect(screen.getByTestId("the-form").getAttribute("data-id")).toBe("7");
    expect(screen.queryByTestId("the-detail")).toBeNull();
    expect(document.querySelector("[data-slot=list-detail-pane-header]")).toBeNull();
    expect(screen.getByTestId("list-detail-pane").getAttribute("data-pane-view")).toBe("form");
  });

  it("?sel=new shows the create form even with renderDetail; mode is ignored", () => {
    H.search = "sel=new&mode=edit";
    renderDetailLayout();
    expect(screen.getByTestId("the-form").getAttribute("data-new")).toBe("true");
    expect(screen.queryByTestId("the-detail")).toBeNull();
  });

  it("edit Save and Cancel go back to the detail view (mode removed, history replaced)", () => {
    H.search = "sel=7&mode=edit";
    renderDetailLayout();
    fireEvent.click(screen.getByText("saved"));
    expect(H.replace).toHaveBeenLastCalledWith("/goals?sel=7", { scroll: false });
    H.replace.mockReset();
    fireEvent.click(screen.getByText("cancel"));
    expect(H.replace).toHaveBeenLastCalledWith("/goals?sel=7", { scroll: false });
  });

  it("create Save without an id and create Cancel close the pane", () => {
    H.search = "sel=new";
    renderDetailLayout();
    fireEvent.click(screen.getByText("saved"));
    expect(H.replace).toHaveBeenLastCalledWith("/goals", { scroll: false });
    H.replace.mockReset();
    fireEvent.click(screen.getByText("cancel"));
    expect(H.replace).toHaveBeenLastCalledWith("/goals", { scroll: false });
  });

  it("without renderDetail (no detail route): ?sel=<id> shows the form as before; cancel closes the pane", () => {
    H.search = "sel=7";
    renderDetailLayout({ renderDetail: undefined });
    expect(screen.getByTestId("the-form").getAttribute("data-id")).toBe("7");
    expect(document.querySelector("[data-slot=list-detail-pane-header]")).toBeNull();
    fireEvent.click(screen.getByText("cancel"));
    expect(H.replace).toHaveBeenCalledWith("/goals", { scroll: false });
  });

  it("the older `pane` prop still renders the form; renderForm wins when both are given", () => {
    H.search = "sel=7";
    render(
      <ListDetailLayout newLabel="x" pane={() => <div data-testid="old-pane" />}>
        <div />
      </ListDetailLayout>,
    );
    expect(screen.getByTestId("old-pane")).toBeTruthy();
    cleanup();
    render(
      <ListDetailLayout newLabel="x" pane={() => <div data-testid="old-pane" />} renderForm={() => <div data-testid="new-form" />}>
        <div />
      </ListDetailLayout>,
    );
    expect(screen.getByTestId("new-form")).toBeTruthy();
    expect(screen.queryByTestId("old-pane")).toBeNull();
  });

  it("below wide: no pane and no detail, ?sel / ?mode ignored", () => {
    H.size = "regular";
    H.search = "sel=7&mode=edit";
    renderDetailLayout();
    expect(screen.queryByTestId("list-detail-pane")).toBeNull();
    expect(screen.queryByTestId("the-detail")).toBeNull();
    expect(screen.getByTestId("the-list")).toBeTruthy();
  });

  it("usePaneTitle outside a pane is a no-op", () => {
    render(<NamedDetail />);
    expect(screen.getByTestId("named")).toBeTruthy();
  });
});

describe("accounts wiring: one detail component for the route and the pane", () => {
  it("/accounts/[id] and the /accounts pane render AccountDetail; the pane is detail-first with Edit to the form", () => {
    const read = (p: string) => fs.readFileSync(p, "utf8");
    const route = read("src/app/(app)/accounts/[id]/page.tsx");
    expect(route).toMatch(/<AccountDetail\b/);
    expect(route).not.toContain("MetricCard");
    const list = read("src/app/(app)/accounts/page.tsx");
    expect(list).toMatch(/renderDetail=\{/);
    expect(list).toMatch(/<AccountDetail\b[\s\S]*embedded=\{\{[^}]*onEdit: api\.edit/);
    expect(list).toMatch(/onCancel=\{api\.cancel\}/);
    expect(read("src/app/(app)/accounts/_components/account-detail.tsx")).toMatch(/export function AccountDetail\b/);
  });
});
