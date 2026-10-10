/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "" as string }));
const api = vi.hoisted(() => ({
  state: {} as { data?: unknown; error?: unknown; isLoading?: boolean; mutate?: () => void },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/accounts/5",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

vi.mock("@/lib/data/use-api", () => ({
  useApi: () => ({ isLoading: false, mutate: vi.fn(), ...api.state }),
  prefetchApi: vi.fn(),
}));

import { DetailPage } from "@/components/templates/detail-page";

type Acct = { id: number; name: string };
const select = (list: Acct[]) => list.find((a) => a.id === 5);
const LOAD = { key: "/api/accounts", select };

afterEach(cleanup);
beforeEach(() => {
  nav.search = "";
  api.state = { data: [{ id: 5, name: "Checking" }], isLoading: false, error: undefined, mutate: vi.fn() };
});

describe("DetailPage", () => {
  it("renders the root testid, the title from the record and the sections", () => {
    render(
      <DetailPage<Acct[], Acct>
        id="account-detail"
        title={(rec) => rec.name}
        backFallback="/accounts"
        load={LOAD}
        sections={<p>Body section</p>}
      />,
    );
    expect(screen.getByTestId("account-detail-root")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Checking");
    expect(screen.getByText("Body section")).toBeTruthy();
    expect(document.querySelector('[data-slot="page-header"]')).not.toBeNull();
  });

  it("passes sections as a function of the record", () => {
    render(
      <DetailPage<Acct[], Acct>
        id="d"
        title="Fixed"
        backFallback="/accounts"
        load={LOAD}
        sections={(rec) => <p>Section for {rec.name}</p>}
      />,
    );
    expect(screen.getByText("Section for Checking")).toBeTruthy();
  });

  it("loading: renders the global PageHeader with the back fallback and a skeleton", () => {
    api.state = { data: undefined, isLoading: true };
    const { container } = render(
      <DetailPage<Acct[], Acct>
        id="d"
        title={(rec) => rec.name}
        placeholderTitle="Account"
        backFallback="/accounts"
        load={LOAD}
        sections={<p>Body</p>}
      />,
    );
    expect(screen.queryByText("Body")).toBeNull();
    expect(container.querySelector('[data-slot="page-header"]')).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Account");
    const back = container.querySelector('[data-slot="back-button"]') as HTMLAnchorElement | null;
    expect(back?.getAttribute("href")).toBe("/accounts");
    expect(container.querySelector(".animate-shimmer")).not.toBeNull();
  });

  it("error: shows ErrorState with a retry that calls mutate, and keeps the header", () => {
    const mutate = vi.fn();
    api.state = { data: undefined, isLoading: false, error: new Error("boom"), mutate };
    render(
      <DetailPage<Acct[], Acct>
        id="d"
        title={(rec) => rec.name}
        placeholderTitle="Account"
        backFallback="/accounts"
        load={LOAD}
        sections={<p>Body</p>}
      />,
    );
    expect(screen.getByText("Couldn't load this record")).toBeTruthy();
    expect(document.querySelector('[data-slot="page-header"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("not found: shows the not-found state with the global PageHeader", () => {
    api.state = { data: [], isLoading: false };
    render(
      <DetailPage<Acct[], Acct>
        id="d"
        title={(rec) => rec.name}
        placeholderTitle="Account"
        backFallback="/accounts"
        load={{ key: "/api/accounts", select, notFound: { title: "Account not found" } }}
        sections={<p>Body</p>}
      />,
    );
    expect(screen.getByText("Account not found")).toBeTruthy();
    expect(screen.queryByText("Body")).toBeNull();
    expect(document.querySelector('[data-slot="page-header"]')).not.toBeNull();
  });

  it("back: a valid returnTo wins over the fallback; an unsafe one falls back", () => {
    nav.search = "returnTo=%2Ftransactions%3Fx%3D1";
    const { container, unmount } = render(
      <DetailPage<Acct[], Acct> id="d" title="T" backFallback="/accounts" load={LOAD} sections={null} />,
    );
    expect(container.querySelector('[data-slot="back-button"]')?.getAttribute("href")).toBe("/transactions?x=1");
    unmount();

    nav.search = "returnTo=%2F%2Fevil.example";
    const second = render(
      <DetailPage<Acct[], Acct> id="d" title="T" backFallback="/accounts" load={LOAD} sections={null} />,
    );
    expect(second.container.querySelector('[data-slot="back-button"]')?.getAttribute("href")).toBe("/accounts");
  });

  it("actions and overflow reach the header: the overflow trigger is rendered", () => {
    render(
      <DetailPage<Acct[], Acct>
        id="d"
        title={(rec) => rec.name}
        backFallback="/accounts"
        load={LOAD}
        actions={(rec) => <button type="button">Edit {rec.name}</button>}
        overflow={[{ label: "Archive", onSelect: vi.fn() }]}
        sections={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Edit Checking" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More actions" })).toBeTruthy();
  });

  it("hides actions and overflow until the record loads", () => {
    api.state = { data: undefined, isLoading: true };
    render(
      <DetailPage<Acct[], Acct>
        id="d"
        title="T"
        backFallback="/accounts"
        load={LOAD}
        actions={<button type="button">Edit</button>}
        overflow={[{ label: "Archive" }]}
        sections={null}
      />,
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });
});
