/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Inbox } from "lucide-react";
import {
  InsetGroup,
  InsetRow,
  InsetSectionHeader,
  AccountCard,
  ThemePicker,
} from "@/components/mobile/inset-group";

const SRC = readFileSync(join(__dirname, "../../../src/components/mobile/inset-group.tsx"), "utf8");

afterEach(() => cleanup());

describe("InsetRow", () => {
  it("renders an outline icon, the label and a chevron for link rows", () => {
    const { container } = render(<InsetRow href="/budgets" label="Budgets" icon={Inbox} />);
    const link = screen.getByRole("link", { name: "Budgets" });
    expect(link).toHaveAttribute("href", "/budgets");
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveClass("size-[22px]");
    expect(svg).toHaveClass("text-muted-foreground");
    expect(link.querySelector("svg.size-4")).not.toBeNull();
  });

  it("shows a muted trailing value and no chevron when chevron={false}", () => {
    render(<InsetRow onClick={() => {}} label="Plan" value="Max plan" chevron={false} />);
    const row = screen.getByRole("button", { name: /Plan/ });
    expect(within(row).getByText("Max plan")).toHaveClass("text-muted-foreground");
    expect(row.querySelector("svg.size-4")).toBeNull();
  });

  it("renders a primary badge only when the count is above zero", () => {
    const { rerender } = render(<InsetRow href="/feedback" label="Feedback" badge={3} />);
    expect(screen.getByText("3")).toHaveClass("bg-primary");
    rerender(<InsetRow href="/feedback" label="Feedback" badge={0} />);
    expect(screen.queryByText("3")).toBeNull();
  });

  it("destructive rows use the destructive token, have no chevron and are buttons", () => {
    const onClick = vi.fn();
    render(<InsetRow destructive label="Log out" icon={Inbox} onClick={onClick} data-testid="out" />);
    const btn = screen.getByRole("button", { name: "Log out" });
    expect(btn).toHaveAttribute("data-variant", "destructive");
    expect(btn.querySelector(".text-destructive")).not.toBeNull();
    expect(btn.querySelector("svg.size-4")).toBeNull();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("accent rows use the primary token for label and icon", () => {
    render(<InsetRow accent icon={Inbox} label="Add account" onClick={() => {}} chevron={false} />);
    const btn = screen.getByRole("button", { name: "Add account" });
    expect(btn).toHaveAttribute("data-variant", "accent");
    expect(btn.querySelector(".text-primary")).not.toBeNull();
  });

  it("toggle variant renders a switch that reports changes and has no chevron", () => {
    const onCheckedChange = vi.fn();
    render(
      <InsetRow label="Haptic feedback" icon={Inbox} toggle={{ checked: false, onCheckedChange }} />,
    );
    const sw = screen.getByRole("switch", { name: "Haptic feedback" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalled();
    expect(onCheckedChange.mock.calls[0][0]).toBe(true);
    expect(screen.getByText("Haptic feedback").closest("[data-variant='toggle']")?.querySelector("svg.size-4")).toBeNull();
  });

  it("rows are at least 56px tall (min-h-14) and have a pressed and focus-visible state", () => {
    render(<InsetRow href="/x" label="X" />);
    const cls = screen.getByRole("link", { name: "X" }).className;
    expect(cls).toMatch(/\bmin-h-14\b/);
    expect(cls).toMatch(/active:bg-muted\/60/);
    expect(cls).toMatch(/focus-visible:ring-3/);
  });

  it("hairlines start after the icon and skip the first row (no line on the first or last-only row)", () => {
    const { container } = render(
      <InsetGroup>
        <InsetRow href="/a" label="A" icon={Inbox} />
        <InsetRow href="/b" label="B" icon={Inbox} />
      </InsetGroup>,
    );
    const rows = container.querySelectorAll("[data-slot='inset-row']");
    expect(rows).toHaveLength(2);
    expect(rows[0].className).toMatch(/first:before:hidden/);
    expect(rows[0].className).toMatch(/before:left-\[var\(--inset-sep,3\.125rem\)\]/);
    expect(rows[0].className).toMatch(/before:h-px/);
    const group = container.querySelector("[data-slot='inset-group']") as HTMLElement;
    expect(group.style.getPropertyValue("--inset-sep")).toBe("3.125rem");
  });
});

describe("InsetGroup and InsetSectionHeader", () => {
  it("is one rounded container on the card surface with no outer border", () => {
    const { container } = render(<InsetGroup data-testid="g"><InsetRow href="/a" label="A" /></InsetGroup>);
    const g = screen.getByTestId("g");
    expect(g.className).toMatch(/\brounded-3xl\b/);
    expect(g.className).toMatch(/\bbg-card\b/);
    expect(g.className).not.toMatch(/\bborder\b/);
    expect(container.querySelectorAll("[data-slot='inset-group']")).toHaveLength(1);
  });

  it("the avatar inset moves hairlines to after the avatar", () => {
    const { container } = render(<InsetGroup inset="avatar"><InsetRow href="/a" label="A" /></InsetGroup>);
    const g = container.querySelector("[data-slot='inset-group']") as HTMLElement;
    expect(g.style.getPropertyValue("--inset-sep")).toBe("4rem");
  });

  it("section header is a level-2 heading in small grey text", () => {
    render(<InsetSectionHeader>Account</InsetSectionHeader>);
    const h = screen.getByRole("heading", { level: 2, name: "Account" });
    expect(h.className).toMatch(/text-muted-foreground/);
    expect(h.className).toMatch(/\btext-sm\b/);
  });
});

describe("AccountCard", () => {
  it("shows the avatar initials, title, subtitle icon and chevron; taps through onClick", () => {
    const onClick = vi.fn();
    render(
      <AccountCard
        initials="MD"
        title="me@example.com"
        subtitle="Current"
        subtitleIcon={Inbox}
        current
        onClick={onClick}
        data-testid="card"
      />,
    );
    const card = screen.getByTestId("card");
    expect(card.tagName).toBe("BUTTON");
    expect(card).toHaveAttribute("aria-current", "true");
    expect(card.textContent).toContain("MD");
    expect(card.textContent).toContain("me@example.com");
    expect(card.textContent).toContain("Current");
    expect(card.querySelector("svg.size-3\\.5")).not.toBeNull();
    expect(card.querySelector("svg.size-4")).not.toBeNull();
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("without an action it is a plain row (no button, no chevron)", () => {
    render(<AccountCard initials="X" title="Other" data-testid="plain" />);
    const el = screen.getByTestId("plain");
    expect(el.tagName).toBe("DIV");
    expect(el.querySelector("svg.size-4")).toBeNull();
  });
});

describe("ThemePicker", () => {
  it("is a radiogroup of Light, Dark, System with the selected one tab-stop and checked", () => {
    render(<ThemePicker value="dark" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    expect(radios.map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
  });

  it("the selected choice has the primary ring and label", () => {
    render(<ThemePicker value="light" onChange={() => {}} />);
    const light = screen.getByRole("radio", { name: "Light" });
    expect(light.querySelector(".ring-primary")).not.toBeNull();
    expect(light.querySelector(".text-primary")).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Dark" }).querySelector(".ring-primary")).toBeNull();
  });

  it("click selects; arrow keys move and select with wrap-around", () => {
    const onChange = vi.fn();
    render(<ThemePicker value="light" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenLastCalledWith("dark");
    const light = screen.getByRole("radio", { name: "Light" });
    fireEvent.keyDown(light, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("dark");
    fireEvent.keyDown(light, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("system");
    fireEvent.keyDown(light, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("dark");
    fireEvent.keyDown(light, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("system");
  });

  it("thumbnails are at least 44px (min-h-11) and press with active opacity", () => {
    render(<ThemePicker value="system" onChange={() => {}} />);
    const r = screen.getByRole("radio", { name: "System" });
    expect(r.className).toMatch(/\bmin-h-11\b/);
    expect(r.className).toMatch(/active:opacity-80/);
  });
});

describe("source guards for the primitives", () => {
  it("uses no palette colours, raw hex/oklch/rgb colours, or text-[Npx] sizes", () => {
    const palette = /\b(bg|text|border|ring|from|to|via|fill|stroke|divide|shadow)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
    expect(SRC).not.toMatch(palette);
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(SRC).not.toMatch(/\b(oklch|rgb|hsl)\(/);
    expect(SRC).not.toMatch(/text-\[\d/);
  });

  it("uses no breakpoint tokens (sm/md/lg/xl/2xl, max- variants)", () => {
    expect(SRC).not.toMatch(/(^|[\s"'`])(max-)?(sm|md|lg|xl|2xl):/);
    expect(SRC).not.toMatch(/matchMedia|useMediaQuery|isMobile/);
  });
});
