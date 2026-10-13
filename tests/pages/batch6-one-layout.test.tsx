/**
 * @vitest-environment jsdom
 */
// Batch 6 mobile-design pages (Family overview cards and states, admin instance config): one layout at every
// size. The overview stat tiles sit in MetricGrid, the sections are SectionCards, the loans are ListRows, and the
// admin instance page renders through SectionPage (report width, centred) with ListRows instead of a table.
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  usePathname: () => "/family",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));

import { MetricGrid } from "@/components/mobile/metric-grid";
import { FAMILY_STRINGS } from "@/lib/family/strings";

/** Every file this batch converted. None of them may render a <table>. */
const CONVERTED = [
  "src/app/(app)/family/_components/overview-cards.tsx",
  "src/app/(app)/family/_components/overview-tab.tsx",
  "src/app/(app)/family/_components/member-card.tsx",
  "src/app/(app)/admin/instance/page.tsx",
];

describe("Batch 6: converted files render no <table>", () => {
  for (const f of CONVERTED) {
    it(`${f} has no <table, <Table or ui/table import`, () => {
      const src = read(f);
      expect(src).not.toMatch(/<table\b/);
      expect(src).not.toMatch(/<Table\b/);
      expect(src).not.toMatch(/from "@\/components\/ui\/table"/);
    });
  }
});

describe("Batch 6: old Card / StatCard markup is gone from the overview and instance pages", () => {
  for (const f of CONVERTED) {
    it(`${f} imports no ui/card and no dashboard StatCard`, () => {
      const src = read(f);
      expect(src).not.toMatch(/from "@\/components\/ui\/card"/);
      expect(src).not.toMatch(/StatCard/);
    });
  }

  it("family overview stat tiles go through MetricGrid, cards through SectionCard", () => {
    const cards = read("src/app/(app)/family/_components/overview-cards.tsx");
    expect(cards).toMatch(/<MetricGrid\b/);
    expect(cards).toMatch(/<SectionCard\b/);
    expect(read("src/app/(app)/family/_components/overview-tab.tsx")).toMatch(/<SectionCard\b/);
    expect(read("src/app/(app)/family/_components/member-card.tsx")).toMatch(/<ListRow\b/);
  });

  it("admin instance renders through SectionPage (report width, centred) with SectionCard and ListRow", () => {
    const src = read("src/app/(app)/admin/instance/page.tsx");
    expect(src).toMatch(/<SectionPage\b[^>]*width="report"/);
    expect(src).toMatch(/<SectionPage\b[^>]*\bcenter\b/);
    expect(src).toMatch(/from "@\/components\/templates\/section-page"/);
    expect(src).toMatch(/<SectionCard\b/);
    expect(src).toMatch(/<ListRow\b/);
    expect(src).not.toMatch(/PageHeader/);
    expect(src).not.toMatch(/max-w-section|max-w-3xl|max-w-4xl/);
  });
});

describe("Batch 6: one column at every width for the converted overview and instance files", () => {
  // overview-tab pairs the household charts at wide (desktop columns, owner 2026-10-13): tests/pages/batch5-one-layout.test.tsx.
  for (const f of [
    "src/app/(app)/family/_components/overview-cards.tsx",
    "src/app/(app)/admin/instance/page.tsx",
  ]) {
    it(`${f} has no regular:/wide: column switch`, () => {
      const src = read(f);
      expect(src).not.toMatch(/wide:grid-cols-/);
      expect(src).not.toMatch(/regular:grid-cols-/);
    });
  }
});

describe("Batch 6: shared metric grid for two figures stays two columns", () => {
  it("two MetricItems render as a 2-column grid at every width with currency and sub captions", () => {
    render(
      <MetricGrid
        columns={2}
        metrics={[
          { label: "Income", value: 1200, currency: "USD", sub: "This month" },
          { label: "Expenses", value: 300, currency: "USD", sub: "This month · 25% of income" },
        ]}
      />,
    );
    const grid = document.querySelector('[data-slot="metric-grid"]') as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).not.toContain("regular:grid-cols-3");
    expect(grid.className).not.toContain("wide:grid-cols-4");
    expect(screen.getByText("Income")).toBeTruthy();
    expect(screen.getByText("This month · 25% of income")).toBeTruthy();
    cleanup();
  });
});

describe("Batch 6: family overview cards render through SectionCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("an unavailable headline figure is a SectionCard with its label, the not-shared text and the test id", async () => {
    const { UnavailableCard } = await import("@/app/(app)/family/_components/overview-cards");
    render(<UnavailableCard title="Income" text="Not shared" />);
    const card = screen.getByTestId("card-unavailable");
    expect(card.tagName).toBe("SECTION");
    expect(card.getAttribute("data-slot")).toBe("section-card");
    expect(within(card).getByRole("heading", { name: "Income" })).toBeTruthy();
    expect(within(card).getByText("Not shared")).toBeTruthy();
  });

  it("an empty income vs expenses series shows the no-cashflow message inside a SectionCard", async () => {
    const { IncomeVsExpensesCard } = await import("@/app/(app)/family/_components/overview-cards");
    const { container } = render(
      <IncomeVsExpensesCard
        series={{ from: null, monthly: [], daily: [] }}
        period="all"
        currency="USD"
        asOf="2026-10-01"
        idPrefix="t-"
      />,
    );
    expect(container.querySelector('[data-slot="section-card"]')).not.toBeNull();
    expect(screen.getByText(FAMILY_STRINGS.overview_card_no_cashflow)).toBeTruthy();
    expect(screen.getByRole("heading", { name: FAMILY_STRINGS.overview_card_income_vs_expenses })).toBeTruthy();
  });
});
