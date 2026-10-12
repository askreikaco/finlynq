/**
 * @vitest-environment jsdom
 */
// Local-first read path on real pages: with the read flag ON, a second open of a page paints the saved data even
// when the network is gone; with it OFF the page makes plain fetches and keeps nothing between opens.
import * as React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SWRConfig } from "swr";
import { LOCAL_READ_CACHE_KEY } from "@/lib/local-first/read-cache/optin";

const session: { userId: string } = { userId: "lf-user" };
const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: session.userId, ready: true }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  usePathname: () => "/",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));

import LoansPage from "@/app/(app)/loans/page";
import AccountsPage from "@/app/(app)/accounts/page";

const LOAN = {
  id: 5, name: "Car loan", type: "loan", principal: 10000, annualRate: 6, termMonths: 60,
  startDate: "2026-01-15", paymentFrequency: "monthly", extraPayment: 0, paymentAmount: null,
  residualValue: null, monthlyPayment: 193.33, paymentPerPeriod: 193.33, monthlyEquivalentPayment: 193.33,
  totalInterest: 1600, payoffDate: "2031-01-15", remainingBalance: 8000, balanceSource: null,
  principalPaid: 2000, interestPaid: 0, periodsRemaining: 50, accountName: null, accountId: null,
  currency: "VND", displayCurrency: "VND", remainingBalanceDisplay: 8000, monthlyEquivalentPaymentDisplay: 193.33,
};

function mount(cache: Map<string, unknown>) {
  return render(
    <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>
      <LoansPage />
    </SWRConfig>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Loans page: local read cache", () => {
  it("flag ON: a second open offline still shows the saved loan", async () => {
    localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    const cache = new Map<string, unknown>();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [LOAN] });
    const first = mount(cache);
    await waitFor(() => expect(screen.getAllByText("Car loan").length).toBeGreaterThan(0));
    first.unmount();

    fetchMock.mockRejectedValue(new TypeError("offline"));
    mount(cache);
    // Painted from the saved data straight away, and it stays after the failed refresh.
    expect(screen.getAllByText("Car loan").length).toBeGreaterThan(0);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("Car loan").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Couldn't load loans/)).toBeNull();
  });

  it("flag OFF (default): offline on a second open shows the error, nothing was kept", async () => {
    const cache = new Map<string, unknown>();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [LOAN] });
    const first = mount(cache);
    await waitFor(() => expect(screen.getAllByText("Car loan").length).toBeGreaterThan(0));
    first.unmount();

    fetchMock.mockRejectedValue(new TypeError("offline"));
    mount(cache);
    await waitFor(() => expect(screen.getByText(/Couldn't load loans/)).toBeTruthy());
    expect(screen.queryByText("Car loan")).toBeNull();
  });
});

describe("Accounts page: local read cache", () => {
  const balances = [
    { accountId: 1, accountName: "Techcombank", accountType: "A", accountGroup: "Banks", currency: "VND", balance: 40000000, convertedBalance: 40000000 },
  ];
  const online = async (url: string) => ({ ok: true, status: 200, json: async () => (String(url).includes("/api/dashboard") ? { balances } : {}) });
  const mountAccounts = (cache: Map<string, unknown>) =>
    render(
      <SWRConfig value={{ provider: () => cache as never, dedupingInterval: 0, errorRetryCount: 0, revalidateOnFocus: false }}>
        <AccountsPage />
      </SWRConfig>,
    );

  it("flag ON: a second open offline still lists the saved account", async () => {
    localStorage.setItem(LOCAL_READ_CACHE_KEY, "1");
    const cache = new Map<string, unknown>();
    fetchMock.mockImplementation(online);
    const first = mountAccounts(cache);
    await waitFor(() => expect(screen.getAllByText("Techcombank").length).toBeGreaterThan(0));
    first.unmount();

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/dashboard")) throw new TypeError("offline");
      return online(url);
    });
    mountAccounts(cache);
    expect(screen.getAllByText("Techcombank").length).toBeGreaterThan(0);
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes("/api/dashboard")).length).toBe(2));
    expect(screen.getAllByText("Techcombank").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Couldn't load accounts/)).toBeNull();
  });

  it("flag OFF (default): offline on a second open shows the error", async () => {
    const cache = new Map<string, unknown>();
    fetchMock.mockImplementation(online);
    const first = mountAccounts(cache);
    await waitFor(() => expect(screen.getAllByText("Techcombank").length).toBeGreaterThan(0));
    first.unmount();

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/dashboard")) throw new TypeError("offline");
      return online(url);
    });
    mountAccounts(cache);
    await waitFor(() => expect(screen.getByText(/Couldn't load accounts/)).toBeTruthy());
    expect(screen.queryByText("Techcombank")).toBeNull();
  });
});
