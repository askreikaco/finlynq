// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BackButton } from "@/components/mobile/back-button";
import { getNavDepth, incrementNavDepth, decrementNavDepth, resetNavDepth } from "@/lib/nav/history-depth";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("history depth", () => {
  beforeEach(() => window.sessionStorage.clear());
  it("counts up, down and never below zero", () => {
    expect(getNavDepth()).toBe(0);
    incrementNavDepth();
    incrementNavDepth();
    expect(getNavDepth()).toBe(2);
    decrementNavDepth();
    decrementNavDepth();
    decrementNavDepth();
    expect(getNavDepth()).toBe(0);
    incrementNavDepth();
    resetNavDepth();
    expect(getNavDepth()).toBe(0);
  });
  it("ignores garbage in storage", () => {
    window.sessionStorage.setItem("finlynq.nav.depth", "abc");
    expect(getNavDepth()).toBe(0);
  });
});

describe("BackButton with an href", () => {
  const back = vi.fn();
  beforeEach(() => {
    window.sessionStorage.clear();
    back.mockReset();
    vi.spyOn(window.history, "back").mockImplementation(back);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses real history back when the user navigated inside the app", () => {
    incrementNavDepth();
    render(<BackButton href="/settings" label="Back" />);
    const link = screen.getByRole("link", { name: "Back" });
    const notPrevented = fireEvent.click(link);
    expect(back).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it("falls back to the parent link on a fresh entry (depth 0)", () => {
    render(<BackButton href="/settings" label="Back" />);
    const link = screen.getByRole("link", { name: "Back" });
    const notPrevented = fireEvent.click(link);
    expect(back).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
    expect(link.getAttribute("href")).toBe("/settings");
  });

  it("leaves a modified click (new tab) to the browser", () => {
    incrementNavDepth();
    render(<BackButton href="/settings" label="Back" />);
    fireEvent.click(screen.getByRole("link", { name: "Back" }), { ctrlKey: true });
    expect(back).not.toHaveBeenCalled();
  });
});
