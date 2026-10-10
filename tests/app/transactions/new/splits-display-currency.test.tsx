/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }), usePathname: () => "/transactions/new",
}));
vi.mock("swr", () => ({ mutate: vi.fn(), useSWRConfig: () => ({ mutate: vi.fn(), cache: new Map() }) }));

let mockDisplayCurrency = "USD";

interface CapturedSplitSectionProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  rows: Array<{ id: string; categoryId: string; amount: string; note: string }>;
  onChangeRows: (
    rows: Array<{ id: string; categoryId: string; amount: string; note: string }>
  ) => void;
  categories: Array<{ id: number; name: string; type: string }>;
  totalAmount: number;
  currency: string;
  onOpenCategorySelector: (rowIndex: number) => void;
}

let capturedSplitSectionProps: CapturedSplitSectionProps[] = [];

vi.mock("@/components/currency-provider", () => ({
  useDisplayCurrency: () => ({
    displayCurrency: mockDisplayCurrency,
    setDisplayCurrency: vi.fn(),
    isLoading: false,
  }),
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/lib/data/use-api", () => ({
  useApi: (url: string) => {
    if (url === "/api/accounts")
      return {
        isLoading: false,
        data: [
          { id: 1, name: "Checking CAD", currency: "CAD", archived: false },
          { id: 2, name: "Savings No Currency", currency: "", archived: false },
        ],
      };
    if (url === "/api/categories")
      return {
        isLoading: false,
        data: [
          { id: 10, name: "Food", type: "E" },
          { id: 20, name: "Salary", type: "I" },
        ],
      };
    return { isLoading: false, data: { suggestions: [] } };
  },
}));

// Capture the props passed to SplitSection
vi.mock(
  "@/app/(app)/transactions/new/_components/split-section",
  () => ({
    SplitSection: (props: CapturedSplitSectionProps) => {
      capturedSplitSectionProps.push(props);
      return (
        <div data-testid="split-section-mock">
          Split Section Mock - currency={props.currency}
        </div>
      );
    },
  }),
);

import Page from "@/app/(app)/transactions/new/page";

const KEY = "finlynq:tx-prefill";
const mk = (o: Record<string, unknown> = {}) => ({
  v: 1,
  amount: "150000",
  accountId: "2",
  categoryId: "10",
  payee: "",
  note: "",
  tags: "",
  isBusiness: false,
  txType: "Expense",
  ts: Date.now(),
  ...o,
});

describe("SplitSection display currency", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedSplitSectionProps = [];
    sessionStorage.clear();
  localStorage.clear(); // last-used account and recent picks persist per browser
    window.history.replaceState({}, "", "/transactions/new");
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 99 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    mockDisplayCurrency = "USD";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("page passes display currency (VND) to SplitSection when account has no currency", async () => {
    mockDisplayCurrency = "VND";
    // Prefill with account id 2 which has empty currency
    sessionStorage.setItem(KEY, JSON.stringify(mk({ accountId: "2" })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);

    // Wait for page to render
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "New Expense" })).toBeTruthy();
    });

    // Verify correct account is selected
    await waitFor(() => {
      expect(screen.getByText("Savings No Currency")).toBeTruthy();
    });

    // Expand More details
    const advancedBtn = screen.getByRole("button", {
      name: /More details/i,
    });
    fireEvent.click(advancedBtn);

    // Wait for SplitSection to be present
    await waitFor(() => {
      expect(screen.getByTestId("split-section-mock")).toBeTruthy();
    });

    // Verify SplitSection was passed props with display currency
    expect(capturedSplitSectionProps.length).toBeGreaterThan(0);
    const splitProps = capturedSplitSectionProps[capturedSplitSectionProps.length - 1];

    // Verify currency prop receives displayCurrency when account has no currency
    expect(splitProps.currency).toBe("VND");
  });

  it("page passes account currency (CAD) to SplitSection when account has currency", async () => {
    mockDisplayCurrency = "VND";
    // Prefill with account id 1 which has CAD currency
    sessionStorage.setItem(KEY, JSON.stringify(mk({ accountId: "1" })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);

    // Wait for page to render
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "New Expense" })).toBeTruthy();
    });

    // Verify correct account is selected
    await waitFor(() => {
      expect(screen.getByText("Checking CAD")).toBeTruthy();
    });

    // Expand More details
    const advancedBtn = screen.getByRole("button", {
      name: /More details/i,
    });
    fireEvent.click(advancedBtn);

    // Wait for SplitSection to be present
    await waitFor(() => {
      expect(screen.getByTestId("split-section-mock")).toBeTruthy();
    });

    // Verify SplitSection was passed props with account currency
    expect(capturedSplitSectionProps.length).toBeGreaterThan(0);
    const splitProps = capturedSplitSectionProps[capturedSplitSectionProps.length - 1];

    // Verify currency prop receives account currency even when displayCurrency differs
    expect(splitProps.currency).toBe("CAD");
  });
});
