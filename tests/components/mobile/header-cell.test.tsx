/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { Plus, RefreshCw, User } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));

import { PageHeader, HEADER_CELL, PHONE_PRIMARY_CLASS, splitPhoneActions, withPhonePrimary } from "@/components/mobile/page-header";
import { Button } from "@/components/ui/button";

afterEach(cleanup);

const CAPSULE = '[data-slot="header-capsule"]';
const cls = (el: Element | null | undefined) => (el ? el.className.toString().split(/\s+/) : []);

function avatar() {
  return (
    <a key="me" href="/settings/general" aria-label="Settings" className={`${HEADER_CELL} flex h-11 w-11 rounded-full`}>
      <User className="h-4 w-4 text-foreground" />
    </a>
  );
}

describe("HEADER_CELL: a non-primary header control never takes the primary role", () => {
  it("a lone HEADER_CELL link is not the primary and sits in the capsule as a neutral cell", () => {
    const { container } = render(<PageHeader title="Dashboard" actions={avatar()} />);
    const link = container.querySelector('a[aria-label="Settings"]');
    expect(cls(link)).not.toContain(PHONE_PRIMARY_CLASS);
    expect(link?.closest(CAPSULE)).not.toBeNull();
    expect(container.querySelector('[data-slot="header-primary"]')).toBeNull();
  });

  it("a HEADER_CELL link after a real action is skipped: the real action stays the primary", () => {
    const { container } = render(
      <PageHeader
        title="Dashboard"
        actions={[
          <Button key="add" aria-label="Add goal"><Plus /></Button>,
          avatar(),
        ]}
      />,
    );
    expect(cls(container.querySelector('[aria-label="Add goal"]'))).toContain(PHONE_PRIMARY_CLASS);
    expect(cls(container.querySelector('a[aria-label="Settings"]'))).not.toContain(PHONE_PRIMARY_CLASS);
  });

  it("withPhonePrimary never picks a HEADER_CELL element, even as the last child", () => {
    const out = withPhonePrimary([
      <Button key="r" aria-label="Refresh"><RefreshCw /></Button>,
      avatar(),
    ]) as React.ReactElement<{ className?: string }>[];
    expect(out.map((c) => String(c.props.className ?? "")).map((c) => c.includes(PHONE_PRIMARY_CLASS))).toEqual([true, false]);
  });
});

describe("primary and cells: mixed header keeps the primary as the last cell before the overflow trigger", () => {
  it("a real primary still gets the primary class and aria-label", () => {
    const { container } = render(<PageHeader title="Goals" actions={<Button><Plus /> Add Goal</Button>} />);
    const primary = container.querySelector("button") as HTMLButtonElement;
    expect(cls(primary)).toContain(PHONE_PRIMARY_CLASS);
    expect(primary.getAttribute("aria-label")).toBe("Add Goal");
  });

  it("mixed cells + primary: cells first, then the primary, then the overflow trigger, all in one capsule", () => {
    const { container } = render(
      <PageHeader
        title="Dashboard"
        actions={[
          <Button key="r" variant="outline" size="icon" aria-label="Refresh"><RefreshCw /></Button>,
          avatar(),
          <Button key="p" aria-label="Add widget"><Plus /></Button>,
        ]}
        overflow={[{ label: "Customize", onSelect: () => {} }]}
      />,
    );
    const capsules = container.querySelectorAll(CAPSULE);
    expect(capsules.length).toBe(1);
    const order = Array.from(capsules[0].children).map((el) => el.getAttribute("aria-label") ?? el.getAttribute("data-slot"));
    expect(order).toEqual(["Refresh", "Settings", "Add widget", "More actions"]);
    expect(cls(container.querySelector('a[aria-label="Settings"]'))).not.toContain(PHONE_PRIMARY_CLASS);
    expect(cls(container.querySelector('[aria-label="Add widget"]'))).toContain(PHONE_PRIMARY_CLASS);
  });

  it("splitPhoneActions puts the HEADER_CELL link into cells and the real action into primary", () => {
    const { cells, primary } = splitPhoneActions([
      avatar(),
      <Button key="add" aria-label="Add"><Plus /></Button>,
    ]);
    expect(cells.length).toBe(1);
    expect(cls((cells[0] as React.ReactElement<{ className?: string }>).props as unknown as Element)).toBeDefined();
    expect(primary).not.toBeNull();
    expect(String((primary as React.ReactElement<{ className?: string }>).props.className)).toContain(PHONE_PRIMARY_CLASS);
  });
});
