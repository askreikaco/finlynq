/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CategorySelector, type Category } from "@/app/(app)/transactions/new/_components/category-selector";
import { AccountSelector, type Account } from "@/app/(app)/transactions/new/_components/account-selector";

afterEach(() => cleanup());

const categories: Category[] = [
  { id: "1", name: "Groceries", group: "Food" },
  { id: "2", name: "Dining Out", group: "Food" },
  { id: "3", name: "Salary", group: "Income" },
];

const accounts: Account[] = [
  { id: "10", name: "Cash VND", type: "A", group: "Cash", currency: "VND" },
  { id: "11", name: "TCB", type: "A", group: "Checking", currency: "VND" },
  { id: "12", name: "Old Card", type: "L", group: "Credit Card", currency: "VND", archived: true },
  { id: "13", name: "Visa", type: "L", group: "Credit Card", currency: "USD" },
  { id: "14", name: "Loose", type: "A", group: null, currency: "VND" },
];

function sheetContent(): HTMLElement {
  const el = document.querySelector('[data-slot="sheet-content"]');
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

/** Group accordion header: accessible name is "<group><count>" (inline spans, so spacing varies). */
function header(name: string, count: number): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${name}\\s*${count}$`) });
}

/** Row whose accessible name starts with the label (rows may add a secondary line). */
function row(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

function rowOrNull(label: string): HTMLElement | null {
  return screen.queryByRole("button", { name: new RegExp(`^${label}`) });
}

function recentRows(): string[] {
  const section = screen.getByRole("heading", { name: "Recent" }).parentElement!;
  return Array.from(section.querySelectorAll("button")).map((b) => b.textContent ?? "");
}

describe("CategorySelector accordion", () => {
  it("renders Recent first, as rows, in recent order", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={() => {}}
        recentIds={["3", "2"]}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe("Recent");
    expect(recentRows()).toEqual(["SalaryIncome", "Dining OutFood"]);
  });

  it("caps Recent at five rows", () => {
    const many: Category[] = Array.from({ length: 7 }, (_, i) => ({
      id: String(i + 1),
      name: `Cat ${i + 1}`,
      group: "G",
    }));
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={many}
        onSelect={() => {}}
        recentIds={["1", "2", "3", "4", "5", "6", "7"]}
      />,
    );
    expect(recentRows()).toHaveLength(5);
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

  it("starts every group collapsed when nothing is selected", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(header("Food", 2).getAttribute("aria-expanded")).toBe("false");
    expect(header("Income", 1).getAttribute("aria-expanded")).toBe("false");
    expect(rowOrNull("Groceries")).toBeNull();
    expect(rowOrNull("Salary")).toBeNull();
  });

  it("auto-expands only the group that holds the selected category", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={() => {}}
        selectedCategoryId="2"
      />,
    );
    expect(header("Food", 2).getAttribute("aria-expanded")).toBe("true");
    expect(header("Income", 1).getAttribute("aria-expanded")).toBe("false");
    expect(row("Dining Out")).toBeTruthy();
    expect(row("Groceries")).toBeTruthy();
    expect(rowOrNull("Salary")).toBeNull();
  });

  it("header toggles aria-expanded and rows, and several groups can be open", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    fireEvent.click(header("Income", 1));
    expect(header("Income", 1).getAttribute("aria-expanded")).toBe("true");
    expect(row("Salary")).toBeTruthy();

    fireEvent.click(header("Food", 2));
    expect(header("Food", 2).getAttribute("aria-expanded")).toBe("true");
    expect(header("Income", 1).getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(header("Food", 2));
    expect(header("Food", 2).getAttribute("aria-expanded")).toBe("false");
    expect(rowOrNull("Groceries")).toBeNull();
    expect(row("Salary")).toBeTruthy();
  });

  it("aria-controls points at a region labelled by its header", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    const btn = header("Income", 1);
    fireEvent.click(btn);
    const region = document.getElementById(btn.getAttribute("aria-controls")!);
    expect(region).not.toBeNull();
    expect(region!.getAttribute("role")).toBe("region");
    expect(region!.getAttribute("aria-labelledby")).toBe(btn.id);
  });

  it("selecting a row fires onSelect with the id and closes the sheet", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CategorySelector
        open
        onOpenChange={onOpenChange}
        categories={categories}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(header("Income", 1));
    fireEvent.click(row("Salary"));
    expect(onSelect).toHaveBeenCalledWith("3");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("selecting a Recent row fires onSelect with the id", () => {
    const onSelect = vi.fn();
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={onSelect}
        recentIds={["3"]}
      />,
    );
    fireEvent.click(row("Salary"));
    expect(onSelect).toHaveBeenCalledWith("3");
  });

  it("marks the selected row with aria-current and a checkmark", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={() => {}}
        selectedCategoryId="2"
      />,
    );
    const selected = row("Dining Out");
    expect(selected.getAttribute("aria-current")).toBe("true");
    expect(selected.querySelector("svg")).not.toBeNull();
    expect(row("Groceries").getAttribute("aria-current")).toBeNull();
    expect(row("Groceries").querySelector("svg")).toBeNull();
  });

  it("search flattens matches with the group as secondary text and hides groups and Recent", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={() => {}}
        recentIds={["3"]}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search category..."), { target: { value: "groc" } });
    expect(row("Groceries").textContent).toContain("Food");
    expect(rowOrNull("Salary")).toBeNull();
    expect(screen.queryByText("Recent")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Food\s*\d+$/ })).toBeNull();
  });

  it("search also matches the group name and expands nothing it does not need to", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search category..."), { target: { value: "income" } });
    expect(row("Salary")).toBeTruthy();
    expect(rowOrNull("Groceries")).toBeNull();
  });

  it("search with no match shows the empty message", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search category..."), { target: { value: "zzz" } });
    expect(screen.getByText("No categories found")).toBeTruthy();
  });

  it("is a single-column list: no tile grid, rows are at least 44px", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={categories}
        onSelect={() => {}}
        selectedCategoryId="1"
      />,
    );
    expect(sheetContent().querySelector(".grid-cols-2")).toBeNull();
    expect(sheetContent().querySelector(".grid")).toBeNull();
    expect(header("Food", 2).className).toContain("min-h-11");
    expect(row("Groceries").className).toContain("min-h-11");
  });

  it("sheet keeps pt-0 and is capped at 70dvh, keyboard-aware", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    const cls = sheetContent().className;
    expect(cls).toContain("pt-0");
    expect(cls).toContain("max-h-[min(70dvh,calc(100dvh-var(--kb-inset,0px)))]");
  });

  it("search input is text-base (16px, no iOS zoom)", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(screen.getByPlaceholderText("Search category...").className).toContain("text-base");
  });

  it("collapsed state resets on the next open", () => {
    const { rerender } = render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    fireEvent.click(header("Income", 1));
    expect(row("Salary")).toBeTruthy();
    rerender(
      <CategorySelector open={false} onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    rerender(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(header("Income", 1).getAttribute("aria-expanded")).toBe("false");
    expect(rowOrNull("Salary")).toBeNull();
  });

  it("static: the selector source has no tile grid and no viewport-detection hooks", () => {
    const dir = join(process.cwd(), "src/app/(app)/transactions/new/_components");
    const src = ["category-selector.tsx", "grouped-picker.tsx"]
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    expect(src).not.toMatch(/grid-cols-\d/);
    expect(src).not.toMatch(/isMobile|window\.innerWidth|md:hidden|hidden\s+md:/);
    expect(src).toMatch(/motion-safe:/);
  });
});

describe("AccountSelector accordion", () => {
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
    expect(screen.getAllByRole("heading", { level: 3 })[0].textContent).toBe("Recent");
    expect(recentRows()).toEqual(["TCBChecking · VND"]);
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

  it("groups by account group name (not type), alphabetical with Other last, collapsed, archived hidden", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    const sheet = sheetContent();
    const headers = Array.from(sheet.querySelectorAll('button[aria-expanded]')).map((b) => b.textContent);
    expect(headers).toEqual(["Cash1", "Checking1", "Credit Card1", "Other1"]);
    expect(header("Cash", 1).getAttribute("aria-expanded")).toBe("false");
    expect(header("Checking", 1).getAttribute("aria-expanded")).toBe("false");
    expect(header("Credit Card", 1).getAttribute("aria-expanded")).toBe("false");
    expect(header("Other", 1).getAttribute("aria-expanded")).toBe("false");
    expect(rowOrNull("TCB")).toBeNull();
    expect(screen.queryByText("Old Card")).toBeNull();
  });

  it("accounts with no group sit under Other", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    fireEvent.click(header("Other", 1));
    expect(row("Loose")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^A\s*\d+$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^L\s*\d+$/ })).toBeNull();
  });

  it("auto-expands the group holding the selected account", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        selectedAccountId="11"
      />,
    );
    expect(header("Checking", 1).getAttribute("aria-expanded")).toBe("true");
    expect(row("TCB").getAttribute("aria-current")).toBe("true");
    expect(header("Cash", 1).getAttribute("aria-expanded")).toBe("false");
  });

  it("selecting a row fires onSelect with the id", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AccountSelector open onOpenChange={onOpenChange} accounts={accounts} onSelect={onSelect} />,
    );
    fireEvent.click(header("Checking", 1));
    fireEvent.click(row("TCB"));
    expect(onSelect).toHaveBeenCalledWith("11");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("search flattens matches with group and currency as secondary text", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search account..."), { target: { value: "vnd" } });
    expect(row("Cash VND").textContent).toContain("Cash · VND");
    expect(row("TCB").textContent).toContain("Checking · VND");
    expect(screen.queryByRole("button", { name: /^Checking\s*\d+$/ })).toBeNull();
  });

  it("search matches the group name", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search account..."), { target: { value: "credit" } });
    expect(row("Visa").textContent).toContain("Credit Card · USD");
    expect(rowOrNull("TCB")).toBeNull();
    expect(rowOrNull("Loose")).toBeNull();
  });

  it("sheet keeps pt-0 and is capped at 70dvh; search is text-base", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    expect(sheetContent().className).toContain("pt-0");
    expect(sheetContent().className).toContain("max-h-[min(70dvh,calc(100dvh-var(--kb-inset,0px)))]");
    expect(sheetContent().querySelector(".grid-cols-1, .grid-cols-2")).toBeNull();
    expect(screen.getByPlaceholderText("Search account...").className).toContain("text-base");
  });
});

describe("AccountSelector saved group order", () => {
  function sectionNames(): string[] {
    return Array.from(sheetContent().querySelectorAll('button[aria-expanded]')).map((b) => b.textContent ?? "");
  }

  it("orders group sections by the saved order (asset list, then liability list)", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        groupOrder={{ A: ["Checking", "Cash"], L: ["Credit Card"] }}
      />,
    );
    expect(sectionNames()).toEqual(["Checking1", "Cash1", "Credit Card1", "Other1"]);
  });

  it("matches saved names case-insensitively", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        groupOrder={{ A: ["checking"], L: [] }}
      />,
    );
    expect(sectionNames()).toEqual(["Checking1", "Cash1", "Credit Card1", "Other1"]);
  });

  it("groups missing from the saved order fall back to alphabetical after saved ones", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        groupOrder={{ A: ["Checking"], L: [] }}
      />,
    );
    expect(sectionNames()).toEqual(["Checking1", "Cash1", "Credit Card1", "Other1"]);
  });

  it("Other stays last even when saved first", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        groupOrder={{ A: ["Other", "Checking"], L: [] }}
      />,
    );
    expect(sectionNames()).toEqual(["Checking1", "Cash1", "Credit Card1", "Other1"]);
  });

  it("an empty saved order is the alphabetical default", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        groupOrder={{ A: [], L: [] }}
      />,
    );
    expect(sectionNames()).toEqual(["Cash1", "Checking1", "Credit Card1", "Other1"]);
  });

  it("a saved order that puts Credit Card first moves its section to the top", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        groupOrder={{ A: [], L: ["Credit Card"] }}
      />,
    );
    expect(sectionNames()).toEqual(["Credit Card1", "Cash1", "Checking1", "Other1"]);
  });
});
