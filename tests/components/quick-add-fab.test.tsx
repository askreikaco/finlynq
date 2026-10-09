/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { QuickAddFAB } from "@/components/quick-add-fab";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("QuickAddFAB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render when on /dashboard", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    render(<QuickAddFAB />);
    const link = screen.getByLabelText("Add transaction");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/transactions/new");
  });

  it("should render when on /transactions", () => {
    vi.mocked(usePathname).mockReturnValue("/transactions");

    render(<QuickAddFAB />);
    const link = screen.getByLabelText("Add transaction");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/transactions/new");
  });

  it("should not render on other paths", () => {
    vi.mocked(usePathname).mockReturnValue("/accounts");

    render(<QuickAddFAB />);
    expect(screen.queryByLabelText("Add transaction")).not.toBeInTheDocument();
  });

  it("should include var(--sab) and correct bottom class for safe area inset", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    render(<QuickAddFAB />);
    const link = screen.getByLabelText("Add transaction");
    const classString = link.getAttribute("class");
    expect(classString).toContain("var(--mobile-bar-clearance)");
    expect(classString).toContain("bottom-[calc(var(--mobile-bar-clearance)-8px)]");
    expect(classString).toContain("z-40");
  });

  it("should hide FAB when input is focused", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    render(
      <>
        <input type="text" data-testid="test-input" />
        <QuickAddFAB />
      </>
    );

    const input = screen.getByTestId("test-input");
    input.focus();

    await waitFor(() => {
      const fab = screen.queryByLabelText("Add transaction");
      expect(fab).not.toBeInTheDocument();
    });
  });

  it("should show FAB again when input is blurred", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    render(
      <>
        <input type="text" data-testid="test-input" />
        <QuickAddFAB />
      </>
    );

    const input = screen.getByTestId("test-input");
    input.focus();

    await waitFor(() => {
      const fab = screen.queryByLabelText("Add transaction");
      expect(fab).not.toBeInTheDocument();
    });

    input.blur();

    await waitFor(() => {
      const fab = screen.getByLabelText("Add transaction");
      expect(fab).toBeInTheDocument();
    });
  });

  it("should hide FAB when textarea is focused", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    render(
      <>
        <textarea data-testid="test-textarea" />
        <QuickAddFAB />
      </>
    );

    const textarea = screen.getByTestId("test-textarea");
    textarea.focus();

    await waitFor(() => {
      const fab = screen.queryByLabelText("Add transaction");
      expect(fab).not.toBeInTheDocument();
    });
  });

  it("should handle window resize events", async () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    render(
      <>
        <input type="text" data-testid="test-input" />
        <QuickAddFAB />
      </>
    );

    const input = screen.getByTestId("test-input");
    input.focus();

    await waitFor(() => {
      expect(screen.queryByLabelText("Add transaction")).not.toBeInTheDocument();
    });

    // Simulate resize event
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      // FAB should still be hidden as input is still focused
      expect(screen.queryByLabelText("Add transaction")).not.toBeInTheDocument();
    });
  });

  it("should remove event listeners on unmount", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");

    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<QuickAddFAB />);

    unmount();

    // Verify removeEventListener was called for all three events
    expect(removeEventListenerSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith("focus", expect.any(Function), true);
    expect(removeEventListenerSpy).toHaveBeenCalledWith("blur", expect.any(Function), true);

    removeEventListenerSpy.mockRestore();
  });
});
