/**
 * @vitest-environment jsdom
 *
 * Tests for BackButton adoption on four fixed-href pages:
 * - src/app/(app)/settings/import/reconcile-visibility/page.tsx
 * - src/app/(app)/family/share/page.tsx
 * - src/app/(app)/transactions/audit/page.tsx
 * - src/app/(app)/categories/[id]/page.tsx
 *
 * Each page now renders a BackButton via PageHeader's backHref prop.
 * Tests verify the pages render with the expected back button hrefs and aria-labels,
 * and that the page's content is still present.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

// Mock next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRouterPrefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: mockRouterPrefetch,
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useParams: vi.fn() as any,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/account/info",
}));

// Mock fetch globally
global.fetch = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BackButton adoption: ReconcileVisibility page", () => {
  it("renders with back button href=/settings/import and aria-label='Back to Import settings'", async () => {
    const { useParams } = await import("next/navigation");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useParams).mockReturnValue({} as any);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 })
    );

    const ReconcileVisibilityPage = (await import("@/app/(app)/settings/import/reconcile-visibility/page")).default;

    render(<ReconcileVisibilityPage />);

    const backButton = screen.queryByRole("link", { name: "Back to Import settings" });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/settings/import");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");

    // Check page content is present
    expect(screen.queryByText(/Reconcile dropdown visibility/i)).toBeTruthy();
    expect(screen.queryByText(/Choose which accounts appear/i)).toBeTruthy();
  });
});

describe("BackButton adoption: FamilyShare page", () => {
  it("renders with correct back button and page content", async () => {
    const { useParams } = await import("next/navigation");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useParams).mockReturnValue({} as any);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ members: [], invitations: [] }), { status: 200 })
    );

    const FamilySharePage = (await import("@/app/(app)/family/share/page")).default;
    const { FAMILY_STRINGS } = await import("@/lib/family/strings");

    render(<FamilySharePage />);

    const backButton = screen.queryByRole("link", { name: FAMILY_STRINGS.share_back });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/family");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");

    // Check page content is present
    expect(screen.queryByText(FAMILY_STRINGS.share_page_title)).toBeTruthy();
    expect(screen.queryByText(FAMILY_STRINGS.share_page_description)).toBeTruthy();
  });
});

describe("BackButton adoption: CurrencyAudit page", () => {
  it("renders with back button href=/transactions and aria-label='Back to Transactions'", async () => {
    const { useParams } = await import("next/navigation");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useParams).mockReturnValue({} as any);
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 })
    );

    const CurrencyAuditPage = (await import("@/app/(app)/transactions/audit/page")).default;

    render(<CurrencyAuditPage />);

    const backButton = screen.queryByRole("link", { name: /Back to Transactions/i });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/transactions");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");

    // Check page content is present
    expect(screen.queryByText(/Currency Review/i)).toBeTruthy();
    expect(screen.queryByText(/Transactions with a currency that doesn't match/i)).toBeTruthy();
  });
});

describe("BackButton adoption: Category page", () => {
  beforeEach(() => {
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes("/api/reports/category")) {
        return new Response(
          JSON.stringify({
            data: {
              category: { id: 123, name: "Food", type: "E", group: "Groceries" },
              stats: {
                thisMonth: 150,
                lastMonth: 120,
                averageMonthly: 130,
                medianMonthly: 125,
                sameMonthLastYear: 110,
                shareOfType: 0.15,
                transactionCount: 10,
                total: 1300,
              },
              months: [],
              hasBudget: false,
              topPayees: [],
              recent: [],
              displayCurrency: "USD",
              payeesLocked: false,
            },
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes("/api/categories")) {
        return new Response(
          JSON.stringify([
            { id: 123, name: "Food", type: "E" },
            { id: 124, name: "Salary", type: "I" },
          ]),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  it("renders with back button href=/categories for expense category", async () => {
    const { useParams } = await import("next/navigation");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useParams).mockReturnValue({ id: "123" } as any);

    const CategoryPage = (await import("@/app/(app)/categories/[id]/page")).default;

    render(<CategoryPage />);

    // Wait for async rendering
    await new Promise((resolve) => setTimeout(resolve, 100));

    const backButton = screen.queryByRole("link", { name: "Back to Categories" });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/categories");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");

    // Check page content is present (h1 with category name and group badge)
    const heading = screen.queryByRole("heading", { name: /Food/i });
    expect(heading).toBeTruthy();
    expect(screen.queryByText(/Groceries/i)).toBeTruthy();
  });

  it("renders with back button href=/categories?type=I for income category", async () => {
    const { useParams } = await import("next/navigation");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useParams).mockReturnValue({ id: "124" } as any);
    vi.mocked(global.fetch).mockImplementation(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes("/api/reports/category")) {
        return new Response(
          JSON.stringify({
            data: {
              category: { id: 124, name: "Salary", type: "I", group: "" },
              stats: {
                thisMonth: 3000,
                lastMonth: 3000,
                averageMonthly: 3000,
                medianMonthly: 3000,
                sameMonthLastYear: 2800,
                shareOfType: 0.5,
                transactionCount: 1,
                total: 36000,
              },
              months: [],
              hasBudget: false,
              topPayees: [],
              recent: [],
              displayCurrency: "USD",
              payeesLocked: false,
            },
          }),
          { status: 200 }
        );
      }
      if (urlStr.includes("/api/categories")) {
        return new Response(
          JSON.stringify([
            { id: 123, name: "Food", type: "E" },
            { id: 124, name: "Salary", type: "I" },
          ]),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const CategoryPage = (await import("@/app/(app)/categories/[id]/page")).default;

    render(<CategoryPage />);

    // Wait for async rendering
    await new Promise((resolve) => setTimeout(resolve, 100));

    const backButton = screen.queryByRole("link", { name: "Back to Categories" });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/categories?type=I");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");

    // Check page content is present (h1 with category name)
    const heading = screen.queryByRole("heading", { name: /Salary/i });
    expect(heading).toBeTruthy();
  });
});

describe("BackButton adoption: AccountShell", () => {
  it("renders back button href=/account with aria-label='Back to Account' on sub-pages", async () => {
    const { AccountShell } = await import("@/components/account-shell");

    render(
      <AccountShell>
        <div>Account sub-page content</div>
      </AccountShell>
    );

    const backButton = screen.getByRole("link", { name: "Back to Account" });
    expect(backButton.getAttribute("href")).toBe("/account");
    expect(backButton.getAttribute("data-slot")).toBe("back-button");
  });
});
