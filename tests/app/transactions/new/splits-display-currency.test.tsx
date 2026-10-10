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
  count: string;
  onCountChange: (next: string) => void;
  rows: Array<{ id: string; categoryId: string; amount: string; note: string }>;
  onRowsChange: (rows: Array<{ id: string; categoryId: string; amount: string; note: string }>) => void;
  parentAmount: number;
  currency: string;
  parentCategoryId: string;
  categories: Array<{ id: number; name: string; type: string }>;
  onOpenCategory: (rowId: string) => void;
  padTargetRowId: string | null;
  onOpenPad: (rowId: string) => void;
  onClosePad: () => void;
  showEmptyErrors?: boolean;
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

// Capture the props passed to SplitSection (the new-entry wrapper over SplitRows)
vi.mock(
  "@/components/transactions/entry/split-section",
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

describe("SplitSection currency (entered-currency rule)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedSplitSectionProps = [];
    sessionStorage.clear();
  localStorage.clear(); // last-used account and recent picks persist per browser
    window.history.replaceState({}, "", "/transactions/new");
    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      // The currency sheet lists the user's active currencies; everything else is a generic save reply.
      json: async () =>
        String(url).includes("active-currencies") ? { active: ["CAD", "USD", "VND"] } : { id: 99 },
    }));
    vi.stubGlobal("fetch", fetchMock);
    mockDisplayCurrency = "USD";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("page passes the display currency (VND) to SplitSection when the account has no currency", async () => {
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

  it("page passes the account currency (CAD) to SplitSection when no currency is entered", async () => {
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

  it("passes the ENTERED currency (USD), not the account currency (CAD), once the user picks one", async () => {
    mockDisplayCurrency = "VND";
    sessionStorage.setItem(KEY, JSON.stringify(mk({ accountId: "1" })));
    window.history.replaceState({}, "", "/transactions/new?prefill=1");
    render(<Page />);

    await waitFor(() => {
      expect(screen.getByText("Checking CAD")).toBeTruthy();
    });

    // Pick USD in the currency sheet (the entered amount is in USD; the account stays CAD).
    fireEvent.click(screen.getByRole("button", { name: "Currency" }));
    fireEvent.click(await screen.findByRole("button", { name: /^USD/ }));

    fireEvent.click(screen.getByRole("button", { name: /More details/i }));
    await waitFor(() => {
      expect(screen.getByTestId("split-section-mock")).toBeTruthy();
    });
    const splitProps = capturedSplitSectionProps[capturedSplitSectionProps.length - 1];
    expect(splitProps.currency).toBe("USD");
    expect(splitProps.parentAmount).toBe(150000);
  });
});
