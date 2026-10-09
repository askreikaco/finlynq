/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ path: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

import {
  PageFab,
  PageFabProvider,
  usePageFab,
  useHidePageFab,
} from "@/components/mobile/page-fab";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function Registers({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  usePageFab("admin.announcements.new", onClick, { disabled });
  return null;
}

function Hider({ active }: { active: boolean }) {
  useHidePageFab(active);
  return null;
}

function renderAt(path: string, children?: React.ReactNode) {
  nav.path = path;
  return render(
    <PageFabProvider>
      {children}
      <PageFab />
    </PageFabProvider>,
  );
}

const fab = () => screen.queryByTestId("page-fab");

describe("PageFab: link results", () => {
  it("/dashboard links to /transactions/new as New transaction", () => {
    renderAt("/dashboard");
    const el = screen.getByTestId("page-fab");
    expect(el.tagName).toBe("A");
    expect(el.getAttribute("href")).toBe("/transactions/new");
    expect(el.getAttribute("aria-label")).toBe("New transaction");
  });

  it("/portfolio links to /settings/investments as Add holding", () => {
    renderAt("/portfolio");
    const el = screen.getByTestId("page-fab");
    expect(el.getAttribute("href")).toBe("/settings/investments");
    expect(el.getAttribute("aria-label")).toBe("Add holding");
  });

  it("/settings/backfill/abc links to /settings/backfill as New run", () => {
    renderAt("/settings/backfill/abc");
    const el = screen.getByTestId("page-fab");
    expect(el.getAttribute("href")).toBe("/settings/backfill");
    expect(el.getAttribute("aria-label")).toBe("New run");
    expect(el.getAttribute("data-fab-route")).toBe("/settings/backfill/[runId]");
  });
});

describe("PageFab: hidden and handler states", () => {
  it("renders nothing on /transactions/new and /chat", () => {
    renderAt("/transactions/new");
    expect(fab()).toBeNull();
    cleanup();
    renderAt("/chat");
    expect(fab()).toBeNull();
  });

  it("a handler page with nothing registered renders nothing", () => {
    renderAt("/admin/announcements");
    expect(fab()).toBeNull();
  });

  it("a registered handler renders a button that calls the spy", () => {
    const spy = vi.fn();
    renderAt("/admin/announcements", <Registers onClick={spy} />);
    const el = screen.getByRole("button", { name: "New announcement" });
    expect(el).toBe(screen.getByTestId("page-fab"));
    fireEvent.click(el);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("calls the latest onClick without re-registering", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderAt("/admin/announcements", <Registers onClick={first} />);
    rerender(
      <PageFabProvider>
        <Registers onClick={second} />
        <PageFab />
      </PageFabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "New announcement" }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("unmounting the registering child removes the button", () => {
    const { rerender } = renderAt("/admin/announcements", <Registers onClick={() => {}} />);
    expect(fab()).not.toBeNull();
    rerender(
      <PageFabProvider>
        <PageFab />
      </PageFabProvider>,
    );
    expect(fab()).toBeNull();
  });

  it("a disabled registration gives aria-disabled and does not call the spy", () => {
    const spy = vi.fn();
    renderAt("/admin/announcements", <Registers onClick={spy} disabled />);
    const el = screen.getByRole("button", { name: "New announcement" });
    expect(el.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(el);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("PageFab: hide signals", () => {
  it("useHidePageFab(true) hides the FAB; false shows it", () => {
    const { rerender } = renderAt("/dashboard", <Hider active />);
    expect(fab()).toBeNull();
    rerender(
      <PageFabProvider>
        <Hider active={false} />
        <PageFab />
      </PageFabProvider>,
    );
    expect(fab()).not.toBeNull();
  });

  it("an open dialog hides the FAB", async () => {
    renderAt("/dashboard");
    expect(fab()).not.toBeNull();
    const dialog = document.createElement("div");
    dialog.setAttribute("data-slot", "dialog-content");
    document.body.appendChild(dialog);
    await waitFor(() => expect(fab()).toBeNull());
    dialog.remove();
    await waitFor(() => expect(fab()).not.toBeNull());
  });

  it("focusing a text input hides the FAB; blur shows it again", () => {
    renderAt("/dashboard", <input aria-label="search" />);
    const input = screen.getByLabelText("search");
    fireEvent.focusIn(input);
    expect(fab()).toBeNull();
    fireEvent.focusOut(input);
    expect(fab()).not.toBeNull();
  });

  it("focusing a checkbox does not hide the FAB", () => {
    renderAt("/dashboard", <input type="checkbox" aria-label="pick" />);
    fireEvent.focusIn(screen.getByLabelText("pick"));
    expect(fab()).not.toBeNull();
  });
});

describe("PageFab: styling", () => {
  it("has the mobile-only, token and reduced-motion classes", () => {
    renderAt("/dashboard");
    const tokens = (screen.getByTestId("page-fab").getAttribute("class") ?? "").split(/\s+/);
    expect(tokens).toEqual(expect.arrayContaining(["md:hidden", "size-14", "rounded-full", "motion-safe:active:scale-95"]));
    expect(tokens).not.toContain("active:scale-95");
  });

  it("positions above the tab bar with the clearance var and the safe-area right inset", () => {
    renderAt("/dashboard");
    const style = screen.getByTestId("page-fab").getAttribute("style") ?? "";
    expect(style).toContain("--mobile-bar-clearance");
    expect(style).toContain("--sar");
  });
});
