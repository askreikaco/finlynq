/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CategorySelector, type Category } from "@/app/(app)/transactions/new/_components/category-selector";
import { AccountSelector, type Account } from "@/app/(app)/transactions/new/_components/account-selector";
import { GroupedPickerPanel } from "@/app/(app)/transactions/new/_components/grouped-picker";
import { Sheet, SheetContent } from "@/components/ui/sheet";

vi.mock("next/navigation", () => ({
  usePathname: () => "/transactions/new",
  useSearchParams: () => new URLSearchParams("draft=1"),
}));

afterEach(() => cleanup());

const RETURN_TO = encodeURIComponent("/transactions/new?draft=1");

const categories: Category[] = [{ id: "1", name: "Groceries", group: "Food" }];
const accounts: Account[] = [{ id: "10", name: "Cash VND", type: "A", group: "Cash", currency: "VND" }];

describe("picker settings button", () => {
  it("category picker: round 44px settings link to /categories with returnTo", () => {
    render(<CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />);
    const link = screen.getByRole("link", { name: "Manage categories" });
    expect(link.getAttribute("href")).toBe(`/categories?returnTo=${RETURN_TO}`);
    expect(link.getAttribute("title")).toBe("Manage categories");
    expect(link.className).toContain("size-11");
    expect(link.className).toContain("rounded-full");
    expect(link.className).toContain("glass-capsule");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("account picker: settings link to /accounts with returnTo", () => {
    render(<AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />);
    const link = screen.getByRole("link", { name: "Manage accounts" });
    expect(link.getAttribute("href")).toBe(`/accounts?returnTo=${RETURN_TO}`);
  });

  it("absent when the panel sets no settingsHref, and the default label is Settings", () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <GroupedPickerPanel
            title="Plain"
            placeholder="Search..."
            emptyText="None"
            entries={[]}
            onPick={() => {}}
          />
        </SheetContent>
      </Sheet>,
    );
    expect(document.querySelector('[data-slot="picker-settings"]')).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Plain")).toBeTruthy();
  });

  it("default label is Settings when only settingsHref is given", () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <GroupedPickerPanel
            title="Plain"
            placeholder="Search..."
            emptyText="None"
            entries={[]}
            onPick={() => {}}
            settingsHref="/x"
          />
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
      `/x?returnTo=${RETURN_TO}`,
    );
  });

  it("the close X still closes the sheet when the settings button is present", () => {
    const onOpenChange = vi.fn();
    render(<CategorySelector open onOpenChange={onOpenChange} categories={categories} onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange.mock.calls[0][0]).toBe(false);
  });
});
