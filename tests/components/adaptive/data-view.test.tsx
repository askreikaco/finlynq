/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SizeClass } from "@/components/ui/size-class";

const size: { current: SizeClass } = { current: "compact" };
const session: { userId: string | null; ready: boolean } = { userId: null, ready: true };

vi.mock("@/components/adaptive/size-class-context", async (orig) => ({
  ...(await orig<typeof import("@/components/adaptive/size-class-context")>()),
  useAppSizeClass: () => size.current,
}));
vi.mock("@/lib/client/user-storage", async (orig) => ({
  ...(await orig<typeof import("@/lib/client/user-storage")>()),
  useSessionUserId: () => ({ userId: session.userId, ready: session.ready }),
}));

import { DataView } from "@/components/adaptive/data-view";
import { ViewModeToggle } from "@/components/adaptive/view-mode";

let uid = 0;
beforeEach(() => {
  localStorage.clear();
  uid += 1;
  size.current = "compact";
  session.userId = `dv-user-${uid}`;
  session.ready = true;
});
afterEach(() => cleanup());

describe("DataView", () => {
  it("mounts only the selected view and wraps it in data-view", () => {
    const { container } = render(
      <DataView viewKey="accounts" cards={<p>card-content</p>} list={<p>list-content</p>} />,
    );
    const wrap = container.querySelector("[data-view]");
    expect(wrap?.getAttribute("data-view")).toBe("cards");
    expect(screen.getByText("card-content")).toBeTruthy();
    expect(screen.queryByText("list-content")).toBeNull();
  });

  it("shows the list view when the default is list (transactions at wide)", () => {
    size.current = "wide";
    const { container } = render(
      <DataView viewKey="transactions" cards={<p>card-content</p>} list={<p>list-content</p>} />,
    );
    expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("list");
    expect(screen.getByText("list-content")).toBeTruthy();
    expect(screen.queryByText("card-content")).toBeNull();
  });

  it("switches views with the toggle and never mounts both at once", () => {
    size.current = "regular";
    const { container } = render(
      <>
        <ViewModeToggle viewKey="transactions" />
        <DataView viewKey="transactions" cards={<p>card-content</p>} list={<p>list-content</p>} />
      </>,
    );
    expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("list");
    fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
    expect(container.querySelector("[data-view]")?.getAttribute("data-view")).toBe("cards");
    expect(screen.getByText("card-content")).toBeTruthy();
    expect(screen.queryByText("list-content")).toBeNull();
    expect(container.querySelectorAll("[data-view]")).toHaveLength(1);
  });

  it("does not call the lazy function of an unmounted view", () => {
    const cardsFn = vi.fn(() => <p>card-content</p>);
    const listFn = vi.fn(() => <p>list-content</p>);
    size.current = "compact";
    render(<DataView viewKey="accounts" cards={cardsFn} list={listFn} />);
    // cardsFn may run on several renders (store updates); the point is listFn never runs.
    expect(cardsFn).toHaveBeenCalled();
    expect(listFn).not.toHaveBeenCalled();
    expect(screen.getByText("card-content")).toBeTruthy();
  });

  it("calls the lazy list function only when list is selected", () => {
    const cardsFn = vi.fn(() => <p>card-content</p>);
    const listFn = vi.fn(() => <p>list-content</p>);
    size.current = "wide";
    render(<DataView viewKey="accounts" cards={cardsFn} list={listFn} />);
    expect(listFn).toHaveBeenCalled();
    expect(cardsFn).not.toHaveBeenCalled();
    expect(screen.getByText("list-content")).toBeTruthy();
  });

  it("accepts plain nodes and render functions for either view", () => {
    render(<DataView viewKey="goals" cards={() => <p>fn-cards</p>} list={<p>node-list</p>} />);
    expect(screen.getByText("fn-cards")).toBeTruthy();
    expect(screen.queryByText("node-list")).toBeNull();
  });
});
