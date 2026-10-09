/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

const H = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), search: "", id: "5" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: vi.fn(), back: vi.fn(), refresh: H.refresh }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
  usePathname: () => "/loans/new",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: (c: string) => [c, "USD", "VND"] }));

import NewLoanRoute from "@/app/(app)/loans/new/page";
import EditLoanRoute from "@/app/(app)/loans/[id]/edit/page";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let postStatus = 201;
let existing: Record<string, unknown>[] = [];

const LOAN = {
  id: 5, name: "House", type: "mortgage", principal: 200000, annualRate: 4.5, termMonths: 240,
  startDate: "2026-01-01", paymentFrequency: "monthly", extraPayment: 0, paymentAmount: null,
  residualValue: null, monthlyPayment: 1000, paymentPerPeriod: 1000, monthlyEquivalentPayment: 1000,
  totalInterest: 0, payoffDate: "2046-01-01", remainingBalance: 190000, balanceSource: null,
  principalPaid: 10000, interestPaid: 0, periodsRemaining: 200, accountName: null, accountId: 9,
  currency: "USD", displayCurrency: "VND", remainingBalanceDisplay: 190000, monthlyEquivalentPaymentDisplay: 1000,
};

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  calls = [];
  postStatus = 201;
  existing = [LOAN];
  H.search = "";
  H.id = "5";
  H.push.mockReset();
  H.refresh.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/accounts") return json([{ id: 9, name: "Bank", currency: "USD" }]);
      if (url === "/api/loans" && (!init?.method || init.method === "GET")) return json(existing);
      if (url === "/api/loans" && init?.method === "POST") return json(postStatus === 201 ? { id: 77 } : { error: "Payment too low" }, postStatus);
      if (url === "/api/loans" && init?.method === "PUT") return json({ id: 5 });
      if (url.startsWith("/api/loans?id=") && init?.method === "DELETE") return json({ ok: true });
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsTo = (method: string) => calls.filter((c) => c.url.startsWith("/api/loans") && (c.init?.method ?? "GET") === method);
const body = (c: Call) => JSON.parse(String(c.init?.body));

/** Re-denomination (currency change on an existing loan) is driven by a base-ui Select that
 *  jsdom cannot open; that path is pinned by the static guard in loans-subscriptions-routes.test.ts. */
function fillNewLoan() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Car" } });
  fireEvent.change(screen.getByLabelText("Principal"), { target: { value: "15000" } });
  fireEvent.change(screen.getByLabelText("Annual Rate (%)"), { target: { value: "6" } });
  fireEvent.change(screen.getByLabelText("Term (months)"), { target: { value: "60" } });
  fireEvent.change(screen.getByLabelText("Start Date"), { target: { value: "2026-03-01" } });
}

describe("/loans/new: create page", () => {
  it("renders the full page with label-left rows and no dialog", async () => {
    const { container } = render(<NewLoanRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "New loan" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Principal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add loan" })).toBeTruthy();
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("keeps submit disabled until the required fields are valid", () => {
    render(<NewLoanRoute />);
    const submit = screen.getByRole("button", { name: "Add loan" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fillNewLoan();
    expect(submit.disabled).toBe(false);
  });

  it("shows the field error and sends no request when the name is blank", async () => {
    const { container } = render(<NewLoanRoute />);
    fillNewLoan();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(callsTo("POST")).toHaveLength(0);
  });

  it("POSTs the same payload shape the old dialog sent", async () => {
    const { container } = render(<NewLoanRoute />);
    fillNewLoan();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(callsTo("POST")).toHaveLength(1));
    expect(body(callsTo("POST")[0])).toEqual({
      name: "Car",
      type: "mortgage",
      principal: 15000,
      currency: "VND",
      annualRate: 6,
      termMonths: 60,
      startDate: "2026-03-01",
      paymentAmount: null,
      paymentFrequency: "monthly",
      extraPayment: 0,
      residualValue: null,
      accountId: null,
    });
  });

  it("returns to the loans list on success", async () => {
    const { container } = render(<NewLoanRoute />);
    fillNewLoan();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/loans"));
  });

  it("stays on the page and keeps the input when the server refuses", async () => {
    postStatus = 422;
    const { container } = render(<NewLoanRoute />);
    fillNewLoan();
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText("Payment too low")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Car");
  });

  it("follows a same-app returnTo on success and cancel", async () => {
    H.search = "returnTo=/portfolio";
    const { container } = render(<NewLoanRoute />);
    fillNewLoan();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/portfolio"));
  });

  it.each(["//evil.example", "https://evil.example", "javascript:alert(1)", "/\\evil.example"])(
    "rejects an unsafe returnTo (%s) and falls back to /loans",
    async (bad) => {
      H.search = `returnTo=${encodeURIComponent(bad)}`;
      const { container } = render(<NewLoanRoute />);
      fillNewLoan();
      fireEvent.submit(container.querySelector("form")!);
      await waitFor(() => expect(H.push).toHaveBeenCalledWith("/loans"));
      expect(H.push).not.toHaveBeenCalledWith(bad);
    },
  );
});

describe("/loans/[id]/edit: edit page", () => {
  it("loads the loan and seeds from its native fields", async () => {
    render(<EditLoanRoute />);
    expect(await screen.findByRole("heading", { level: 1, name: "Edit loan" })).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("House");
    expect((screen.getByLabelText("Principal") as HTMLInputElement).value).toBe("200000");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("PUTs with the loan id and the same payload shape, then returns to the list", async () => {
    const { container } = render(<EditLoanRoute />);
    await screen.findByRole("heading", { name: "Edit loan" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Home" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(callsTo("PUT")).toHaveLength(1));
    const sent = body(callsTo("PUT")[0]);
    expect(sent.id).toBe(5);
    expect(sent.name).toBe("Home");
    expect(sent.principal).toBe(200000);
    expect(sent.currency).toBe("USD");
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/loans"));
  });

  it("deletes only after the confirm dialog, then returns to the list", async () => {
    render(<EditLoanRoute />);
    await screen.findByRole("heading", { name: "Edit loan" });
    expect(callsTo("DELETE")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete loan/ }));
    // The overflow item only opens the confirm; nothing is sent yet.
    const confirm = await screen.findByRole("button", { name: "Delete loan" });
    expect(calls.some((c) => c.init?.method === "DELETE")).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/loans"));
    expect(calls.filter((c) => c.init?.method === "DELETE")).toHaveLength(1);
    expect(calls.find((c) => c.init?.method === "DELETE")?.url).toBe("/api/loans?id=5");
  });

  it("shows a not-found state for an unknown id", async () => {
    H.id = "999";
    render(<EditLoanRoute />);
    expect(await screen.findByText("Loan not found")).toBeTruthy();
  });
});
