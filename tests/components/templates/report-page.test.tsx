/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const apiState: { current: Record<string, unknown> } = { current: {} };
const useApiMock = vi.fn((_key: string | null, _opts?: unknown) => apiState.current);

vi.mock("@/lib/data/use-api", () => ({
  useApi: (key: string | null, opts?: unknown) => useApiMock(key, opts),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/reports",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("div", props, children),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

import { ReportPage } from "@/components/templates/report-page";

type Row = { total: number };

function setApi(state: Partial<{ data: unknown; error: unknown; isLoading: boolean; mutate: () => void }>) {
  apiState.current = {
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
    ...state,
  };
}

describe("ReportPage", () => {
  beforeEach(() => {
    useApiMock.mockClear();
    setApi({});
  });

  it("renders the root testid, the global header title and subtitle", () => {
    setApi({ data: { total: 1 } });
    render(
      <ReportPage id="reports" title="Reports" subtitle="Income and expenses" load={{ key: "/api/x" }}>
        {() => <p>body</p>}
      </ReportPage>,
    );
    expect(screen.getByTestId("reports-root")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Reports" })).toBeTruthy();
    expect(screen.getByText("Income and expenses")).toBeTruthy();
  });

  it("uses the report width token on the root", () => {
    setApi({ data: { total: 1 } });
    render(
      <ReportPage id="tax" title="Tax" load={{ key: "/api/tax" }}>
        {() => <p>body</p>}
      </ReportPage>,
    );
    expect(screen.getByTestId("tax-root").className).toContain("max-w-report");
  });

  it("renders the filters slot when given and omits it otherwise", () => {
    setApi({ data: { total: 1 } });
    const { unmount } = render(
      <ReportPage id="r1" title="R" filters={<div>period-filter</div>} load={{ key: "/k" }}>
        {() => <p>body</p>}
      </ReportPage>,
    );
    expect(screen.getByText("period-filter")).toBeTruthy();
    unmount();

    render(
      <ReportPage id="r2" title="R" load={{ key: "/k" }}>
        {() => <p>body</p>}
      </ReportPage>,
    );
    expect(document.querySelector('[data-slot="report-filters"]')).toBeNull();
  });

  it("passes the load key to useApi and skips the request for a null key", () => {
    setApi({ data: { total: 1 } });
    render(
      <ReportPage id="a" title="A" load={{ key: "/api/a" }}>
        {() => <p>body</p>}
      </ReportPage>,
    );
    expect(useApiMock).toHaveBeenLastCalledWith("/api/a", undefined);

    render(
      <ReportPage id="b" title="B" load={{ key: null }}>
        {() => <p>body</p>}
      </ReportPage>,
    );
    expect(useApiMock).toHaveBeenLastCalledWith(null, undefined);
  });

  it("shows the loading state and does not call children while loading", () => {
    setApi({ isLoading: true });
    const children = vi.fn(() => <p>body</p>);
    render(
      <ReportPage id="l" title="L" load={{ key: "/k" }} states={{ loading: <p>loading-now</p> }}>
        {children}
      </ReportPage>,
    );
    expect(screen.getByText("loading-now")).toBeTruthy();
    expect(children).not.toHaveBeenCalled();
  });

  it("shows an error with a retry that calls mutate", () => {
    const mutate = vi.fn();
    setApi({ error: new Error("boom"), mutate });
    const children = vi.fn(() => <p>body</p>);
    render(
      <ReportPage
        id="e"
        title="E"
        load={{ key: "/k" }}
        states={{ error: { title: "Nope", message: "Could not load" } }}
      >
        {children}
      </ReportPage>,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Nope")).toBeTruthy();
    expect(screen.getByText("Could not load")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(children).not.toHaveBeenCalled();
  });

  it("shows the empty state when isEmpty is true", () => {
    setApi({ data: { total: 0 } });
    const children = vi.fn(() => <p>body</p>);
    render(
      <ReportPage
        id="em"
        title="Em"
        load={{ key: "/k" }}
        states={{
          isEmpty: (d: Row) => d.total === 0,
          empty: { title: "Nothing yet", description: "Add a transaction" },
        }}
      >
        {children}
      </ReportPage>,
    );
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    expect(screen.getByText("Add a transaction")).toBeTruthy();
    expect(children).not.toHaveBeenCalled();
  });

  it("renders children with the loaded data", () => {
    setApi({ data: { total: 42 } });
    render(
      <ReportPage id="ok" title="Ok" load={{ key: "/k" }}>
        {(d: Row) => <p>total is {d.total}</p>}
      </ReportPage>,
    );
    expect(screen.getByText("total is 42")).toBeTruthy();
  });

  it("applies load.select to the response and treats an undefined pick as empty", () => {
    setApi({ data: { items: [{ total: 7 }] } });
    const { unmount } = render(
      <ReportPage
        id="sel"
        title="Sel"
        load={{ key: "/k", select: (raw: { items: Row[] }) => raw.items[0] }}
      >
        {(d: Row) => <p>picked {d.total}</p>}
      </ReportPage>,
    );
    expect(screen.getByText("picked 7")).toBeTruthy();
    unmount();

    setApi({ data: { items: [] } });
    render(
      <ReportPage
        id="sel2"
        title="Sel"
        load={{ key: "/k", select: (raw: { items: Row[] }) => raw.items[0] }}
        states={{ empty: { title: "No row", description: "Nothing matched" } }}
      >
        {(d: Row) => <p>picked {d.total}</p>}
      </ReportPage>,
    );
    expect(screen.getByText("No row")).toBeTruthy();
  });
});
