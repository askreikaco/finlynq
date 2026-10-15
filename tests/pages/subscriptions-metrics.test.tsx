/**
 * @vitest-environment jsdom
 */
// /subscriptions metric cards: the shared Card (sparkline + % badge + "+$X vs last month"), frequency groups
// and the offline path (no series = value only).
import * as React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const H = vi.hoisted(() => ({ search: "" }));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: "u1", ready: true }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({}),
  usePathname: () => "/",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD" }) }));
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));
vi.mock("@/lib/utils/date", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/date")>()), localDateISO: () => "2026-10-14" }));

vi.mock("@/components/sparkline", () => ({
  Sparkline: ({ data }: { data: number[] }) => <div data-spark={data.length} />,
}));

import SubscriptionsPage from "@/app/(app)/subscriptions/page";

const sub = (o: Record<string, unknown>) => ({
  id: 1, name: "Netflix", amount: 10, currency: "USD", frequency: "monthly", status: "active", nextDate: "2026-10-20",
  categoryId: null, categoryName: null, accountId: 1, accountName: "Bank", cancelReminderDate: null, notes: "",
  displayCurrency: "USD", displayAmount: 10, ...o,
});
const SUBS = [
  sub({}),
  sub({ id: 2, name: "Adobe", amount: 120, displayAmount: 120, frequency: "annual", nextDate: "2027-03-05" }),
  sub({ id: 3, name: "Old mag", status: "cancelled" }),
];
const SERIES = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((month, i) => ({
  month, monthly: 10 + i, annual: (10 + i) * 12, active: 1 + (i > 2 ? 1 : 0), dueSoon: 10 + i, dueSoonCount: 1,
}));
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

function stub(series: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/subscriptions/series")) return series === "fail" ? { ok: false, status: 500, json: async () => ({}) } : json({ displayCurrency: "USD", series });
    if (url.startsWith("/api/subscriptions")) return json(SUBS);
    if (url.startsWith("/api/recurring")) return json({ recurring: [] });
    return json([]);
  }));
}
beforeEach(() => { localStorage.clear(); H.search = ""; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("/subscriptions metric cards", () => {
  it("every summary card is the shared Card with a sparkline, % badge and a signed delta vs last month", async () => {
    stub(SERIES);
    const { container } = render(<SubscriptionsPage />);
    const grid = await waitFor(() => {
      const g = container.querySelector("[data-slot=metric-grid]");
      if (!g) throw new Error("no grid");
      return g;
    });
    for (const id of ["monthly", "yearly", "due-soon", "active"]) {
      await waitFor(() => expect(container.querySelector(`[data-testid=metric-${id}] [data-spark]`)).toBeTruthy());
    }
    expect(grid.querySelectorAll("[data-testid^=metric-]").length).toBe(4);
    // Series: 16 now vs 15 last month = +$1.00 (Per month and Due in next 30 days)
    expect((await screen.findAllByText(/^\+\$1\.00 vs last month$/)).length).toBeGreaterThanOrEqual(1);
  });

  it("offline / no series: value only, no chart, no invented delta", async () => {
    stub("fail");
    const { container } = render(<SubscriptionsPage />);
    expect(await screen.findByText("Per month")).toBeTruthy();
    expect(screen.getAllByText("No earlier history to compare").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector("[data-testid=metric-monthly] [data-spark]")).toBeNull();
  });

  it("the list is grouped by frequency; a cancelled row stays in its group with a badge", async () => {
    stub(SERIES);
    render(<SubscriptionsPage />);
    expect(await screen.findByText(/^Monthly \(2\)/)).toBeTruthy();
    expect(screen.getByText(/^Yearly \(1\)/)).toBeTruthy();
    expect(screen.queryByText(/^Active \(/)).toBeNull();
    expect(screen.getByText("Cancelled")).toBeTruthy();
  });
});
