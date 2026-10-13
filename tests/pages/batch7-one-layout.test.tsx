/**
 * @vitest-environment jsdom
 */
// Batch 7 dashboard cards (Key metrics, Net Worth hero, Financial health, Action Center, Weekly Recap, Quick
// Import, Income vs Expenses, Spending by Category, Insights): one layout at every size. Cards are SectionCard
// (or the shared MetricCard), with no ui/card markup and no regular:/wide: layout switch.
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  usePathname: () => "/dashboard",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/sparkline", () => ({ Sparkline: () => null }));

import { KeyMetrics } from "@/app/(app)/dashboard/_components/key-metrics";
import { NetWorthHeroCard } from "@/app/(app)/dashboard/_components/net-worth-hero-card";
import { HealthScoreCard } from "@/app/(app)/dashboard/_components/health-score-card";

const DASHBOARD_CARDS_CONVERTED = [
  "src/app/(app)/dashboard/_components/key-metrics.tsx",
  "src/app/(app)/dashboard/_components/net-worth-hero-card.tsx",
  "src/app/(app)/dashboard/_components/health-score-card.tsx",
  "src/app/(app)/dashboard/_components/action-center.tsx",
  "src/app/(app)/dashboard/_components/weekly-recap.tsx",
  "src/app/(app)/dashboard/_components/quick-import.tsx",
  "src/app/(app)/dashboard/_components/income-expense-chart.tsx",
  "src/app/(app)/dashboard/_components/spending-category-chart.tsx",
  "src/app/(app)/dashboard/_components/insights-section.tsx",
];

/** Cards that used to hand-build their own ui/card markup. They now sit in SectionCard. */
const WAS_UI_CARD = DASHBOARD_CARDS_CONVERTED.filter((f) => !/key-metrics|net-worth-hero-card|health-score-card/.test(f));

afterEach(cleanup);

describe("Batch 7: converted dashboard cards carry no ui/card markup and no regular:/wide: switch", () => {
  for (const f of DASHBOARD_CARDS_CONVERTED) {
    it(`${f} imports no ui/card`, () => {
      expect(read(f)).not.toMatch(/from "@\/components\/ui\/card"/);
    });
    it(`${f} has no regular:/wide: layout switch`, () => {
      const src = read(f);
      // max-regular: (touch-target sizing, pinned by tests/w5/d2-touch) is not a layout switch.
      expect(src).not.toMatch(/(?<![\w-])wide:/);
      expect(src).not.toMatch(/(?<![\w-])regular:/);
    });
  }
});

describe("Batch 7: former ui/card cards render through SectionCard", () => {
  for (const f of WAS_UI_CARD) {
    it(`${f} wraps its card in SectionCard`, () => {
      expect(read(f)).toMatch(/<SectionCard\b/);
    });
  }
});

describe("Batch 7: Key metrics render", () => {
  const health = { savingsRatePct: 25, dti: { pct: 30, reliable: true } } as never;

  it("two MetricCards (Savings Rate, Debt-to-Income) with their figures and captions", () => {
    render(<KeyMetrics health={health} />);
    expect(screen.getByText("Savings Rate")).toBeTruthy();
    expect(screen.getByText("Debt-to-Income")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText("of income saved · last 3 months")).toBeTruthy();
    expect(screen.getByText("debt payments vs income · last 12 months")).toBeTruthy();
  });

  it("the default grid is one column stacked, two side by side in the card's own slot (no viewport switch)", () => {
    const { container } = render(<KeyMetrics health={health} />);
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("@lg:grid-cols-2");
    expect(grid.className).not.toMatch(/(?<![\w-])(wide|regular):/);
  });

  it("tiles mode renders the two bare tiles with no wrapping grid", () => {
    const { container } = render(<KeyMetrics health={health} tiles />);
    expect(container.querySelector(".grid")).toBeNull();
    expect(screen.getByText("25%")).toBeTruthy();
  });

  it("an unavailable figure reads as a dash with the reason, never a computed value", () => {
    render(<KeyMetrics health={health} unavailable={{ savings: "Section not shared" }} />);
    expect(screen.getByText("Section not shared")).toBeTruthy();
    expect(screen.queryByText("25%")).toBeNull();
  });
});

describe("Batch 7: Net worth hero and Financial health tiles render", () => {
  it("net worth hero shows its label and the change caption", () => {
    render(
      <NetWorthHeroCard
        value={1000}
        currency="USD"
        change={50}
        changePct={5}
        changeCaption="vs last month"
        sparkData={[1, 2, 3]}
      />,
    );
    expect(screen.getByText("Total Net Worth")).toBeTruthy();
    expect(screen.getByText(/vs last month/)).toBeTruthy();
  });

  it("financial health tile is a button named for its details dialog", () => {
    render(<HealthScoreCard health={{ score: 72, grade: "B", components: [] } as never} />);
    expect(screen.getByRole("button", { name: "Financial health details" })).toBeTruthy();
  });
});
