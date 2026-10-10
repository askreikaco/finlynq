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
      "mx-auto w-full space-y-6 max-w-section pb-[var(--form-bottom-pad)]",
    );
  });

  it("default look renders InsetGroup and no card group", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    const main = screen.getByTestId("more-group-main");
    expect(main.querySelector('[data-slot="inset-group"]')).not.toBeNull();
    expect(main.querySelector(".divide-y")).toBeNull();
    expect(main.getAttribute("data-slot")).toBe("hub-group");
    expect(screen.getByTestId("more-root").querySelector('[data-slot="hub-columns"]')).toBeNull();
  });

  it("default section label is the inset header", () => {
    render(<HubPage id="more" title="More" groups={groups} />);
    const main = screen.getByTestId("more-group-main");
    expect(main.querySelector('[data-slot="inset-section-header"]')).not.toBeNull();
    expect(main.querySelector('[data-slot="hub-section-label"]')).toBeNull();
  });
});

describe("HubPage variants: look=card", () => {
  it("renders a rounded card group with divider rows and no InsetGroup", () => {
    render(<HubPage id="settings" title="Settings" look="card" groups={groups} />);
    const main = screen.getByTestId("settings-group-main");
    const card = main.querySelector(".divide-y");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("divide-border/50", "overflow-hidden", "rounded-group", "bg-card");
    expect(main.querySelector('[data-slot="inset-group"]')).toBeNull();
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
  it("sectionLabel caps renders an uppercase h2", () => {
    render(<HubPage id="settings" title="Settings" look="card" sectionLabel="caps" groups={groups} />);
    const h = within(screen.getByTestId("settings-group-main")).getByRole("heading", { name: "Main" });
    expect(h.tagName).toBe("H2");
    expect(h).toHaveClass("px-4", "text-xs", "font-semibold", "uppercase", "tracking-wide", "text-muted-foreground");
  });

  it("sectionLabel section-label renders SectionLabel", () => {
    render(<HubPage id="p" title="P" look="card" sectionLabel="section-label" groups={groups} />);
    const main = screen.getByTestId("p-group-main");
    expect(main.querySelector('[data-slot="section-label"]')).toHaveTextContent("Main");
    expect(main.querySelector('[data-slot="inset-section-header"]')).toBeNull();
  });

  it("no heading is rendered for an untitled group under any style", () => {
    render(<HubPage id="p" title="P" sectionLabel="caps" groups={groups} />);
    expect(within(screen.getByTestId("p-group-tools")).queryByRole("heading")).toBeNull();
  });
});

describe("HubPage variants: layout", () => {
  it("columns wide-2 wraps the groups in a two-column grid", () => {
    render(<HubPage id="p" title="P" columns="wide-2" groups={groups} />);
    const cols = screen.getByTestId("p-root").querySelector('[data-slot="hub-columns"]');
    expect(cols).toHaveClass("grid", "gap-6", "wide:grid-cols-2");
    expect(cols?.querySelectorAll('[data-slot="hub-group"]')).toHaveLength(2);
  });

  it("width form-report sets max-w-form and wide:max-w-report, not max-w-section", () => {
    render(<HubPage id="p" title="P" width="form-report" padBottom={false} groups={groups} />);
    const root = screen.getByTestId("p-root");
    expect(root).toHaveClass("max-w-form", "wide:max-w-report");
    expect(root).not.toHaveClass("max-w-section");
  });

  it("padBottom false removes the form bottom pad", () => {
    render(<HubPage id="p" title="P" padBottom={false} groups={groups} />);
    expect(screen.getByTestId("p-root")).not.toHaveClass("pb-[var(--form-bottom-pad)]");
  });

  it("className is appended to the root", () => {
    render(<HubPage id="p" title="P" className="regular:p-6" groups={groups} />);
    expect(screen.getByTestId("p-root")).toHaveClass("regular:p-6", "max-w-section");
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
