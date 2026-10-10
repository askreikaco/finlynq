/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CategorySelector, type Category } from "@/components/transactions/entry/category-selector";
import { AccountSelector, type Account } from "@/components/transactions/entry/account-selector";

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

/** Category group tile: accessible name is exactly the group name. */
function groupTile(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

/** Tile whose accessible name starts with the label (tiles add a secondary line). */
function row(label: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

function rowOrNull(label: string): HTMLElement | null {
  return screen.queryByRole("button", { name: new RegExp(`^${label}`) });
}

/** Section labels (uppercase h3s) in render order. */
function sectionLabels(): string[] {
  return screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
}

function recentRows(): string[] {
  const section = screen.getByRole("heading", { name: "Recent" }).parentElement!;
  return Array.from(section.querySelectorAll("button")).map((b) => b.textContent ?? "");
}

describe("CategorySelector tile grid", () => {
  it("renders Recent first, as tiles, in recent order", () => {
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
    expect(screen.getByRole("heading", { name: "Recent" }).parentElement!.querySelector(".grid-cols-3")).not.toBeNull();
  });

  it("caps Recent at five tiles", () => {
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

  it("starts every group closed when nothing is selected", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(groupTile("Food").getAttribute("aria-expanded")).toBe("false");
    expect(groupTile("Income").getAttribute("aria-expanded")).toBe("false");
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
    expect(groupTile("Food").getAttribute("aria-expanded")).toBe("true");
    expect(groupTile("Income").getAttribute("aria-expanded")).toBe("false");
    expect(row("Dining Out")).toBeTruthy();
    expect(row("Groceries")).toBeTruthy();
    expect(rowOrNull("Salary")).toBeNull();
  });

  it("only one group is open at a time (accordion)", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    fireEvent.click(groupTile("Income"));
    expect(groupTile("Income").getAttribute("aria-expanded")).toBe("true");
    expect(row("Salary")).toBeTruthy();

    fireEvent.click(groupTile("Food"));
    expect(groupTile("Food").getAttribute("aria-expanded")).toBe("true");
    expect(groupTile("Income").getAttribute("aria-expanded")).toBe("false");
    expect(rowOrNull("Salary")).toBeNull();
    expect(document.querySelectorAll('[role="region"]')).toHaveLength(1);

    fireEvent.click(groupTile("Food"));
    expect(groupTile("Food").getAttribute("aria-expanded")).toBe("false");
    expect(rowOrNull("Groceries")).toBeNull();
    expect(document.querySelectorAll('[role="region"]')).toHaveLength(0);
  });

  it("aria-controls points at the band region, which is labelled by its group tile", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    const btn = groupTile("Income");
    fireEvent.click(btn);
    const region = document.getElementById(btn.getAttribute("aria-controls")!);
    expect(region).not.toBeNull();
    expect(region!.getAttribute("role")).toBe("region");
    expect(region!.getAttribute("aria-labelledby")).toBe(btn.id);
  });

  it("selecting a leaf tile fires onSelect with the id and closes the sheet", () => {
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
    fireEvent.click(groupTile("Income"));
    fireEvent.click(row("Salary"));
    expect(onSelect).toHaveBeenCalledWith("3");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("selecting a Recent tile fires onSelect with the id", () => {
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

  it("marks the selected tile with aria-current and the accent classes", () => {
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
    expect(selected.className).toContain("border-primary");
    expect(selected.className).toContain("text-primary");
    expect(selected.className).toContain("bg-primary/10");
    expect(row("Groceries").getAttribute("aria-current")).toBeNull();
    expect(row("Groceries").className).not.toContain("border-primary");
  });

  it("group tiles are a 3-column grid of at least 56px tiles, with no 2-column grid", () => {
    render(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(groupTile("Food").parentElement!.className).toContain("grid-cols-3");
    expect(groupTile("Food").className).toContain("min-h-14");
    expect(sheetContent().querySelector(".grid-cols-2")).toBeNull();
  });

  it("search shows a flat tile grid with the group as secondary text, hiding groups and Recent", () => {
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
    expect(row("Groceries").parentElement!.className).toContain("grid-cols-3");
    expect(rowOrNull("Salary")).toBeNull();
    expect(screen.queryByText("Recent")).toBeNull();
    expect(screen.queryByRole("button", { name: "Food" })).toBeNull();
    expect(document.querySelector('[role="region"]')).toBeNull();
  });

  it("search also matches the group name and shows only the matching leaves", () => {
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

  it("a group with one category of the same name is a plain selectable tile: no chevron, no band", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    const plain: Category[] = [
      { id: "5", name: "Transport", group: "Transport" },
      { id: "6", name: "Food", group: "Food" },
    ];
    render(
      <CategorySelector
        open
        onOpenChange={onOpenChange}
        categories={plain}
        onSelect={onSelect}
      />,
    );
    const tile = screen.getByRole("button", { name: "Transport" });
    expect(tile.hasAttribute("aria-expanded")).toBe(false);
    expect(tile.querySelector("svg")).toBeNull();
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith("5");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(document.querySelector('[role="region"]')).toBeNull();
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
    fireEvent.click(groupTile("Income"));
    expect(row("Salary")).toBeTruthy();
    rerender(
      <CategorySelector open={false} onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    rerender(
      <CategorySelector open onOpenChange={() => {}} categories={categories} onSelect={() => {}} />,
    );
    expect(groupTile("Income").getAttribute("aria-expanded")).toBe("false");
    expect(rowOrNull("Salary")).toBeNull();
  });

  it("static: the picker source has the tile grid and no viewport-detection hooks", () => {
    const dir = join(process.cwd(), "src/components/transactions/entry");
    const src = ["category-selector.tsx", "grouped-picker.tsx"]
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    expect(src).toContain("grid grid-cols-3 gap-2");
    expect(src).not.toMatch(/grid-cols-2/);
    expect(src).not.toMatch(/isMobile|window\.innerWidth|md:hidden|hidden\s+md:/);
    expect(src).toMatch(/motion-safe:/);
    expect(readFileSync(join(dir, "category-selector.tsx"), "utf8")).toContain('layout="expand"');
    expect(readFileSync(join(dir, "account-selector.tsx"), "utf8")).toContain('layout="sections"');
  });
});

/** n groups, two leaves each: "G0" holds "G0 a" and "G0 b", and so on. */
function groupedCategories(n: number): Category[] {
  return Array.from({ length: n }, (_, i) => [
    { id: `g${i}a`, name: `G${i} a`, group: `G${i}` },
    { id: `g${i}b`, name: `G${i} b`, group: `G${i}` },
  ]).flat();
}

/** Name of the group tile the open band sits directly after; null when no band is open. */
function bandFollows(): string | null {
  const region = document.querySelector('[role="region"]');
  if (!region) return null;
  // The band is a direct child of the same 3-column grid as the group tiles.
  expect(region.parentElement!.className).toContain("grid-cols-3");
  expect(region.className).toContain("col-span-full");
  return region.previousElementSibling?.textContent ?? null;
}

describe("CategorySelector band placement", () => {
  it.each([
    [0, "G2"],
    [1, "G2"],
    [2, "G2"],
    [3, "G5"],
    [4, "G5"],
    [5, "G5"],
  ])("with 6 groups, opening G%i places the band after the row ending at %s", (open, after) => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={groupedCategories(6)}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(groupTile(`G${open}`));
    expect(bandFollows()).toBe(after);
    expect(row(`G${open} a`)).toBeTruthy();
    expect(row(`G${open} b`)).toBeTruthy();
  });

  it.each([
    [3, "G4"],
    [4, "G4"],
  ])("last partial row: with 5 groups, opening G%i places the band after G4", (open, after) => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={groupedCategories(5)}
        onSelect={() => {}}
      />,
    );
    fireEvent.click(groupTile(`G${open}`));
    expect(bandFollows()).toBe(after);
  });

  it("selected group starts open with its band in place", () => {
    render(
      <CategorySelector
        open
        onOpenChange={() => {}}
        categories={groupedCategories(6)}
        onSelect={() => {}}
        selectedCategoryId="g4b"
      />,
    );
    expect(groupTile("G4").getAttribute("aria-expanded")).toBe("true");
    expect(bandFollows()).toBe("G5");
    expect(row("G4 b").getAttribute("aria-current")).toBe("true");
  });
});

describe("AccountSelector tile grid", () => {
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

  it("groups by account group name (not type) in labelled sections, Other last, archived hidden", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    expect(sectionLabels()).toEqual(["Cash", "Checking", "Credit Card", "Other"]);
    // Every section is its own 3-column grid.
    expect(sheetContent().querySelectorAll(".grid-cols-3")).toHaveLength(4);
    expect(row("Cash VND")).toBeTruthy();
    expect(row("TCB")).toBeTruthy();
    expect(row("Visa")).toBeTruthy();
    expect(screen.queryByText("Old Card")).toBeNull();
    expect(sheetContent().querySelector('[aria-expanded]')).toBeNull();
  });

  it("tiles show the currency as a muted second line", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    const tcb = row("TCB");
    expect(tcb.querySelector("span:last-child")!.textContent).toBe("VND");
    expect(tcb.querySelector("span:last-child")!.className).toContain("text-muted-foreground");
    expect(row("Visa").querySelector("span:last-child")!.textContent).toBe("USD");
  });

  it("accounts with no group sit under Other", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    expect(row("Loose")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 }).at(-1)!.textContent).toBe("Other");
  });

  it("marks the selected tile with aria-current and the accent classes", () => {
    render(
      <AccountSelector
        open
        onOpenChange={() => {}}
        accounts={accounts}
        onSelect={() => {}}
        selectedAccountId="11"
      />,
    );
    expect(row("TCB").getAttribute("aria-current")).toBe("true");
    expect(row("TCB").className).toContain("border-primary");
    expect(row("TCB").className).toContain("text-primary");
    expect(row("TCB").className).toContain("bg-primary/10");
    expect(row("Cash VND").getAttribute("aria-current")).toBeNull();
  });

  it("selecting a tile fires onSelect with the id and closes the sheet", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AccountSelector open onOpenChange={onOpenChange} accounts={accounts} onSelect={onSelect} />,
    );
    fireEvent.click(row("TCB"));
    expect(onSelect).toHaveBeenCalledWith("11");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("search shows a flat tile grid with group and currency as secondary text", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search account..."), { target: { value: "vnd" } });
    expect(row("Cash VND").textContent).toContain("Cash · VND");
    expect(row("TCB").textContent).toContain("Checking · VND");
    expect(row("TCB").parentElement!.className).toContain("grid-cols-3");
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
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

  it("sheet keeps pt-0 and is capped at 70dvh; search is text-base; no 2-column grid", () => {
    render(
      <AccountSelector open onOpenChange={() => {}} accounts={accounts} onSelect={() => {}} />,
    );
    expect(sheetContent().className).toContain("pt-0");
    expect(sheetContent().className).toContain("max-h-[min(70dvh,calc(100dvh-var(--kb-inset,0px)))]");
    expect(sheetContent().querySelector(".grid-cols-2")).toBeNull();
    expect(screen.getByPlaceholderText("Search account...").className).toContain("text-base");
  });
});

describe("AccountSelector saved group order", () => {
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
    expect(sectionLabels()).toEqual(["Checking", "Cash", "Credit Card", "Other"]);
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
    expect(sectionLabels()).toEqual(["Checking", "Cash", "Credit Card", "Other"]);
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
    expect(sectionLabels()).toEqual(["Checking", "Cash", "Credit Card", "Other"]);
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
    expect(sectionLabels()).toEqual(["Checking", "Cash", "Credit Card", "Other"]);
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
    expect(sectionLabels()).toEqual(["Cash", "Checking", "Credit Card", "Other"]);
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
    expect(sectionLabels()).toEqual(["Credit Card", "Cash", "Checking", "Other"]);
  });
});
