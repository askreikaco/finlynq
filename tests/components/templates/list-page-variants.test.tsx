/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const api: { data: unknown; error: unknown; mutate: ReturnType<typeof vi.fn> } = {
  data: undefined,
  error: undefined,
  mutate: vi.fn(),
};
const apiKeys: Array<string | null> = [];
vi.mock("@/lib/data/use-api", () => ({
  useApi: (key: string | null) => {
    apiKeys.push(key);
    return { data: api.data, error: api.error, mutate: api.mutate, isLoading: false };
  },
}));

const view: { mode: "cards" | "list" } = { mode: "cards" };
vi.mock("@/components/adaptive/view-mode", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/view-mode")>()),
  useViewModeState: () => ({ mode: view.mode, setMode: () => {}, pending: false }),
  ViewModeToggle: ({ viewKey }: { viewKey: string }) => <button data-testid="view-toggle">{`toggle-${viewKey}`}</button>,
}));

import { ListPage, type ListPageProps } from "@/components/templates/list-page";
import type { LoadState } from "@/lib/forms/load-state";

interface Goal {
  id: number;
  name: string;
}

const GOALS: Goal[] = [
  { id: 1, name: "Emergency fund" },
  { id: 2, name: "Vacation" },
];

type Props = ListPageProps<Goal, Goal[], { tag: string }>;

function baseProps(): Props {
  return {
    id: "goals",
    title: "Goals",
    subtitle: "Track targets",
    add: { label: "Add Goal", href: "/goals/new" },
    viewKey: "goals" as const,
    load: { key: "/api/goals" },
    empty: { title: "No goals yet", body: "Start with one.", cta: { label: "Create goal", href: "/goals/new" } },
    cards: <p>cards-content</p>,
    list: <p>list-content</p>,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  api.data = undefined;
  api.error = undefined;
  api.mutate = vi.fn();
  apiKeys.length = 0;
  view.mode = "cards";
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ListPage variants: defaults unchanged", () => {
  it("root class is space-y-6 and header classes are today's literals", () => {
    api.data = GOALS;
    const { container } = render(<ListPage<Goal> {...baseProps()} />);
    expect(screen.getByTestId("goals-root").className).toBe("space-y-6");
    const headerRow = container.querySelector("h1")?.closest("div[class*='justify-between']");
    expect(headerRow?.className).toContain("flex flex-wrap items-center justify-between gap-3");
    expect(container.querySelector("[class*='contents']")).toBeTruthy();
    expect(screen.getByTestId("view-toggle")).toBeTruthy();
    expect(apiKeys).toEqual(["/api/goals"]);
  });
});

describe("ListPage variants: title and subtitle as ReactNode", () => {
  it("renders a ReactNode title and subtitle", () => {
    api.data = GOALS;
    const { container } = render(
      <ListPage<Goal>
        {...baseProps()}
        title={<span data-testid="fire-title">Fire</span>}
        subtitle={<em>Live</em>}
      />,
    );
    expect(container.querySelector("h1 [data-testid='fire-title']")).toBeTruthy();
    expect(container.querySelector("em")?.textContent).toBe("Live");
  });

  it("error default copy falls back to 'this list' for a non-string title", () => {
    api.error = new Error("boom");
    render(<ListPage<Goal> {...baseProps()} title={<span>Fire</span>} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load this list");
  });
});

describe("ListPage variants: useLoad", () => {
  it("uses the hook records, skips useApi, and passes extra in ctx", () => {
    const hook = vi.fn(
      (): LoadState<Goal[], { tag: string }> => ({
        status: "ready",
        record: GOALS,
        extra: { tag: "from-hook" },
        retry: () => {},
      }),
    );
    const seen: string[] = [];
    render(
      <ListPage<Goal, Goal[], { tag: string }>
        {...baseProps()}
        load={undefined}
        useLoad={hook}
        cards={({ records, extra }) => {
          seen.push(`${records.length}:${extra?.tag}`);
          return <p>hook-cards</p>;
        }}
      />,
    );
    expect(hook).toHaveBeenCalled();
    expect(apiKeys.every((k) => k === null)).toBe(true);
    expect(seen.at(-1)).toBe("2:from-hook");
    expect(screen.getByText("hook-cards")).toBeTruthy();
  });

  it("shows the skeleton while the hook is loading and the error state with its retry", () => {
    const retry = vi.fn();
    const { unmount, container } = render(
      <ListPage<Goal, Goal[], { tag: string }>
        {...baseProps()}
        useLoad={() => ({ status: "loading", retry })}
      />,
    );
    expect(container.querySelector(".animate-shimmer")).toBeTruthy();
    expect(screen.queryByText("cards-content")).toBeNull();
    unmount();

    render(
      <ListPage<Goal, Goal[], { tag: string }>
        {...baseProps()}
        error={{ title: "Nope" }}
        useLoad={() => ({ status: "error", retry })}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("Nope");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state for a ready hook with no records", () => {
    render(
      <ListPage<Goal, Goal[], { tag: string }>
        {...baseProps()}
        useLoad={() => ({ status: "ready", record: [], retry: () => {} })}
      />,
    );
    expect(screen.getByText("No goals yet")).toBeTruthy();
  });
});

describe("ListPage variants: loading and skeleton", () => {
  it("loadingNode replaces the skeleton", () => {
    const { container } = render(
      <ListPage<Goal> {...baseProps()} loadingNode={<p>custom-loader</p>} />,
    );
    expect(screen.getByText("custom-loader")).toBeTruthy();
    expect(container.querySelector(".animate-shimmer")).toBeNull();
  });

  it("skeletonRows sets the list skeleton row count", () => {
    const { container } = render(
      <ListPage<Goal> {...baseProps()} skeleton="list" skeletonRows={5} />,
    );
    expect(container.querySelectorAll(".h-16").length).toBe(5);
  });

  it("states.loading.chrome false renders the skeleton bare (no root)", () => {
    const { container } = render(
      <ListPage<Goal> {...baseProps()} states={{ loading: { chrome: false } }} />,
    );
    expect(screen.queryByTestId("goals-root")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector(".animate-shimmer")).toBeTruthy();
  });

  it("states.error.chrome false renders the error bare (no root, alert kept)", () => {
    api.error = new Error("boom");
    render(<ListPage<Goal> {...baseProps()} states={{ error: { chrome: false } }} />);
    expect(screen.queryByTestId("goals-root")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("ListPage variants: summary, empty, body slots", () => {
  it("summarySlot replaces the MetricGrid", () => {
    api.data = GOALS;
    render(
      <ListPage<Goal>
        {...baseProps()}
        summary={[{ label: "Static", value: 7 }]}
        summarySlot={(records) => <p>{`slot-${records.length}`}</p>}
      />,
    );
    expect(screen.getByText("slot-2")).toBeTruthy();
    expect(screen.queryByText("Static")).toBeNull();
  });

  it("emptySlot replaces the dashed card and receives ctx", () => {
    api.data = [];
    const seen = vi.fn();
    render(
      <ListPage<Goal>
        {...baseProps()}
        emptySlot={(ctx) => {
          seen(ctx.records.length, typeof ctx.openDelete, typeof ctx.reload);
          return <p>custom-empty</p>;
        }}
      />,
    );
    expect(screen.getByText("custom-empty")).toBeTruthy();
    expect(screen.queryByText("No goals yet")).toBeNull();
    expect(seen).toHaveBeenCalledWith(0, "function", "function");
  });

  it("body replaces ViewModeToggle and DataView", () => {
    api.data = GOALS;
    const { container } = render(
      <ListPage<Goal> {...baseProps()} body={({ records }) => <p>{`grouped-${records.length}`}</p>} />,
    );
    expect(screen.getByText("grouped-2")).toBeTruthy();
    expect(screen.queryByTestId("view-toggle")).toBeNull();
    expect(container.querySelector("[data-view]")).toBeNull();
    expect(screen.queryByText("cards-content")).toBeNull();
  });
});

describe("ListPage variants: toolbarPlacement", () => {
  it("row (default) keeps the toolbar left and the toggle right in one justify-between row", () => {
    api.data = GOALS;
    render(<ListPage<Goal> {...baseProps()} toolbar={<span>filter-x</span>} />);
    const toggle = screen.getByTestId("view-toggle");
    const row = toggle.parentElement;
    expect(row?.className).toContain("justify-between");
    expect(row?.textContent).toContain("filter-x");
  });

  it("end right-aligns the toolbar and toggle", () => {
    api.data = GOALS;
    render(<ListPage<Goal> {...baseProps()} toolbar={<span>filter-y</span>} toolbarPlacement="end" />);
    const row = screen.getByTestId("view-toggle").parentElement;
    expect(row?.className).toContain("justify-end");
    expect(row?.textContent).toContain("filter-y");
  });

  it("none renders no toolbar and no toggle", () => {
    api.data = GOALS;
    render(<ListPage<Goal> {...baseProps()} toolbar={<span>filter-z</span>} toolbarPlacement="none" />);
    expect(screen.queryByTestId("view-toggle")).toBeNull();
    expect(screen.queryByText("filter-z")).toBeNull();
    expect(screen.getByText("cards-content")).toBeTruthy();
  });
});

describe("ListPage variants: header, stack", () => {
  it("header.actions replaces the Add button; null hides it", () => {
    api.data = GOALS;
    const { unmount } = render(
      <ListPage<Goal> {...baseProps()} header={{ actions: <button>custom-action</button> }} />,
    );
    expect(screen.getByRole("button", { name: "custom-action" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add Goal" })).toBeNull();
    unmount();

    render(<ListPage<Goal> {...baseProps()} header={{ actions: null }} />);
    expect(screen.queryByRole("link", { name: "Add Goal" })).toBeNull();
  });

  it("header.className and actionsClassName override the defaults", () => {
    api.data = GOALS;
    const { container } = render(
      <ListPage<Goal> {...baseProps()} header={{ className: "my-header", actionsClassName: "my-actions" }} />,
    );
    expect(container.querySelector(".my-header")).toBeTruthy();
    expect(container.querySelector(".my-actions")).toBeTruthy();
  });

  it("stack 5 and 4 set the root gap class", () => {
    api.data = GOALS;
    const { unmount } = render(<ListPage<Goal> {...baseProps()} stack="5" />);
    expect(screen.getByTestId("goals-root").className).toBe("space-y-5");
    unmount();
    render(<ListPage<Goal> {...baseProps()} stack="4" />);
    expect(screen.getByTestId("goals-root").className).toBe("space-y-4");
  });
});

describe("ListPage variants: deleteFlow options", () => {
  const withDelete = (extra: Partial<NonNullable<Props["deleteFlow"]>>): Props => ({
    ...baseProps(),
    cards: ({ openDelete }) => <button onClick={() => openDelete(GOALS[0])}>delete-first</button>,
    deleteFlow: {
      label: "Delete goal",
      confirmTitle: "Delete goal",
      describe: (g) => <span>{`Remove ${g.name}?`}</span>,
      request: (g) => fetch(`/api/goals?id=${g.id}`, { method: "DELETE" }),
      ...extra,
    },
  });

  it("keepOpenOnError false closes the confirm on failure", async () => {
    api.data = GOALS;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Locked" }), { status: 423 }));
    render(<ListPage<Goal> {...withDelete({ keepOpenOnError: false })} />);
    fireEvent.click(screen.getByRole("button", { name: "delete-first" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(screen.queryByText("Remove Emergency fund?")).toBeNull());
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it("ignoreStatus true treats a 423 response as success and reloads", async () => {
    api.data = GOALS;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 423 }));
    render(<ListPage<Goal> {...withDelete({ ignoreStatus: true })} />);
    fireEvent.click(screen.getByRole("button", { name: "delete-first" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
  });

  it("errorMessage shows fixed copy on failure", async () => {
    api.data = GOALS;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Locked" }), { status: 423 }));
    render(<ListPage<Goal> {...withDelete({ errorMessage: "Fixed copy" })} />);
    fireEvent.click(screen.getByRole("button", { name: "delete-first" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Fixed copy"));
  });

  it("errorStyle inline drops the mt-2 spacing on the alert", async () => {
    api.data = GOALS;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Locked" }), { status: 423 }));
    render(<ListPage<Goal> {...withDelete({ errorStyle: "inline" })} />);
    fireEvent.click(screen.getByRole("button", { name: "delete-first" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(screen.getByRole("alert").className).not.toContain("mt-2"));
  });

  it("default error style keeps mt-2", async () => {
    api.data = GOALS;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Locked" }), { status: 423 }));
    render(<ListPage<Goal> {...withDelete({})} />);
    fireEvent.click(screen.getByRole("button", { name: "delete-first" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(screen.getByRole("alert").className).toContain("mt-2"));
  });
});
