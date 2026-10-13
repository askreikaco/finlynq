// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SectionCard } from "@/components/mobile/section-card";

describe("SectionCard label renders inside the card", () => {
  it("label is a descendant of the surface-card element and precedes children", () => {
    const { container } = render(
      <SectionCard label="Action Center">
        <p>child</p>
      </SectionCard>,
    );
    const card = container.querySelector("[data-slot=section-card]")!;
    expect(card.className).toContain("surface-card");
    const label = screen.getByRole("heading", { name: "Action Center" });
    expect(card.contains(label)).toBe(true);
    expect(label.getAttribute("data-slot")).toBe("section-card-label");
    const child = screen.getByText("child");
    expect(label.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // nothing sits between the page and the card: the label is not a sibling of the card
    expect(card.previousElementSibling).toBeNull();
    expect(card.parentElement).toBe(container);
  });

  it("without a label keeps the old structure (section > surface-card body, no heading)", () => {
    const { container } = render(<SectionCard>x</SectionCard>);
    expect(screen.queryByRole("heading")).toBeNull();
    const body = container.querySelector("[data-slot=section-card] > [data-slot=section-card-body]")!;
    expect(body.className).toContain("surface-card");
    expect(body.className).toContain("p-4");
  });

  it("padded=false: label row keeps its own padding, body has none", () => {
    const { container } = render(
      <SectionCard label="Active" padded={false} className="px-3">
        <p>row</p>
      </SectionCard>,
    );
    const label = screen.getByRole("heading", { name: "Active" });
    expect(label.className).toContain("px-4");
    const body = container.querySelector("[data-slot=section-card-body]")!;
    expect(body.className).not.toContain("p-4");
    expect(body.className).not.toContain("pb-4");
    expect(body.className).toContain("px-3");
  });

  it("action sits on the right of the label row, inside the card", () => {
    const { container } = render(
      <SectionCard label="Information" action={<button>Edit</button>}>
        x
      </SectionCard>,
    );
    const card = container.querySelector("[data-slot=section-card]")!;
    expect(card.contains(screen.getByRole("button", { name: "Edit" }))).toBe(true);
  });

  it("cardClassName styles the outer card when labelled", () => {
    const { container } = render(
      <SectionCard label="Tint" cardClassName="bg-info/10">
        x
      </SectionCard>,
    );
    expect(container.querySelector("[data-slot=section-card]")!.className).toContain("bg-info/10");
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("static guard: no card title rendered outside its card", () => {
  const files = walk(join(process.cwd(), "src/app/(app)"));

  it("no page renders <SectionLabel> directly followed by a single <SectionCard>", () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/<SectionLabel[^>]*>[^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*<\/SectionLabel>\s*<SectionCard\b/.test(src)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it("dashboard cards named by the owner pass their title as SectionCard label", () => {
    const dir = join(process.cwd(), "src/app/(app)/dashboard/_components");
    const expectations: Record<string, string> = {
      "action-center.tsx": 'label="Action Center"',
      "weekly-recap.tsx": 'label="Weekly Recap"',
      "income-expense-chart.tsx": 'label="Income vs Expenses"',
      "spending-category-chart.tsx": 'label="Spending by Category"',
      "insights-section.tsx": "label={title}",
    };
    for (const [file, needle] of Object.entries(expectations)) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).toContain(needle);
      expect(src, file).not.toContain("<SectionLabel");
    }
  });

  it("insights titles are real card titles (Spending Alerts, Recurring, Top Merchants, Category Trends)", () => {
    const src = readFileSync(join(process.cwd(), "src/app/(app)/dashboard/_components/insights-section.tsx"), "utf8");
    for (const t of ["Spending Alerts", "Recurring", "Top Merchants", "Category Trends"]) expect(src).toContain(t);
  });
});
