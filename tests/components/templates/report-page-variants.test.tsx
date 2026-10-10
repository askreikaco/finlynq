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
  useSearchParams: () => new URLSearchParams(),
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
import type { LoadState } from "@/lib/forms/load-state";

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

function hookState(state: Partial<LoadState<Row>>): () => LoadState<Row> {
  return () => ({ status: "ready", retry: vi.fn(), ...state });
}

describe("ReportPage variants", () => {
  beforeEach(() => {
    useApiMock.mockClear();
    setApi({ data: { total: 1 } });
  });

  describe("defaults", () => {
    it("keeps the root className string identical to the pre-variant output", () => {
      render(
        <ReportPage id="d" title="D" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByTestId("d-root").className).toBe(
        "mx-auto w-full space-y-6 max-w-report pb-[var(--form-bottom-pad)]",
      );
    });

    it("keeps the default loading skeleton and passes the key with undefined opts", () => {
      setApi({ isLoading: true });
      render(
        <ReportPage id="d2" title="D" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(useApiMock).toHaveBeenLastCalledWith("/k", undefined);
    });
  });

  describe("title and subtitle", () => {
    it("renders a ReactNode title inside the h1", () => {
      render(
        <ReportPage id="t" title={<span data-testid="icon-title">Fire</span>} load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByRole("heading", { level: 1 }).querySelector('[data-testid="icon-title"]')).toBeTruthy();
    });

    it("renders a ReactNode subtitle", () => {
      render(
        <ReportPage id="s" title="S" subtitle={<em>as of today</em>} load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByText("as of today").tagName).toBe("EM");
    });
  });

  describe("width", () => {
    it("width doc uses max-w-doc and no max-w-report", () => {
      render(
        <ReportPage id="w1" title="W" width="doc" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      const cls = screen.getByTestId("w1-root").className;
      expect(cls).toContain("max-w-doc");
      expect(cls).not.toContain("max-w-report");
    });

    it("width none adds no max-width class", () => {
      render(
        <ReportPage id="w2" title="W" width="none" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      const cls = screen.getByTestId("w2-root").className;
      expect(cls).not.toMatch(/max-w-/);
      expect(cls).toContain("w-full");
    });
  });

  describe("center", () => {
    it("center false drops mx-auto but keeps w-full", () => {
      render(
        <ReportPage id="c" title="C" center={false} load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      const cls = screen.getByTestId("c-root").className;
      expect(cls).not.toContain("mx-auto");
      expect(cls).toContain("w-full");
    });
  });

  describe("padBottom", () => {
    it("padBottom false removes the form bottom padding", () => {
      render(
        <ReportPage id="p" title="P" padBottom={false} load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByTestId("p-root").className).not.toContain("pb-[var(--form-bottom-pad)]");
    });
  });

  describe("stack", () => {
    it("stack 5 uses space-y-5", () => {
      render(
        <ReportPage id="k5" title="K" stack="5" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      const cls = screen.getByTestId("k5-root").className;
      expect(cls).toContain("space-y-5");
      expect(cls).not.toContain("space-y-6");
    });

    it("stack 4-6 uses space-y-4 with regular:space-y-6", () => {
      render(
        <ReportPage id="k46" title="K" stack="4-6" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      const cls = screen.getByTestId("k46-root").className;
      expect(cls).toContain("space-y-4");
      expect(cls).toContain("regular:space-y-6");
      expect(cls).not.toMatch(/(^| )space-y-6( |$)/);
    });
  });

  describe("header passthrough", () => {
    it("renders header actions in the page header", () => {
      render(
        <ReportPage
          id="h1"
          title="H"
          header={{ actions: <button type="button">export-csv</button> }}
          load={{ key: "/k" }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByRole("button", { name: "export-csv" })).toBeTruthy();
    });

    it("renders a back link when header.backHref is given", () => {
      render(
        <ReportPage id="h2" title="H" header={{ backHref: "/settings", backLabel: "Settings" }} load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      const link = document.querySelector('a[href="/settings"]');
      expect(link).toBeTruthy();
    });

    it("header omitted renders the same markup as an empty header object", () => {
      const { container: a, unmount } = render(
        <ReportPage id="h3" title="H" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      const omitted = a.innerHTML;
      unmount();
      const { container: b } = render(
        <ReportPage id="h3" title="H" header={{}} load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(b.innerHTML).toBe(omitted);
    });
  });

  describe("states", () => {
    it("loadingChrome false renders the loading node bare (no root)", () => {
      setApi({ isLoading: true });
      render(
        <ReportPage
          id="lb"
          title="LB"
          load={{ key: "/k" }}
          states={{ loading: <p>bare-loading</p>, loadingChrome: false }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByText("bare-loading")).toBeTruthy();
      expect(screen.queryByTestId("lb-root")).toBeNull();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    });

    it("error chrome false renders the error bare (no root, retry still works)", () => {
      const mutate = vi.fn();
      setApi({ error: new Error("x"), mutate });
      render(
        <ReportPage
          id="eb"
          title="EB"
          load={{ key: "/k" }}
          states={{ error: { title: "Bare", chrome: false } }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.queryByTestId("eb-root")).toBeNull();
      expect(screen.getByRole("alert")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it("error chrome default keeps the root and header", () => {
      setApi({ error: new Error("x") });
      render(
        <ReportPage id="ec" title="EC" load={{ key: "/k" }}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByTestId("ec-root")).toBeTruthy();
      expect(screen.getByRole("heading", { level: 1, name: "EC" })).toBeTruthy();
    });

    it("empty action renders a button that calls onClick", () => {
      setApi({ data: { total: 0 } });
      const onClick = vi.fn();
      render(
        <ReportPage
          id="ea"
          title="EA"
          load={{ key: "/k" }}
          states={{
            isEmpty: (d: Row) => d.total === 0,
            empty: { title: "None", description: "Nothing", action: { label: "Add one", onClick } },
          }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Add one" }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("useLoad", () => {
    it("renders children from the hook record and skips useApi", () => {
      render(
        <ReportPage id="ul" title="UL" useLoad={hookState({ record: { total: 9 } })}>
          {(d: Row) => <p>hook total {d.total}</p>}
        </ReportPage>,
      );
      expect(screen.getByText("hook total 9")).toBeTruthy();
      expect(useApiMock).toHaveBeenCalledWith(null, undefined);
    });

    it("calls the hook with an empty route", () => {
      const spy = vi.fn(() => ({ status: "ready" as const, record: { total: 1 }, retry: () => undefined }));
      render(
        <ReportPage id="ur" title="UR" useLoad={spy}>
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(spy).toHaveBeenCalledWith({ params: {}, returnTo: "" });
    });

    it("shows the loading node while the hook is loading", () => {
      const children = vi.fn(() => <p>body</p>);
      render(
        <ReportPage
          id="ul2"
          title="UL2"
          useLoad={hookState({ status: "loading", record: undefined })}
          states={{ loading: <p>hook-loading</p> }}
        >
          {children}
        </ReportPage>,
      );
      expect(screen.getByText("hook-loading")).toBeTruthy();
      expect(children).not.toHaveBeenCalled();
    });

    it("shows the error with the hook retry", () => {
      const retry = vi.fn();
      render(
        <ReportPage
          id="ul3"
          title="UL3"
          useLoad={hookState({ status: "error", record: undefined, retry })}
          states={{ error: { title: "Hook failed" } }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByText("Hook failed")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it("shows the empty state for notFound and for isEmpty", () => {
      const { unmount } = render(
        <ReportPage
          id="ul4"
          title="UL4"
          useLoad={hookState({ status: "notFound", record: undefined })}
          states={{ empty: { title: "Gone", description: "No record" } }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByText("Gone")).toBeTruthy();
      unmount();

      const children = vi.fn(() => <p>body</p>);
      render(
        <ReportPage
          id="ul5"
          title="UL5"
          useLoad={hookState({ status: "ready", record: { total: 0 } })}
          states={{ isEmpty: (d: Row) => d.total === 0, empty: { title: "Zero", description: "Empty" } }}
        >
          {children}
        </ReportPage>,
      );
      expect(screen.getByText("Zero")).toBeTruthy();
      expect(children).not.toHaveBeenCalled();
    });

    it("renders bare loading and error from the hook when chrome is false", () => {
      const { unmount } = render(
        <ReportPage
          id="ul6"
          title="UL6"
          useLoad={hookState({ status: "loading", record: undefined })}
          states={{ loading: <p>bare-hook</p>, loadingChrome: false }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByText("bare-hook")).toBeTruthy();
      expect(screen.queryByTestId("ul6-root")).toBeNull();
      unmount();

      render(
        <ReportPage
          id="ul7"
          title="UL7"
          useLoad={hookState({ status: "error", record: undefined })}
          states={{ error: { chrome: false } }}
        >
          {() => <p>body</p>}
        </ReportPage>,
      );
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(screen.queryByTestId("ul7-root")).toBeNull();
    });
  });
});
