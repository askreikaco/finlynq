/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { draftFromSearchParams, draftSearchParams } from "@/app/(app)/subscriptions/_components/draft-params";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), search: "", id: "7" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: H.refresh }),
  useSearchParams: () => new URLSearchParams(H.search),
  useParams: () => ({ id: H.id }),
  usePathname: () => "/subscriptions",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/dropdown-order-provider", () => ({ useDropdownOrder: () => <T,>(items: T[]) => items }));
vi.mock("@/lib/hooks/useActiveCurrencies", () => ({ useActiveCurrencies: (c: string) => [c, "USD", "VND"] }));

import NewSubscriptionRoute from "@/app/(app)/subscriptions/new/page";
import EditSubscriptionRoute from "@/app/(app)/subscriptions/[id]/edit/page";
import SubscriptionsPage from "@/app/(app)/subscriptions/page";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let postStatus = 201;
let subs: Record<string, unknown>[] = [];
let recurring: Record<string, unknown>[] = [];

const SUB = {
  id: 7, name: "Netflix", amount: 15, currency: "USD", frequency: "monthly", status: "active",
  nextDate: "2026-11-01", categoryId: null, categoryName: null, accountId: 3, accountName: "Bank",
  cancelReminderDate: null, notes: "family plan", displayCurrency: "VND",
};

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  calls = [];
  postStatus = 201;
  subs = [SUB];
  recurring = [];
  H.search = "";
  H.id = "7";
  H.push.mockReset();
  H.replace.mockReset();
  H.refresh.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const m = init?.method ?? "GET";
      if (url === "/api/categories") return json([]);
      if (url === "/api/accounts") return json([{ id: 3, name: "Bank" }]);
      if (url === "/api/recurring") return json({ recurring });
      if (url === "/api/subscriptions" && m === "GET") return json(subs);
      if (url === "/api/subscriptions" && m === "POST") return json(postStatus === 201 ? { id: 99 } : { error: "Name taken" }, postStatus);
      if (url === "/api/subscriptions" && m === "PUT") return json({ id: 7 });
      if (url.startsWith("/api/subscriptions?id=") && m === "DELETE") return json({ ok: true });
      return json({}, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const callsTo = (method: string) => calls.filter((c) => c.url.startsWith("/api/subscriptions") && (c.init?.method ?? "GET") === method);
const body = (c: Call) => JSON.parse(String(c.init?.body));

describe("draft prefill from the query string (pure)", () => {
  it("accepts a well-formed detected payment", () => {
    const d = draftFromSearchParams(new URLSearchParams("name=Spotify&amount=9.99&currency=USD&frequency=monthly&nextDate=2026-11-02&accountId=3&categoryId=4"));
    expect(d).toMatchObject({ name: "Spotify", amount: "9.99", currency: "USD", frequency: "monthly", nextDate: "2026-11-02", accountId: "3", categoryId: "4" });
  });

  it("drops each malformed field to blank instead of seeding it", () => {
    const d = draftFromSearchParams(new URLSearchParams("name=X&amount=abc&currency=usd&frequency=nonsense&nextDate=2026-13-99&accountId=3;drop&categoryId=-1"));
    expect(d.amount).toBe("");
    expect(d.currency).toBe("");
    expect(d.frequency).toBe("monthly");
    expect(d.nextDate).toBe("");
    expect(d.accountId).toBe("");
    expect(d.categoryId).toBe("");
  });

  it("rejects a zero or negative amount", () => {
    expect(draftFromSearchParams(new URLSearchParams("amount=0")).amount).toBe("");
    expect(draftFromSearchParams(new URLSearchParams("amount=-4")).amount).toBe("");
  });

  it("the Review link carries the draft and a returnTo that round-trips", () => {
    const href = draftSearchParams({ name: "Gym", amount: "30", currency: "USD", frequency: "monthly", categoryId: "", accountId: "3", nextDate: "2026-11-05" }, "/subscriptions");
    expect(href.startsWith("/subscriptions/new?")).toBe(true);
    const sp = new URLSearchParams(href.split("?")[1]);
    expect(sp.get("name")).toBe("Gym");
    expect(sp.get("returnTo")).toBe("/subscriptions");
    expect(sp.has("categoryId")).toBe(false);
  });
});

describe("/subscriptions/new: create page", () => {
  it("renders a full page with label-left rows and no dialog", () => {
    const { container } = render(<NewSubscriptionRoute />);
    expect(screen.getByRole("heading", { level: 1, name: "New subscription" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect(screen.getByLabelText("Amount per payment")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add subscription" })).toBeTruthy();
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("prefills from a detected payment in the query string", () => {
    H.search = "name=Spotify&amount=9.99&currency=USD&frequency=weekly&nextDate=2026-11-02";
    render(<NewSubscriptionRoute />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Spotify");
    expect((screen.getByLabelText("Amount per payment") as HTMLInputElement).value).toBe("9.99");
    expect((screen.getByLabelText("Next payment") as HTMLInputElement).value).toBe("2026-11-02");
  });

  it("shows the name error and sends nothing when the name is blank", async () => {
    const { container } = render(<NewSubscriptionRoute />);
    fireEvent.change(screen.getByLabelText("Amount per payment"), { target: { value: "5" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText("Name is required")).toBeTruthy();
    expect(callsTo("POST")).toHaveLength(0);
  });

  it("shows the amount error for a non-positive amount", async () => {
    const { container } = render(<NewSubscriptionRoute />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gym" } });
    fireEvent.change(screen.getByLabelText("Amount per payment"), { target: { value: "0" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText("Amount must be greater than 0")).toBeTruthy();
    expect(callsTo("POST")).toHaveLength(0);
  });

  it("POSTs the same payload shape the old dialog sent (trimmed name, nulls for empty optionals)", async () => {
    const { container } = render(<NewSubscriptionRoute />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Gym  " } });
    fireEvent.change(screen.getByLabelText("Amount per payment"), { target: { value: "30" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(callsTo("POST")).toHaveLength(1));
    expect(body(callsTo("POST")[0])).toEqual({
      name: "Gym",
      amount: 30,
      currency: "VND",
      frequency: "monthly",
      categoryId: null,
      accountId: null,
      nextDate: null,
      notes: null,
      cancelReminderDate: null,
    });
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/subscriptions"));
  });

  it("keeps the input and shows the server error when the save is refused", async () => {
    postStatus = 409;
    const { container } = render(<NewSubscriptionRoute />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gym" } });
    fireEvent.change(screen.getByLabelText("Amount per payment"), { target: { value: "30" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText("Name taken")).toBeTruthy();
    expect(H.push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Gym");
  });

  it.each(["//evil.example", "https://evil.example", "javascript:alert(1)"])(
    "rejects an unsafe returnTo (%s) and falls back to /subscriptions",
    async (bad) => {
      H.search = `returnTo=${encodeURIComponent(bad)}`;
      const { container } = render(<NewSubscriptionRoute />);
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gym" } });
      fireEvent.change(screen.getByLabelText("Amount per payment"), { target: { value: "30" } });
      fireEvent.submit(container.querySelector("form")!);
      await waitFor(() => expect(H.push).toHaveBeenCalledWith("/subscriptions"));
      expect(H.push).not.toHaveBeenCalledWith(bad);
    },
  );
});

describe("/subscriptions/[id]/edit: edit page", () => {
  it("loads the subscription and PUTs it with the same payload shape", async () => {
    const { container } = render(<EditSubscriptionRoute />);
    expect(await screen.findByRole("heading", { level: 1, name: "Edit subscription" })).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Netflix");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Netflix Premium" } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(callsTo("PUT")).toHaveLength(1));
    const sent = body(callsTo("PUT")[0]);
    expect(sent.id).toBe(7);
    expect(sent.name).toBe("Netflix Premium");
    expect(sent.amount).toBe(15);
    expect(sent.currency).toBe("USD");
    expect(sent.accountId).toBe(3);
    expect(sent.notes).toBe("family plan");
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/subscriptions"));
  });

  it("deletes only through the overflow confirm dialog", async () => {
    render(<EditSubscriptionRoute />);
    await screen.findByRole("heading", { name: "Edit subscription" });
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete subscription/ }));
    expect(calls.some((c) => c.init?.method === "DELETE")).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: "Delete subscription" }));
    await waitFor(() => expect(H.push).toHaveBeenCalledWith("/subscriptions"));
    expect(calls.find((c) => c.init?.method === "DELETE")?.url).toBe("/api/subscriptions?id=7");
  });

  it("shows not-found for an unknown id", async () => {
    H.id = "404";
    render(<EditSubscriptionRoute />);
    expect(await screen.findByText("Subscription not found")).toBeTruthy();
  });
});

describe("/subscriptions list: navigation, not dialogs", () => {
  it("Add subscription navigates to /subscriptions/new", async () => {
    subs = [];
    render(<SubscriptionsPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "Add subscription" }))[0]);
    expect(H.push).toHaveBeenCalledWith("/subscriptions/new");
  });

  it("clicking a row navigates to its edit page with a validated returnTo", async () => {
    render(<SubscriptionsPage />);
    fireEvent.click(await screen.findByText("Netflix"));
    expect(H.push).toHaveBeenCalledWith("/subscriptions/7/edit?returnTo=%2Fsubscriptions");
  });

  it("Review on a detected payment navigates to /subscriptions/new with the draft in the query", async () => {
    recurring = [{
      payee: "Gym Club", avgAmount: -30, currency: "USD", frequency: "monthly", nextDate: "2026-08-05",
      lastDate: "2026-09-05", count: 3, accountId: 3, categoryId: null,
    }];
    render(<SubscriptionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(H.push).toHaveBeenCalledTimes(1);
    const href = String(H.push.mock.calls[0][0]);
    expect(href.startsWith("/subscriptions/new?")).toBe(true);
    const sp = new URLSearchParams(href.split("?")[1]);
    expect(sp.get("name")).toBe("Gym Club");
    expect(sp.get("amount")).toBe("30");
    expect(sp.get("returnTo")).toBe("/subscriptions");
  });
});
