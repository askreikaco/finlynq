/**
 * @vitest-environment jsdom
 *
 * Due card (Repeat + Installment phase 2a): rows, cap + See all, Post now navigation, Skip call + refresh.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const H = vi.hoisted(() => ({ push: vi.fn(), mutate: vi.fn(async () => undefined), subs: [] as unknown[] }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: H.push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: H.mutate }) }));
vi.mock("@/lib/data/use-api", () => ({ useApi: () => ({ data: H.subs, isLoading: false }) }));

import { DueCard } from "@/components/subscriptions/due-card";
import Page from "@/app/(app)/transactions/page";

vi.mock("@/app/(app)/transactions/_components/transactions-workspace", () => ({
  TransactionsWorkspace: () => React.createElement("div", { "data-testid": "workspace" }),
}));

const sub = (id: number, over: Record<string, unknown> = {}) => ({
  id, name: `Sub ${id}`, amount: 10 * id, currency: "USD", frequency: "monthly", status: "active",
  nextDate: `2026-06-0${id}`, postable: true, dueCount: 1, overdue: [`2026-06-0${id}`], ...over,
});

beforeEach(() => {
  H.push.mockReset();
  H.mutate.mockClear();
  H.subs = [];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DueCard", () => {
  it("renders nothing when nothing is due (future, paused, no dueCount)", () => {
    H.subs = [sub(1, { dueCount: 0 }), sub(2, { status: "paused" }), sub(3, { nextDate: null })];
    const { container } = render(<DueCard />);
    expect(container.innerHTML).toBe("");
  });

  it("shows payee, amount and due date per row, oldest first", () => {
    H.subs = [sub(3), sub(1)];
    render(<DueCard />);
    const rows = screen.getAllByTestId(/^due-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["due-row-1", "due-row-3"]);
    expect(rows[0].textContent).toContain("Sub 1");
    expect(rows[0].textContent).toContain("$10.00");
    expect(rows[0].textContent).toMatch(/Due .*2026/);
    expect(screen.queryByTestId("due-see-all")).toBeNull();
  });

  it("caps at 3 rows and links See all to /subscriptions", () => {
    H.subs = [sub(1), sub(2), sub(3), sub(4)];
    render(<DueCard />);
    expect(screen.getAllByTestId(/^due-row-/)).toHaveLength(3);
    expect(screen.getByTestId("due-see-all").getAttribute("href")).toBe("/subscriptions");
  });

  it("notes extra overdue occurrences", () => {
    H.subs = [sub(1, { dueCount: 3 })];
    render(<DueCard />);
    expect(screen.getByTestId("due-row-1").textContent).toContain("3 due");
  });

  it("Post now opens the prefilled entry screen for that occurrence", () => {
    H.subs = [sub(2)];
    render(<DueCard />);
    fireEvent.click(screen.getByTestId("due-post-2"));
    expect(H.push).toHaveBeenCalledWith("/transactions/new?subscription=2&occurrence=2026-06-02&return=%2Ftransactions");
  });

  it("Skip calls the skip endpoint with the due date, then revalidates the subscription keys", async () => {
    H.subs = [sub(2)];
    render(<DueCard />);
    fireEvent.click(screen.getByTestId("due-skip-2"));
    await waitFor(() => expect(H.mutate).toHaveBeenCalled());
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/subscriptions");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ action: "skip", id: 2, occurrenceDate: "2026-06-02" });
    const filter = (H.mutate.mock.calls[0] as unknown[])[0] as (k: string) => boolean;
    expect(filter("/api/subscriptions")).toBe(true);
    expect(filter("/api/accounts")).toBe(false);
  });

  it("a failed skip shows the server message and keeps the row", async () => {
    H.subs = [sub(2)];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 409, clone() { return this; }, json: async () => ({ error: "That occurrence is not due", code: "occurrence_not_due" }),
      text: async () => JSON.stringify({ error: "That occurrence is not due" }),
    });
    render(<DueCard />);
    fireEvent.click(screen.getByTestId("due-skip-2"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByTestId("due-row-2")).toBeTruthy();
  });
});

describe("/transactions page", () => {
  it("puts the Due card above the workspace", () => {
    H.subs = [sub(1)];
    render(<Page />);
    const card = screen.getByTestId("due-card");
    const ws = screen.getByTestId("workspace");
    expect(card.compareDocumentPosition(ws) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows only the workspace when nothing is due", () => {
    render(<Page />);
    expect(screen.queryByTestId("due-card")).toBeNull();
    expect(screen.getByTestId("workspace")).toBeTruthy();
  });
});
