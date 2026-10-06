/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DevModeGuard } from "@/components/dev-mode-guard";

// Mock next/navigation at top level
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

describe("DevModeGuard", () => {
  beforeEach(() => {
    // Default: allow dev mode (tests can override per-test)
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ devMode: true }),
      })
    ) as unknown as typeof fetch;
    mockReplace.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders children when devMode is true", async () => {
    render(
      <DevModeGuard>
        <div data-testid="children">Dev content</div>
      </DevModeGuard>
    );

    // Wait for fetch and state update
    await waitFor(() => {
      expect(screen.queryByTestId("children")).toBeInTheDocument();
    });
  });

  it("redirects to /dashboard when devMode is false", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ devMode: false }),
      })
    ) as unknown as typeof fetch;

    render(
      <DevModeGuard>
        <div>Should not render</div>
      </DevModeGuard>
    );

    // Verify router.replace was called
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("redirects to /dashboard on fetch rejection", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("Network error"))
    ) as unknown as typeof fetch;

    render(
      <DevModeGuard>
        <div>Should not render</div>
      </DevModeGuard>
    );

    // Verify router.replace was called on error
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows nothing while checking dev mode", async () => {
    global.fetch = vi.fn(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    ) as unknown as typeof fetch;

    const { container } = render(
      <DevModeGuard>
        <div>Dev content</div>
      </DevModeGuard>
    );

    // While checking, should render nothing (null)
    expect(container.firstChild).toBeNull();
  });
});
