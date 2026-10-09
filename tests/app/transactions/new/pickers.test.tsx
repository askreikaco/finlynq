/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CategorySelector, type Category } from "@/app/(app)/transactions/new/_components/category-selector";
import { AccountSelector, type Account } from "@/app/(app)/transactions/new/_components/account-selector";

afterEach(() => cleanup());

const categories: Category[] = [
  { id: "1", name: "Groceries", group: "Food" },
  { id: "2", name: "Dining Out", group: "Food" },
  { id: "3", name: "Salary", group: "Income" },
];

const accounts: Account[] = [
  { id: "10", name: "Cash VND", type: "Cash", currency: "VND" },
  { id: "11", name: "TCB", type: "Bank", currency: "VND" },
];

function sheetContent(): HTMLElement {
  const el = document.querySelector('[data-slot="sheet-content"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function headingsInOrder(): string[] {
  return screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
}

describe("CategorySelector recent section", () => {
  it("renders Recent first when recentIds match the list", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={() => {}}
        recentIds={["3", "2"]}
      />,
    );
    const headings = headingsInOrder();
    expect(headings[0]).toBe("Recent");
    expect(headings.slice(1)).toEqual(["Food", "Income"]);
    const recentChips = screen.getByText("Recent").parentElement!.querySelectorAll("button");
    expect(Array.from(recentChips).map((b) => b.textContent)).toEqual(["Salary", "Dining Out"]);
  });

  it("is absent when no recentIds match the list", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={() => {}}
        recentIds={["99"]}
      />,
    );
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("is absent when recentIds is not passed", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("sheet has pt-0 and max-h-[75dvh]", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    const cls = sheetContent().className;
    expect(cls).toContain("pt-0");
    expect(cls).toContain("max-h-[75dvh]");
  });

  it("search input is text-base", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(screen.getByPlaceholderText("Search category...").className).toContain("text-base");
  });

  it("selecting a row calls onSelect with the id", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CategorySelector
        open
        onOpenChange={onOpenChange}
        categories={categories}
        onSelect={onSelect}
        recentIds={["3"]}
      />,
    );
    // Two buttons are named "Salary": the Recent chip (first in DOM) and the grouped row.
    fireEvent.click(screen.getAllByRole("button", { name: "Salary" })[0]);
    expect(onSelect).toHaveBeenCalledWith("3");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("AccountSelector recent section", () => {
  it("renders Recent first when recentIds match the list", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        recentIds={["11"]}
      />,
    );
    expect(headingsInOrder()[0]).toBe("Recent");
  });

  it("is absent when no recentIds match", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        recentIds={["77"]}
      />,
    );
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("sheet has pt-0 and max-h-[75dvh] and search is text-base", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    expect(sheetContent().className).toContain("pt-0");
    expect(sheetContent().className).toContain("max-h-[75dvh]");
    expect(screen.getByPlaceholderText("Search account...").className).toContain("text-base");
  });

  it("selecting a row calls onSelect with the id", () => {
    const onSelect = vi.fn();
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /TCB/ }) as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith("11");
  });
});
