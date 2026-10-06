/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { usePathname } from "next/navigation";
import * as useQuickAddEnabledModule from "@/hooks/use-quick-add-enabled";
import { QuickAddFAB } from "@/components/quick-add-fab";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/hooks/use-quick-add-enabled", () => ({
  useQuickAddEnabled: vi.fn(),
}));

describe("QuickAddFAB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should not render when flag is off (false)", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    vi.mocked(useQuickAddEnabledModule.useQuickAddEnabled).mockReturnValue(false);

    const { container } = render(<QuickAddFAB />);
    expect(container.firstChild).toBeNull();
  });

  it("should render when flag is on and on /dashboard", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    vi.mocked(useQuickAddEnabledModule.useQuickAddEnabled).mockReturnValue(true);

    render(<QuickAddFAB />);
    const link = screen.getByLabelText("Add transaction");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/transactions/new");
  });

  it("should render when flag is on and on /transactions", () => {
    vi.mocked(usePathname).mockReturnValue("/transactions");
    vi.mocked(useQuickAddEnabledModule.useQuickAddEnabled).mockReturnValue(true);

    render(<QuickAddFAB />);
    const link = screen.getByLabelText("Add transaction");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/transactions/new");
  });

  it("should not render on other paths even when flag is on", () => {
    vi.mocked(usePathname).mockReturnValue("/accounts");
    vi.mocked(useQuickAddEnabledModule.useQuickAddEnabled).mockReturnValue(true);

    const { container } = render(<QuickAddFAB />);
    expect(container.firstChild).toBeNull();
  });

  it("should have correct styling classes for positioning", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    vi.mocked(useQuickAddEnabledModule.useQuickAddEnabled).mockReturnValue(true);

    render(<QuickAddFAB />);
    const link = screen.getByLabelText("Add transaction");
    expect(link).toHaveClass("fixed", "rounded-full", "bg-primary");
  });

  it("should have correct href for linking to transaction creation", () => {
    vi.mocked(usePathname).mockReturnValue("/transactions");
    vi.mocked(useQuickAddEnabledModule.useQuickAddEnabled).mockReturnValue(true);

    render(<QuickAddFAB />);
    const link = screen.getByLabelText("Add transaction");
    expect(link.getAttribute("href")).toBe("/transactions/new");
  });
});
