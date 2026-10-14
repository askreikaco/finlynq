/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHeader, PHONE_PRIMARY_CLASS } from "@/components/mobile/page-header";
import { usePageCustomize } from "@/components/mobile/page-customize";

vi.mock("next/navigation", () => ({ usePathname: () => "/x", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("@/components/adaptive/use-back-target", () => ({ useBackTarget: () => null }));

afterEach(cleanup);

const Add = <button className={PHONE_PRIMARY_CLASS} aria-label="Add">Add</button>;
const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const capsuleButtons = () => {
  const cap = document.querySelector('[data-slot="header-capsule"]') as HTMLElement;
  return cap ? [...cap.querySelectorAll("button, a")].map((e) => e.getAttribute("aria-label")) : [];
};

describe("PageHeader action order: More | bulk-edit-or-Filter | PRIMARY", () => {
  it("with a filter and no bulk edit: [More, Filter] then the primary rightmost", () => {
    render(<PageHeader title="Goals" actions={Add} overflow={[{ label: "Export", onSelect: () => {} }]} filter={{ href: "/filter/goals" }} />);
    const more = screen.getByRole("button", { name: "More actions" });
    const filter = screen.getByRole("link", { name: "Filter" });
    const add = screen.getByRole("button", { name: "Add" });
    expect(before(more, filter)).toBe(true);
    expect(before(filter, add)).toBe(true);
    expect(filter.textContent).toBe("");
    expect(filter.getAttribute("href")).toBe("/filter/goals");
    const cap = document.querySelector('[data-slot="header-capsule"]') as HTMLElement;
    expect(cap.contains(add)).toBe(false);
    expect(cap.nextElementSibling).toBe(add);
  });

  it("with bulk edit: [More, bulk-edit] and Filter moves INSIDE More", async () => {
    const onToggle = vi.fn();
    render(<PageHeader title="Tx" actions={Add} overflow={[{ label: "Transfer", onSelect: () => {} }]} filter={{ href: "/transactions/search" }} bulkEdit={{ onToggle }} />);
    expect(screen.queryByRole("link", { name: "Filter" })).toBeNull();
    const bulk = screen.getByRole("button", { name: "Edit list" });
    const more = screen.getByRole("button", { name: "More actions" });
    expect(before(more, bulk)).toBe(true);
    expect(before(bulk, screen.getByRole("button", { name: "Add" }))).toBe(true);
    await userEvent.click(bulk);
    expect(onToggle).toHaveBeenCalled();
    await userEvent.click(more);
    const items = (await screen.findAllByRole("menuitem")).map((i) => i.textContent);
    expect(items).toEqual(["Filter", "Transfer"]);
    expect(screen.getByRole("menuitem", { name: "Filter" }).getAttribute("href")).toBe("/transactions/search");
  });

  it("never shows more than 2 secondary buttons, whatever the page declares", () => {
    function Page() {
      usePageCustomize({ onOpen: () => {} });
      return <PageHeader title="All" actions={Add} overflow={[{ label: "x", onSelect: () => {} }]} filter={{ href: "/f" }} bulkEdit={{ onToggle: () => {} }} />;
    }
    render(<Page />);
    expect(capsuleButtons()).toEqual(["More actions", "Edit list"]);
  });

  it("filter only: just the Filter button (no More)", () => {
    render(<PageHeader title="F" filter={{ href: "/f" }} />);
    expect(capsuleButtons()).toEqual(["Filter"]);
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("customize is only ever a More item", async () => {
    function Page() {
      usePageCustomize({ onOpen: () => {} });
      return <PageHeader title="D" actions={Add} filter={{ href: "/f" }} />;
    }
    render(<Page />);
    expect(capsuleButtons()).toEqual(["More actions", "Filter"]);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect((await screen.findAllByRole("menuitem")).map((i) => i.textContent)).toEqual(["Customize cards"]);
  });

  it("the primary stays rightmost and standalone (not in the capsule)", () => {
    render(<PageHeader title="P" actions={Add} filter={{ href: "/f" }} />);
    const cap = document.querySelector('[data-slot="header-capsule"]') as HTMLElement;
    expect(cap.nextElementSibling).toBe(screen.getByRole("button", { name: "Add" }));
  });
});
