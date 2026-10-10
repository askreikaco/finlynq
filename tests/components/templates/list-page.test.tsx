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
vi.mock("@/lib/data/use-api", () => ({
  useApi: () => ({ data: api.data, error: api.error, mutate: api.mutate, isLoading: false }),
}));

const view: { mode: "cards" | "list" } = { mode: "cards" };
vi.mock("@/components/adaptive/view-mode", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/view-mode")>()),
  useViewModeState: () => ({ mode: view.mode, setMode: () => {}, pending: false }),
  ViewModeToggle: ({ viewKey }: { viewKey: string }) => <button data-testid="view-toggle">{`toggle-${viewKey}`}</button>,
}));

import { ListPage } from "@/components/templates/list-page";

interface Goal {
  id: number;
  name: string;
}

const GOALS: Goal[] = [
  { id: 1, name: "Emergency fund" },
  { id: 2, name: "Vacation" },
];

function baseProps() {
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
  view.mode = "cards";
  fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ListPage", () => {
  it("renders the root testid, header title and the primary Add link", () => {
    api.data = GOALS;
    const { container } = render(<ListPage<Goal> {...baseProps()} />);
    const root = screen.getByTestId("goals-root");
    expect(root).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Goals");
    const add = screen.getByRole("link", { name: "Add Goal" });
    expect(add.getAttribute("href")).toBe("/goals/new");
    expect(add.className).toContain("phone-icon-action");
  });

  it("omits the Add action when no add prop is given", () => {
    api.data = GOALS;
    const { add: _add, ...rest } = baseProps();
    void _add;
    render(<ListPage<Goal> {...rest} />);
    expect(screen.queryByRole("link", { name: "Add Goal" })).toBeNull();
  });

  it("shows the skeleton while loading", () => {
    const { container } = render(<ListPage<Goal> {...baseProps()} />);
    expect(screen.queryByText("cards-content")).toBeNull();
    expect(container.querySelector(".animate-shimmer")).toBeTruthy();
  });

  it("shows the error state with retry that re-fetches", () => {
    api.error = new Error("boom");
    render(<ListPage<Goal> {...baseProps()} error={{ title: "Nope" }} />);
    expect(screen.getByRole("alert").textContent).toContain("Nope");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(api.mutate).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state with its CTA and no views when there are no records", () => {
    api.data = [];
    render(<ListPage<Goal> {...baseProps()} summary={[{ label: "Total", value: 0 }]} />);
    expect(screen.getByText("No goals yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create goal" }).getAttribute("href")).toBe("/goals/new");
    expect(screen.queryByText("cards-content")).toBeNull();
    expect(screen.queryByText("Total")).toBeNull();
    expect(screen.queryByTestId("view-toggle")).toBeNull();
  });

  it("renders summary stat cards from a static list or a function of records", () => {
    api.data = GOALS;
    const { unmount } = render(
      <ListPage<Goal>
        {...baseProps()}
        summary={(records) => [{ label: "Count", value: records.length }]}
      />,
    );
    expect(screen.getByText("Count")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    unmount();

    render(<ListPage<Goal> {...baseProps()} summary={[{ label: "Static", value: 7 }]} />);
    expect(screen.getByText("Static")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("mounts only the selected view through DataView and shows the toggle", () => {
    api.data = GOALS;
    const { container, rerender } = render(<ListPage<Goal> {...baseProps()} />);
    expect(screen.getByTestId("view-toggle").textContent).toBe("toggle-goals");
    expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("cards");
    expect(screen.getByText("cards-content")).toBeTruthy();
    expect(screen.queryByText("list-content")).toBeNull();

    view.mode = "list";
    rerender(<ListPage<Goal> {...baseProps()} />);
    expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("list");
    expect(screen.getByText("list-content")).toBeTruthy();
    expect(screen.queryByText("cards-content")).toBeNull();
  });

  it("passes the loaded records and reload to view functions", () => {
    api.data = GOALS;
    const seen: number[] = [];
    render(
      <ListPage<Goal>
        {...baseProps()}
        cards={({ records, reload }) => {
          seen.push(records.length);
          return <button onClick={reload}>reload-me</button>;
        }}
      />,
    );
    expect(seen.at(-1)).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "reload-me" }));
    expect(api.mutate).toHaveBeenCalledTimes(1);
  });

  it("uses select to pick records out of the response", () => {
    api.data = { goals: GOALS };
    render(
      <ListPage<Goal, { goals: Goal[] }>
        {...baseProps()}
        load={{ key: "/api/x", select: (d) => d.goals }}
        cards={({ records }) => <p>{`n=${records.length}`}</p>}
      />,
    );
    expect(screen.getByText("n=2")).toBeTruthy();
  });

  it("deletes through deleteFlow: confirm, request, then reload; keeps dialog open on failure", async () => {
    api.data = GOALS;
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Locked" }), { status: 423 }));
    render(
      <ListPage<Goal>
        {...baseProps()}
        cards={({ openDelete }) => (
          <button onClick={() => openDelete(GOALS[0])}>delete-first</button>
        )}
        deleteFlow={{
          label: "Delete goal",
          confirmTitle: "Delete goal",
          describe: (g) => <span>{`Remove ${g.name}?`}</span>,
          request: (g) => fetch(`/api/goals?id=${g.id}`, { method: "DELETE" }),
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "delete-first" }));
    expect(screen.getByText("Remove Emergency fund?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/goals?id=1", { method: "DELETE" });
    expect(api.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Remove Emergency fund?")).toBeTruthy();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    fireEvent.click(screen.getByRole("button", { name: "Delete goal" }));
    await waitFor(() => expect(api.mutate).toHaveBeenCalledTimes(1));
  });

  it("closes the delete confirm on cancel without requesting", () => {
    api.data = GOALS;
    render(
      <ListPage<Goal>
        {...baseProps()}
        cards={({ openDelete }) => <button onClick={() => openDelete(GOALS[1])}>delete-second</button>}
        deleteFlow={{
          label: "Delete goal",
          confirmTitle: "Delete goal",
          describe: (g) => <span>{`Remove ${g.name}?`}</span>,
          request: (g) => fetch(`/api/goals?id=${g.id}`, { method: "DELETE" }),
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "delete-second" }));
    expect(screen.getByText("Remove Vacation?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Remove Vacation?")).toBeNull();
  });
});
