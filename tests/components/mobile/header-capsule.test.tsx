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
const PHONE = CSS.slice(CSS.indexOf("/* iOS 26-style liquid glass"), CSS.indexOf("/* Mobile bottom tab bar"));

describe("header capsule: secondary cells + overflow are ONE neutral capsule on the left; the primary is a separate yellow button on the right", () => {
  it("icon actions, a spinner and the overflow trigger render in one capsule; the primary follows it as its own control", () => {
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
    expect(labels).toEqual(["Refresh", "Saving", "More actions"]);
    expect(container.querySelector('[data-slot="header-primary"]')).toBeNull();
    // ordering + separation: [capsule][primary] in the DOM (left to right), a small gap between the two controls
    const group = container.querySelector('[data-slot="page-header-actions"]') as HTMLElement;
    const primary = screen.getByRole("button", { name: "Add goal" });
    expect(Array.from(group.children)).toEqual([capsule, primary]);
    expect(primary.closest(CAPSULE)).toBeNull();
    expect(cls(group)).toContain("gap-2");
    // yellow/accent: the shared header-save rule (primary fill) covers .phone-icon-action
    expect(PHONE).toContain('[data-slot="page-header-actions"] > :is(.header-save, .phone-icon-action) {');
    expect(PHONE).toMatch(/:is\(\.header-save, \.phone-icon-action\) \{[^}]*background: var\(--primary\);/);
  });

  it("the capsule holds one 44px slot per cell: 2 icon cells and the overflow trigger make 3; the cap still bounds it (11rem)", () => {
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
    expect(capsule.children.length).toBe(3);
    expect(cls(capsule)).toEqual(expect.arrayContaining(PHONE_CAPSULE.split(" ").filter((c) => c.startsWith(""))));
    expect(cls(capsule)).toEqual(expect.arrayContaining(["flex-nowrap", "gap-0"]));
    expect(PHONE_CAPSULE).not.toContain("overflow-x-auto");
    expect(PHONE_CAPSULE).toContain("max-w-[11rem]");
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

  it("a lone primary is just the yellow round button: no capsule", () => {
    const { container } = render(<PageHeader title="Budgets" actions={<Button aria-label="Add budget"><Plus /></Button>} />);
    expect(container.querySelector(CAPSULE)).toBeNull();
    const primary = screen.getByRole("button", { name: "Add budget" });
    expect(cls(primary)).toContain(PHONE_PRIMARY_CLASS);
    expect(primary.parentElement).toBe(container.querySelector('[data-slot="page-header-actions"]'));
    const rule = PHONE.slice(PHONE.indexOf('[data-slot="page-header-actions"] > :is(.header-save, .phone-icon-action) {'));
    const block = rule.slice(0, rule.indexOf("}"));
    expect(block).toMatch(/background:\s*var\(--primary\);/);
    expect(block).toMatch(/width:\s*2\.75rem;/);
    expect(block).toMatch(/font-size:\s*0;/);
    expect(PHONE).not.toMatch(/header-primary/);
  });

  it("a lone overflow trigger is a capsule with one 44px cell (a circle)", () => {
    const { container } = render(<PageHeader title="Budgets" overflow={[{ label: "Export", onSelect: () => {} }]} />);
    const capsule = container.querySelector(CAPSULE) as HTMLElement;
    expect(capsule.children.length).toBe(1);
    expect(cls(capsule)).toEqual(expect.arrayContaining(["h-11", "rounded-full"]));
  });

  it("more than three secondary actions go to the overflow menu; phones see only the overflow trigger (left) and the primary (right)", async () => {
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
    // phone-visible cells inside the capsule: only the overflow trigger (the four secondaries are hidden below regular)
    const visible = Array.from(capsule.children).filter((el) => !cls(el).includes("header-secondary"));
    expect(visible.length).toBe(1);
    expect(visible[0].getAttribute("data-slot")).toBe("overflow-trigger");
    // the primary is the separate, rightmost control
    const group = container.querySelector('[data-slot="page-header-actions"]') as HTMLElement;
    expect(group.lastElementChild?.getAttribute("aria-label")).toBe("Add account");
    expect(capsule.nextElementSibling).toBe(group.lastElementChild);
    secondaries.forEach((label) => expect(cls(screen.getByRole("button", { name: label }))).toContain("header-secondary"));
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = within(await screen.findByRole("menu", undefined, { timeout: 5000 }));
    expect(menu.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(secondaries);
  });

  it("title column keeps its reserve: side tracks at least 44pt, title in the middle, the right group in the third column", () => {
    expect(PHONE_BAR).toContain("grid-cols-[auto_minmax(0,1fr)_auto]");
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
    expect(cls(container.querySelector('[data-slot="page-header-title-block"]'))).toContain("col-start-2");
    const group = container.querySelector('[data-slot="page-header-actions"]');
    expect(cls(group)).toContain("col-start-3");
    expect(cls(group)).toContain("justify-self-end");
  });

  it("the primary keeps its accessible label (icon-only) and the glass has no breakpoint gate", () => {
    render(<PageHeader title="Budgets" actions={<Button>Add Budget</Button>} />);
    const primary = screen.getByRole("button", { name: "Add Budget" });
    expect(primary.textContent).toContain("Add Budget");
    expect(cls(primary.parentElement)).not.toContain("regular:hidden");
    expect(PHONE.slice(0, 400)).not.toContain("@media (width < 40rem)");
    expect(PHONE).toContain(".glass-capsule {");
    expect(PHONE_BAR).not.toMatch(/\bregular:glass/);
  });
});
