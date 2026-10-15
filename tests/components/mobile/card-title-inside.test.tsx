// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Card } from "@/components/ui/card";

describe("Card title renders inside the card", () => {
  it("label is a descendant of the surface-card element and precedes children", () => {
    const { container } = render(
      <Card title="Action Center">
        <p>child</p>
      </Card>,
    );
    const card = container.querySelector("[data-slot=card]")!;
    expect(card.className).toContain("surface-card");
    const label = screen.getByRole("heading", { name: "Action Center" });
    expect(card.contains(label)).toBe(true);
    expect(label.getAttribute("data-slot")).toBe("card-label-text");
    const child = screen.getByText("child");
    expect(label.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // nothing sits between the page and the card: the label is not a sibling of the card
    expect(card.previousElementSibling).toBeNull();
    expect(card.parentElement).toBe(container);
  });

  it("without a title: a surface-card with a padded body, no heading", () => {
    const { container } = render(<Card>x</Card>);
    expect(screen.queryByRole("heading")).toBeNull();
    const card = container.querySelector("[data-slot=card]")!;
    expect(card.className).toContain("surface-card");
    const body = card.querySelector("[data-slot=card-body]")!;
    expect(body.className).toContain("p-4");
  });

  it("padded=false: label row keeps its own padding, body has none", () => {
    const { container } = render(
      <Card title="Active" padded={false} className="px-3">
        <p>row</p>
      </Card>,
    );
    const label = screen.getByRole("heading", { name: "Active" });
    // the label row keeps the shared card padding (same px as Card) even when the body is unpadded
    expect(label.closest("[data-slot=card-label]")!.className).toContain("@[11rem]:px-5");
    const body = container.querySelector("[data-slot=card-body]")!;
    expect(body.className).not.toContain("p-4");
    expect(body.className).not.toContain("pb-4");
    expect(body.className).toContain("px-3");
  });

  it("action sits on the right of the label row, inside the card", () => {
    const { container } = render(
      <Card title="Information" action={<button>Edit</button>}>
        x
      </Card>,
    );
    const card = container.querySelector("[data-slot=card]")!;
    expect(card.contains(screen.getByRole("button", { name: "Edit" }))).toBe(true);
  });

  it("frameClassName styles the outer card when labelled", () => {
    const { container } = render(
      <Card title="Tint" frameClassName="bg-info/10">
        x
      </Card>,
    );
    expect(container.querySelector("[data-slot=card]")!.className).toContain("bg-info/10");
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

  it("no page renders <SectionLabel> directly followed by a single <Card>", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f.includes("/dev/gallery/")) continue; // gallery headings label groups of many demo cards
      const src = readFileSync(f, "utf8");
      if (/<SectionLabel[^>]*>[^<]*(?:<[^/][^>]*>[^<]*<\/[^>]+>[^<]*)*<\/SectionLabel>\s*<Card\b/.test(src)) bad.push(f);
    }
    expect(bad).toEqual([]);
  });

  it("dashboard cards named by the owner pass their title as the Card title", () => {
    const dir = join(process.cwd(), "src/app/(app)/dashboard/_components");
    const expectations: Record<string, string> = {
      "action-center.tsx": 'title="Action Center"',
      "weekly-recap.tsx": 'title="Weekly Recap"',
      "income-expense-chart.tsx": 'title="Income vs Expenses"',
      "spending-category-chart.tsx": 'title="Spending by Category"',
      "insights-section.tsx": "title={title}",
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
