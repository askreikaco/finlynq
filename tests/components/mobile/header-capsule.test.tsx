/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Loader2, Plus, RefreshCw } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import {
  PageHeader,
  HeaderStatus,
  HEADER_MAX_PHONE_ACTIONS,
  HEADER_SECONDARY,
  PHONE_BAR,
  PHONE_BAR_RIGHT,
  PHONE_CAPSULE,
  PHONE_PRIMARY_CLASS,
} from "@/components/mobile/page-header";
import { Button } from "@/components/ui/button";

afterEach(cleanup);

const cls = (el: Element | null | undefined) => (el ? el.className.toString().split(/\s+/) : []);
const CAPSULE = '[data-slot="header-capsule"]';
const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf-8");
const PHONE = CSS.slice(CSS.indexOf("@media (width < 40rem) {"), CSS.indexOf("/* Mobile bottom tab bar"));

describe("header capsule: icon cells, status, the primary and overflow are ONE neutral capsule", () => {
  it("icon actions, a spinner, the primary and the overflow trigger render inside exactly one capsule, in that order", () => {
    const { container } = render(
      <PageHeader
        title="Goals"
        actions={[
          <Button key="r" variant="outline" size="icon" aria-label="Refresh"><RefreshCw /></Button>,
          <HeaderStatus key="s" label="Saving"><Loader2 className="animate-spin" /></HeaderStatus>,
          <Button key="p" aria-label="Add goal"><Plus /></Button>,
        ]}
        overflow={[{ label: "Export", onSelect: () => {} }]}
      />,
    );
    const capsules = container.querySelectorAll(CAPSULE);
    expect(capsules.length).toBe(1);
    const capsule = capsules[0];
    expect(capsule.querySelector('[role="status"]')).not.toBeNull();
    expect(capsule.querySelector('[aria-label="Refresh"]')).not.toBeNull();
    expect(capsule.querySelector('[data-slot="overflow-trigger"]')).not.toBeNull();
    // the primary is the last icon cell, just before the overflow trigger; no separate accent control exists
    const labels = Array.from(capsule.children).map((el) => el.getAttribute("aria-label") ?? el.getAttribute("data-slot"));
    expect(labels).toEqual(["Refresh", "Saving", "Add goal", "More actions"]);
    expect(container.querySelector('[data-slot="header-primary"]')).toBeNull();
    container.querySelectorAll("button, [role='status']").forEach((el) => {
      expect(el.closest(CAPSULE)).not.toBeNull();
    });
  });

  it("the capsule holds one 44px slot per cell: 3 icon cells (the primary counts) and the overflow trigger make 4 (11rem)", () => {
    const { container } = render(
      <PageHeader
        title="Goals"
        actions={[
          <Button key="r" variant="outline" size="icon" aria-label="Refresh"><RefreshCw /></Button>,
          <HeaderStatus key="s" label="Saving"><Loader2 className="animate-spin" /></HeaderStatus>,
          <Button key="p" aria-label="Add goal"><Plus /></Button>,
        ]}
        overflow={[{ label: "Export", onSelect: () => {} }]}
      />,
    );
    const capsule = container.querySelector(CAPSULE) as HTMLElement;
    expect(capsule.children.length).toBe(4);
    expect(cls(capsule)).toEqual(expect.arrayContaining(PHONE_CAPSULE.split(" ").filter((c) => c.startsWith("max-regular:"))));
    expect(cls(capsule)).toEqual(expect.arrayContaining(["max-regular:flex-nowrap", "max-regular:gap-0"]));
    expect(PHONE_CAPSULE).not.toContain("overflow-x-auto");
    expect(PHONE_CAPSULE).toContain("max-regular:max-w-[11rem]");
    expect(HEADER_MAX_PHONE_ACTIONS).toBe(3);
    expect((HEADER_MAX_PHONE_ACTIONS + 1) * 44).toBeLessThanOrEqual(11 * 16);
    expect(PHONE_BAR_RIGHT).not.toContain("overflow-x-auto");
    expect(PHONE_BAR_RIGHT).not.toContain("gap-2.5");
  });

  it("a spinner is never the primary action: the last real action keeps the filled circle", () => {
    const { container } = render(
      <PageHeader
        title="Goals"
        actions={[
          <Button key="p" aria-label="Add goal"><Plus /></Button>,
          <HeaderStatus key="s" label="Saving"><Loader2 className="animate-spin" /></HeaderStatus>,
        ]}
      />,
    );
    expect(cls(screen.getByRole("button", { name: "Add goal" }))).toContain(PHONE_PRIMARY_CLASS);
    const status = container.querySelector('[role="status"]');
    expect(cls(status)).not.toContain(PHONE_PRIMARY_CLASS);
    expect(status?.getAttribute("aria-label")).toBe("Saving");
    expect(status?.closest(CAPSULE)).not.toBeNull();
  });

  it("the status indicator is one 44px slot in the capsule", () => {
    const { container } = render(
      <PageHeader title="Goals" actions={<HeaderStatus label="Saving"><Loader2 className="animate-spin" /></HeaderStatus>} />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status?.closest(CAPSULE)).not.toBeNull();
    expect(cls(status)).toEqual(expect.arrayContaining(["size-11", "shrink-0"]));
    // CSS sizes any non-button capsule cell to 44px inside the phone block
    expect(PHONE).toMatch(/\[data-slot="header-capsule"\] > :not\(:is\(button, a\)\) \{\s*width: 2\.75rem;\s*min-width: 2\.75rem;\s*height: 2\.75rem;/);
  });

  it("a lone primary is the only cell of the capsule: a 44px neutral circle, never an accent fill", () => {
    const { container } = render(<PageHeader title="Budgets" actions={<Button aria-label="Add budget"><Plus /></Button>} />);
    const capsule = container.querySelector(CAPSULE) as HTMLElement;
    expect(capsule.children.length).toBe(1);
    const primary = screen.getByRole("button", { name: "Add budget" });
    expect(cls(primary)).toContain(PHONE_PRIMARY_CLASS);
    expect(primary.parentElement).toBe(capsule);
    const rule = PHONE.slice(PHONE.indexOf('[data-slot="header-capsule"] > :is(button, a).phone-icon-action {'));
    const block = rule.slice(0, rule.indexOf("}"));
    expect(block).toMatch(/background:\s*transparent;/);
    expect(block).toMatch(/font-size:\s*0;/);
    expect(block).not.toMatch(/var\(--primary\)/);
    expect(PHONE).not.toMatch(/header-primary/);
  });

  it("a lone overflow trigger is a capsule with one 44px cell (a circle)", () => {
    const { container } = render(<PageHeader title="Budgets" overflow={[{ label: "Export", onSelect: () => {} }]} />);
    const capsule = container.querySelector(CAPSULE) as HTMLElement;
    expect(capsule.children.length).toBe(1);
    expect(cls(capsule)).toEqual(expect.arrayContaining(["max-regular:h-11", "max-regular:rounded-full"]));
  });

  it("more than three secondary actions go to the overflow menu; phones see only the trigger and the primary", async () => {
    const secondaries = ["Export", "Import", "Archive", "Print"];
    const { container } = render(
      <PageHeader
        title="Accounts"
        actions={[
          ...secondaries.map((label) => (
            <Button key={label} variant="outline" className={HEADER_SECONDARY} aria-label={label}>{label}</Button>
          )),
          <Button key="p" aria-label="Add account">Add account</Button>,
        ]}
        overflow={secondaries.map((label) => ({ label, onSelect: () => {} }))}
      />,
    );
    const capsule = container.querySelector(CAPSULE) as HTMLElement;
    // phone-visible cells inside the capsule: the primary and the overflow trigger (the four secondaries are hidden below regular)
    const visible = Array.from(capsule.children).filter((el) => !cls(el).includes(HEADER_SECONDARY));
    expect(visible.length).toBe(2);
    expect(visible[0].getAttribute("aria-label")).toBe("Add account");
    expect(visible[1].getAttribute("data-slot")).toBe("overflow-trigger");
    secondaries.forEach((label) => expect(cls(screen.getByRole("button", { name: label }))).toContain(HEADER_SECONDARY));
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = within(await screen.findByRole("menu", undefined, { timeout: 5000 }));
    expect(menu.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(secondaries);
  });

  it("title column keeps its reserve: side tracks at least 44pt, title in the middle, the right group in the third column", () => {
    expect(PHONE_BAR).toContain("max-regular:grid-cols-[auto_minmax(0,1fr)_auto]");
    const { container } = render(
      <PageHeader
        title="Goals"
        subtitle="Savings targets"
        actions={[
          <Button key="r" variant="outline" size="icon" aria-label="Refresh"><RefreshCw /></Button>,
          <Button key="p" aria-label="Add goal"><Plus /></Button>,
        ]}
      />,
    );
    expect(cls(container.querySelector('[data-slot="page-header-title-block"]'))).toContain("max-regular:col-start-2");
    const group = container.querySelector('[data-slot="page-header-actions"]');
    expect(cls(group)).toContain("max-regular:col-start-3");
    expect(cls(group)).toContain("max-regular:justify-self-end");
  });

  it("at regular and up the primary keeps its text label; the glass is phone-only", () => {
    render(<PageHeader title="Budgets" actions={<Button>Add Budget</Button>} />);
    const primary = screen.getByRole("button", { name: "Add Budget" });
    expect(primary.textContent).toContain("Add Budget");
    expect(cls(primary.parentElement)).not.toContain("regular:hidden");
    expect(PHONE).toContain(".glass-capsule {");
    expect(PHONE_BAR).not.toMatch(/\bregular:glass/);
  });
});
