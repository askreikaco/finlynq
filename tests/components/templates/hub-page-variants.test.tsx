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

import { HubPage } from "@/components/templates/hub-page";

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

describe("HubPage variants: defaults", () => {
  it("default root className is the literal today's string", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    expect(screen.getByTestId("more-root").className).toBe(
      "w-full space-y-6 pb-[var(--form-bottom-pad)]",
    );
  });

  it("default look renders a SectionCard list and no card group", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    const main = screen.getByTestId("more-group-main");
    expect(main.querySelector('[data-slot="section-card-body"]')).not.toBeNull();
    expect(main.querySelector(".divide-y")).toBeNull();
    expect(main.getAttribute("data-slot")).toBe("hub-group");
    expect(screen.getByTestId("more-root").querySelector('[data-slot="hub-columns"]')).toHaveClass("grid", "grid-cols-1", "regular:grid-cols-2", "wide:grid-cols-3", "items-start");
  });

  it("section label is the shared card label", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    const main = screen.getByTestId("more-group-main");
    expect(main.querySelector('[data-slot="section-card-label"]')).not.toBeNull();
  });
});

describe("HubPage variants: look=card", () => {
  it("renders a SectionCard list with divider rows", () => {
    render(<HubPage id="settings" title="Settings" look="card" groups={groups} />);
    const main = screen.getByTestId("settings-group-main");
    const body = main.querySelector('[data-slot="section-card-body"]');
    expect(body).not.toBeNull();
    expect(body).toHaveClass("[&>*:not(:last-child)]:shadow-[var(--list-divider)]");
    expect(body!.className).not.toMatch(/divide-/);
    expect(main.querySelector('[data-slot="section-card"]')).toHaveClass("surface-card", "overflow-hidden");
  });

  it("link row carries the card row classes and href", () => {
    render(<HubPage id="settings" title="Settings" look="card" groups={groups} />);
    const row = screen.getByTestId("settings-row-inbox");
    expect(row.tagName).toBe("A");
    expect(row).toHaveAttribute("href", "/inbox");
    expect(row).toHaveClass("flex", "min-h-14", "items-center", "gap-3", "px-4", "py-3", "hover:bg-muted/50");
    expect(row).toHaveClass("focus-visible:ring-3", "focus-visible:ring-ring/50");
    expect(row).not.toHaveClass("active:bg-muted");
    expect(row.querySelector("span.bg-primary\\/10")).not.toBeNull();
    expect(row.querySelector("svg")).toHaveClass("size-4");
  });

  it("chevron shows for interactive rows and not for destructive rows", () => {
    render(<HubPage id="settings" title="Settings" look="card" chevronSize="5" groups={groups} />);
    const inbox = screen.getByTestId("settings-row-inbox");
    expect(inbox.querySelector("svg.size-5")).not.toBeNull();
    const logout = screen.getByTestId("settings-row-logout");
    expect(logout.querySelector("svg.size-5")).toBeNull();
    expect(logout.querySelector("svg.size-4")).toBeNull();
  });

  it("button row calls onClick and is disabled when disabled", () => {
    const onClick = vi.fn();
    render(
      <HubPage
        id="p"
        title="P"
        look="card"
        groups={[
          {
            id: "g",
            rows: [
              { id: "go", label: "Go", onClick },
              { id: "off", label: "Off", onClick, disabled: true },
            ],
          },
        ]}
      />,
    );
    const btn = screen.getByTestId("p-row-go");
    expect(btn.tagName).toBe("BUTTON");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("p-row-off")).toBeDisabled();
  });

  it("iconSize 18px renders size-[18px] icons", () => {
    render(<HubPage id="settings" title="Settings" look="card" iconSize="18px" groups={groups} />);
    expect(screen.getByTestId("settings-row-settings").querySelector("svg")).toHaveClass("size-[18px]");
  });

  it("activeBg adds active:bg-muted to link rows", () => {
    render(<HubPage id="settings" title="Settings" look="card" activeBg groups={groups} />);
    expect(screen.getByTestId("settings-row-inbox")).toHaveClass("active:bg-muted");
  });

  it("slot props set data-slot on group, row, icon and chevron", () => {
    render(
      <HubPage
        id="settings"
        title="Settings"
        look="card"
        groupSlot="settings-hub-group"
        rowSlot="settings-hub-row"
        iconSlot="settings-hub-icon"
        chevronSlot="settings-hub-chevron"
        groups={groups}
      />,
    );
    expect(screen.getByTestId("settings-group-main").getAttribute("data-slot")).toBe("settings-hub-group");
    const row = screen.getByTestId("settings-row-inbox");
    expect(row.getAttribute("data-slot")).toBe("settings-hub-row");
    expect(row.querySelector('[data-slot="settings-hub-icon"]')).not.toBeNull();
    expect(row.querySelector('[data-slot="settings-hub-chevron"]')).not.toBeNull();
  });

  it("renders value and badge in the card row", () => {
    render(
      <HubPage
        id="p"
        title="P"
        look="card"
        groups={[{ id: "g", rows: [{ id: "a", label: "Alpha", href: "/a", value: "Plan", badge: 3 }] }]}
      />,
    );
    const row = screen.getByTestId("p-row-a");
    expect(within(row).getByText("Plan")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
  });
});

describe("HubPage variants: description", () => {
  const described = [
    { id: "g", rows: [{ id: "op", label: "Buy", description: "Record a purchase", href: "/buy" }] },
  ];

  it("renders description under the label in the card look", () => {
    render(<HubPage id="p" title="P" look="card" groups={described} />);
    const row = screen.getByTestId("p-row-op");
    const label = within(row).getByText("Buy");
    expect(label).toHaveClass("block", "truncate", "text-base");
    expect(within(row).getByText("Record a purchase")).toHaveClass("block", "text-xs", "text-muted-foreground");
  });

  it("renders description under the label in the inset look too", () => {
    render(<HubPage id="p" title="P" groups={described} />);
    const row = screen.getByTestId("p-row-op");
    expect(within(row).getByText("Record a purchase")).toBeInTheDocument();
  });
});

describe("HubPage variants: section labels", () => {
  it("a titled group renders an uppercase h2 on the shared CardLabel row", () => {
    render(<HubPage id="settings" title="Settings" look="card" groups={groups} />);
    const h = within(screen.getByTestId("settings-group-main")).getByRole("heading", { name: "Main" });
    expect(h.tagName).toBe("H2");
    expect(h).toHaveClass("text-xs", "font-medium", "uppercase", "tracking-wide", "text-muted-foreground");
    // padding lives on the shared CardLabel row (same px as MetricCard)
    expect(h.closest('[data-slot="card-label"]')).toHaveClass("px-3", "@[11rem]:px-5");
  });

  it("no heading is rendered for an untitled group", () => {
    render(<HubPage id="p" title="P" groups={groups} />);
    expect(within(screen.getByTestId("p-group-tools")).queryByRole("heading")).toBeNull();
  });
});

describe("HubPage variants: layout", () => {
  it("groups sit in the 1 / 2 / 3 column grid (regular / wide), whatever `columns` says", () => {
    render(<HubPage id="p" title="P" columns="wide-2" groups={groups} />);
    const cols = screen.getByTestId("p-root").querySelector('[data-slot="hub-columns"]');
    expect(cols).toHaveClass("grid", "gap-6", "regular:grid-cols-2", "wide:grid-cols-3");
    expect(cols?.querySelectorAll('[data-slot="hub-group"]')).toHaveLength(2);
  });

  it("width form-report no longer caps the root (full width on desktop)", () => {
    render(<HubPage id="p" title="P" width="form-report" padBottom={false} groups={groups} />);
    const root = screen.getByTestId("p-root");
    expect(root.className).not.toMatch(/max-w-/);
  });

  it("padBottom false removes the form bottom pad", () => {
    render(<HubPage id="p" title="P" padBottom={false} groups={groups} />);
    expect(screen.getByTestId("p-root")).not.toHaveClass("pb-[var(--form-bottom-pad)]");
  });

  it("className is appended to the root", () => {
    render(<HubPage id="p" title="P" className="regular:p-6" groups={groups} />);
    expect(screen.getByTestId("p-root")).toHaveClass("regular:p-6");
  });

  it("back renders a back link to back.href", () => {
    render(<HubPage id="p" title="P" back={{ href: "/portfolio", label: "Portfolio" }} groups={groups} />);
    const link = screen.getByRole("link", { name: "Portfolio" });
    expect(link).toHaveAttribute("href", "/portfolio");
  });
});

describe("HubPage variants: redirect and suspense", () => {
  it("useRedirect returning true renders nothing", () => {
    const { container } = render(
      <HubPage id="p" title="P" groups={groups} useRedirect={() => true} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("useRedirect returning false renders the hub", () => {
    render(<HubPage id="p" title="P" groups={groups} useRedirect={() => false} />);
    expect(screen.getByTestId("p-root")).toBeInTheDocument();
  });

  it("outerSuspense renders the hub", () => {
    render(<HubPage id="p" title="P" outerSuspense groups={groups} />);
    expect(screen.getByTestId("p-root")).toBeInTheDocument();
  });
});
