/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { Inbox, Settings } from "lucide-react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/more",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...r }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...r }, children),
}));

import { HubPage, groupsFromSurface } from "@/components/templates/hub-page";

afterEach(() => cleanup());

const groups = [
  {
    id: "main",
    title: "Main",
    rows: [
      { id: "inbox", label: "Inbox", href: "/inbox", icon: Inbox },
      { id: "logout", label: "Log out", onClick: vi.fn(), destructive: true },
    ],
  },
  {
    id: "tools",
    rows: [{ id: "settings", label: "Settings", href: "/settings", icon: Settings, value: "On" }],
  },
];

describe("HubPage", () => {
  it("renders the root testid, the global header title and the wrapper tokens", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    const root = screen.getByTestId("more-root");
    expect(root).toHaveClass("max-w-section");
    expect(root).toHaveClass("pb-[var(--form-bottom-pad)]");
    expect(within(root).getByRole("heading", { name: "More" })).toBeInTheDocument();
  });

  it("renders one InsetGroup per group, with a section header only when titled", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    const main = screen.getByTestId("more-group-main");
    expect(within(main).getByRole("heading", { name: "Main" })).toBeInTheDocument();
    expect(main.querySelector('[data-slot="inset-group"]')).not.toBeNull();
    const tools = screen.getByTestId("more-group-tools");
    expect(within(tools).queryByRole("heading")).toBeNull();
    expect(tools.querySelector('[data-slot="inset-group"]')).not.toBeNull();
  });

  it("renders link rows with href, value and testid, and keeps group order", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    const inbox = screen.getByTestId("more-row-inbox");
    expect(inbox.tagName).toBe("A");
    expect(inbox).toHaveAttribute("href", "/inbox");
    const settings = screen.getByTestId("more-row-settings");
    expect(settings).toHaveAttribute("href", "/settings");
    expect(within(settings).getByText("On")).toBeInTheDocument();

    const order = Array.from(screen.getByTestId("more-root").querySelectorAll('[data-slot="hub-group"]')).map(
      (el) => el.getAttribute("data-testid"),
    );
    expect(order).toEqual(["more-group-main", "more-group-tools"]);
  });

  it("renders button rows and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <HubPage
        id="more"
        title="More"
        groups={[{ id: "g", rows: [{ id: "logout", label: "Log out", onClick, destructive: true }] }]}
      />,
    );
    const btn = screen.getByTestId("more-row-logout");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("data-variant", "destructive");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders header before the groups and footer after them", () => {
    render(
      <HubPage
        id="account"
        title="Account"
        header={<div>Account card</div>}
        footer={<div>Footer note</div>}
        groups={groups}
      />,
    );
    const root = screen.getByTestId("account-root");
    const text = root.textContent ?? "";
    expect(text.indexOf("Account card")).toBeGreaterThan(-1);
    expect(text.indexOf("Account card")).toBeLessThan(text.indexOf("Inbox"));
    expect(text.indexOf("Footer note")).toBeGreaterThan(text.indexOf("Settings"));
  });

  it("shows the empty node only when there are no rows", () => {
    const { unmount } = render(
      <HubPage id="x" title="X" groups={[]} empty={<p>Nothing here</p>} />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    unmount();

    render(<HubPage id="x" title="X" groups={groups} empty={<p>Nothing here</p>} />);
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("derives groups from the nav registry surface and drops unknown paths and empty groups", () => {
    render(
      <HubPage
        id="settings"
        title="Settings"
        surface="settings"
        order={[
          { id: "prefs", title: "Preferences", paths: ["/settings/about", "/nope", "/settings/general"] },
          { id: "none", title: "Nothing", paths: ["/nope"] },
          { id: "sys", paths: ["/settings/developer"] },
        ]}
      />,
    );
    expect(screen.queryByTestId("settings-group-none")).toBeNull();
    const prefs = screen.getByTestId("settings-group-prefs");
    const hrefs = Array.from(prefs.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/settings/about", "/settings/general"]);
    expect(screen.getByTestId("settings-group-sys")).toBeInTheDocument();
  });

  it("groupsFromSurface keeps the given order and returns plain rows", () => {
    const built = groupsFromSurface("settings", [
      { id: "b", paths: ["/settings/general"] },
      { id: "a", title: "A", paths: ["/settings/about", "/settings/general"] },
    ]);
    expect(built.map((g) => g.id)).toEqual(["b", "a"]);
    expect(built[1].rows.map((r) => r.href)).toEqual(["/settings/about", "/settings/general"]);
    expect(built[1].rows[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), label: expect.any(String), href: "/settings/about" }),
    );
  });
});
