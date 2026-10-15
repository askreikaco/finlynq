/**
 * @vitest-environment jsdom
 */
// Notice: the one message component. Variants, tones, roles and every optional part.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { resetSessionUserIdCache } from "@/lib/client/user-storage";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...props }, children),
}));

import { Notice } from "@/components/notice";

afterEach(cleanup);

describe("Notice: roles (a11y)", () => {
  it.each([
    ["danger", "alert"],
    ["warning", "alert"],
    ["info", "status"],
    ["success", "status"],
    ["neutral", "status"],
  ] as const)("inline %s -> role %s", (tone, role) => {
    const { getByRole } = render(<Notice tone={tone}>Body</Notice>);
    expect(getByRole(role).textContent).toContain("Body");
  });

  it("error variant is an alert; empty and skeleton have no live role", () => {
    const err = render(<Notice variant="error" />);
    expect(err.getByRole("alert")).toBeTruthy();
    cleanup();
    const empty = render(<Notice variant="empty" title="Nothing" />);
    expect(empty.queryByRole("alert")).toBeNull();
    expect(empty.queryByRole("status")).toBeNull();
    cleanup();
    const skel = render(<Notice variant="skeleton" />);
    expect(skel.queryByRole("alert")).toBeNull();
  });

  it("role can be forced or removed", () => {
    const a = render(<Notice tone="info" role="alert">x</Notice>);
    expect(a.getByRole("alert")).toBeTruthy();
    cleanup();
    const n = render(<Notice tone="danger" role="none">x</Notice>);
    expect(n.queryByRole("alert")).toBeNull();
  });
});

describe("Notice: optional parts", () => {
  it("title, body, icon and action show and hide", () => {
    const full = render(<Notice title="T" action={{ label: "Go", onClick: () => {} }}>B</Notice>);
    expect(full.getByText("T")).toBeTruthy();
    expect(full.getByText("B")).toBeTruthy();
    expect(full.getByText("Go").tagName).toBe("BUTTON");
    expect(full.container.querySelector("svg")).not.toBeNull();
    cleanup();
    const bare = render(<Notice icon={null}>B</Notice>);
    expect(bare.container.querySelector("svg")).toBeNull();
    expect(bare.container.querySelector("button")).toBeNull();
  });

  it("info puts the long help behind an (i) InfoTip, not in the flow", () => {
    const { getByRole, container } = render(<Notice title="T" info="Long help text">B</Notice>);
    expect(getByRole("button", { name: "More info" })).toBeTruthy();
    expect(container.textContent).not.toContain("Long help text");
  });

  it("action with href is a link; secondary action and busy state", () => {
    const { getByText } = render(
      <Notice title="T" action={{ label: "Open", href: "/x" }} secondaryAction={{ label: "Later", onClick: () => {} }} />,
    );
    expect(getByText("Open").getAttribute("href")).toBe("/x");
    expect(getByText("Later").tagName).toBe("BUTTON");
    cleanup();
    const busy = render(<Notice title="T" action={{ label: "Save", busy: true, onClick: () => {} }} />);
    expect((busy.getByText("Save") as HTMLButtonElement).disabled).toBe(true);
  });

  it("whole-notice link", () => {
    const { container } = render(<Notice variant="banner" href="/audit">Review</Notice>);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/audit");
  });

  it("dismissible hides the notice and calls onDismiss", () => {
    const onDismiss = vi.fn();
    const { getByRole, container } = render(<Notice dismissible dismissLabel="Close it" onDismiss={onDismiss}>B</Notice>);
    fireEvent.click(getByRole("button", { name: "Close it" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(container.innerHTML).toBe("");
  });

  it("error: retry button is 44px and calls retry; default copy", () => {
    const retry = vi.fn();
    const { getByText } = render(<Notice variant="error" retry={retry} />);
    expect(getByText("Something went wrong")).toBeTruthy();
    expect(getByText("We couldn't load this data. Please try again.")).toBeTruthy();
    fireEvent.click(getByText("Try again"));
    expect(retry).toHaveBeenCalledOnce();
    expect(getByText("Try again").className).toContain("min-h-11");
  });

  it("empty: custom icon, title, action", () => {
    const { getByText, container } = render(
      <Notice variant="empty" icon={Inbox} title="Nothing" action={{ label: "Add", href: "/add" }}>Add your first</Notice>,
    );
    expect(getByText("Nothing").tagName).toBe("H3");
    expect(getByText("Add").getAttribute("href")).toBe("/add");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("Notice: placement and pill", () => {
  it("floating placements are fixed and clear the tab bar / rail", () => {
    const start = render(<Notice variant="card" placement="bottom-start">B</Notice>);
    const el = start.container.querySelector('[data-slot="notice"]') as HTMLElement;
    expect(el.className).toContain("fixed");
    expect(el.className).toContain("bottom-[calc(var(--mobile-bar-clearance)-8px)]");
    expect(el.className).toContain("regular:left-[calc(5rem+var(--sal)+1rem)]");
    cleanup();
    const end = render(<Notice variant="banner" placement="bottom-end" pill>B</Notice>);
    const e2 = end.container.querySelector('[data-slot="notice"]') as HTMLElement;
    expect(e2.className).toContain("max-regular:bottom-[calc(var(--mobile-bar-clearance)+0.5rem)]");
    expect(e2.className).toContain("rounded-full");
    cleanup();
    const top = render(<Notice variant="banner" placement="top" pill testId="pill" role="status">B</Notice>);
    expect(top.getByTestId("pill").className).toContain("fixed");
  });

  it("never animates on mount (no motion classes)", () => {
    const { container } = render(<Notice variant="error" />);
    expect(container.innerHTML).not.toMatch(/animate-(in|fade|slide)|transition-opacity/);
  });
});

describe("Notice: dismissKey persistence (per user)", () => {
  beforeEach(() => {
    resetSessionUserIdCache();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ authenticated: true, userId: "u1" }) })));
  });

  it("stores the dismissal under <key>:<userId> and stays hidden next time", async () => {
    const first = render(<Notice dismissible dismissKey="pf-test-notice" dismissLabel="Close">Hello</Notice>);
    fireEvent.click(await first.findByRole("button", { name: "Close" }));
    expect(JSON.parse(localStorage.getItem("pf-test-notice:u1")!)).toContain("self");
    expect(localStorage.getItem("pf-test-notice")).toBeNull();
    cleanup();
    resetSessionUserIdCache();
    const again = render(<Notice dismissible dismissKey="pf-test-notice">Hello</Notice>);
    await waitFor(() => expect(localStorage.getItem("pf-test-notice:u1")).not.toBeNull());
    await new Promise((r) => setTimeout(r, 10));
    expect(again.container.innerHTML).toBe("");
  });

  it("items: each item dismisses on its own; all gone -> nothing renders", async () => {
    const { findByText, getAllByRole, container } = render(
      <Notice variant="card" dismissKey="pf-test-items" title="Tips" items={[{ id: "a", title: "First" }, { id: "b", title: "Second" }]} />,
    );
    await findByText("First");
    fireEvent.click(getAllByRole("button", { name: "Dismiss tip" })[0]);
    expect(container.textContent).not.toContain("First");
    expect(container.textContent).toContain("Second");
    expect(JSON.parse(localStorage.getItem("pf-test-items:u1")!)).toEqual(["a"]);
    fireEvent.click(getAllByRole("button", { name: "Dismiss tip" })[0]);
    expect(container.innerHTML).toBe("");
  });
});
