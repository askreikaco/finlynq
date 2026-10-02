/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { formatCurrency } from "@/lib/currency";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "1" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("swr", () => ({ mutate: vi.fn() }));

vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: () => ["VND", "USD"] }));
vi.mock("@/components/inbox/mode-picker", () => ({ ModePicker: () => null }));
vi.mock("@/components/inbox/import-prefs-picker", () => ({ ImportPrefsPicker: () => null }));
vi.mock("@/components/net-worth-history-chart", () => ({ NetWorthHistoryChart: () => null }));
vi.mock("@/components/transactions/transaction-dialog", () => ({
  TransactionDialog: () => null,
}));
vi.mock("@/app/(app)/transactions/_components/transactions-workspace", () => ({
  TransactionsWorkspace: () => <div>Transactions Workspace</div>,
}));
vi.mock("@/app/(app)/accounts/_components/account-dialog", () => ({
  AccountDialog: () => null,
}));

import AccountDetailPage from "@/app/(app)/accounts/[id]/page";

const mockAccount = {
  id: 1,
  name: "Techcombank",
  type: "A",
  group: "Banks",
  currency: "VND",
  alias: "TC001",
  note: "Main savings account",
  archived: false,
  invisible: false,
  isInvestment: false,
  mode: "manual" as const,
};

const mockBalances = [
  { accountId: 1, balance: 50000000, cashFlowBasis: 50000000, holdingsValue: null },
];

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn(async (url: string) => {
    if (url.includes("/api/accounts")) {
      return { ok: true, json: async () => [mockAccount] };
    }
    if (url.includes("/api/dashboard")) {
      return { ok: true, json: async () => ({ balances: mockBalances }) };
    }
    if (url.includes("/api/transactions")) {
      return { ok: true, json: async () => ({ total: 42 }) };
    }
    if (url.includes("/api/portfolio")) {
      return { ok: true, json: async () => [] };
    }
    if (url.includes("/api/categories")) {
      return { ok: true, json: async () => [] };
    }
    return { ok: false };
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Account Detail Page", () => {
  it("shows balance prominently under the header", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      const balance = screen.getByText(formatCurrency(50000000, "VND"));
      expect(balance).toBeTruthy();
      // Check it's in a large font (text-3xl)
      expect(balance.className).toContain("text-3xl");
    });
  });

  it("does NOT show Balance, Group, or Transactions stat cards", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      // Old stat cards should not be present
      expect(screen.queryByText("Group")).toBeNull();
      expect(screen.queryByText("Transactions")).toBeNull();
    });
  });

  it("shows Actions card with In, Out, Transfer, More buttons", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("In")).toBeTruthy();
      expect(screen.getByText("Out")).toBeTruthy();
      expect(screen.getByText("Transfer")).toBeTruthy();
      // More appears twice: mobile and desktop
      expect(screen.getAllByText("More").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows Information card with account details", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Information")).toBeTruthy();
      expect(screen.getByText("Account number")).toBeTruthy();
      expect(screen.getByText("TC001")).toBeTruthy();
      expect(screen.getAllByText("Group").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Banks").length).toBeGreaterThan(0);
      expect(screen.getByText("Type")).toBeTruthy();
      expect(screen.getAllByText("Currency").length).toBeGreaterThan(0);
    });
  });

  it("shows Note and Import mode in Information card", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Note")).toBeTruthy();
      expect(screen.getByText("Main savings account")).toBeTruthy();
      expect(screen.getByText("Import mode")).toBeTruthy();
      expect(screen.getByText("manual")).toBeTruthy();
    });
  });

  it("shows Invisible toggle in Information card", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Invisible")).toBeTruthy();
      expect(screen.getByText("Hidden from net worth, totals, reports and metrics")).toBeTruthy();
      const switchElement = document.querySelector('[role="switch"]');
      expect(switchElement).toBeTruthy();
      expect(switchElement?.getAttribute("aria-checked")).toBe("false");
    });
  });

  it("toggles invisible status and sends PUT request", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      expect(screen.getByText("Invisible")).toBeTruthy();
    });

    const switchElement = document.querySelector('[role="switch"]') as HTMLElement;
    fireEvent.click(switchElement);

    await waitFor(() => {
      const putCall = fetchSpy.mock.calls.find(
        (call) => call[1]?.method === "PUT" && String(call[0]).includes("/api/accounts")
      );
      expect(putCall).toBeTruthy();
      expect(putCall?.[1]?.body).toContain("invisible");
    });
  });

  it("shows Edit icon button on Information card", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      const editButton = screen.getByLabelText("Edit account");
      expect(editButton).toBeTruthy();
    });
  });

  it("does NOT show Archived badge when account is not archived", async () => {
    render(<AccountDetailPage />);
    await waitFor(() => {
      // Only the type and currency badges should be visible, not Archived
      const badges = screen.getAllByText(/Asset|VND/);
      const archivedBadges = badges.filter((b) => b.textContent?.includes("Archived"));
      expect(archivedBadges).toHaveLength(0);
    });
  });

  it("shows Archived badge in Information card when account is archived", async () => {
    const archivedAccount = { ...mockAccount, archived: true };
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes("/api/accounts")) {
        return { ok: true, json: async () => [archivedAccount] };
      }
      if (url.includes("/api/dashboard")) {
        return { ok: true, json: async () => ({ balances: mockBalances }) };
      }
      if (url.includes("/api/transactions")) {
        return { ok: true, json: async () => ({ total: 42 }) };
      }
      return { ok: false };
    });

    render(<AccountDetailPage />);
    await waitFor(() => {
      const archivedBadges = screen.getAllByText("Archived");
      expect(archivedBadges.length).toBeGreaterThan(0);
    });
  });

  it("shows mobile More sheet on small screens", async () => {
    // Mock window width for mobile
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

    render(<AccountDetailPage />);
    await waitFor(() => {
      const moreButton = screen.getAllByText("More")[0];
      fireEvent.click(moreButton);
    });

    await waitFor(() => {
      expect(screen.getByText("Edit account")).toBeTruthy();
      expect(screen.getByText("Import statement")).toBeTruthy();
      expect(screen.getByText("View in Reports")).toBeTruthy();
      expect(screen.getByText("Delete account")).toBeTruthy();
    });
  });
});
