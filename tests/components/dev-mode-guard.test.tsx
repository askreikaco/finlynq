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
  useSearchParams: () => new URLSearchParams(),
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

  it("calls fetch with '/api/settings/dev-mode' and renders children when devMode is true", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ devMode: true }),
      })
    ) as unknown as typeof fetch;
    global.fetch = fetchFn;

    render(
      <DevModeGuard>
        <div data-testid="children">Dev content</div>
      </DevModeGuard>
    );

    // Verify fetch was called with correct URL
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledWith("/api/settings/dev-mode");
    });

    // Wait for children to render
    await waitFor(() => {
      expect(screen.queryByTestId("children")).toBeInTheDocument();
    });
  });

  it("redirects to /dashboard when devMode is false and children are not rendered", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ devMode: false }),
      })
    ) as unknown as typeof fetch;

    render(
      <DevModeGuard>
        <div data-testid="children">Should not render</div>
      </DevModeGuard>
    );

    // Verify router.replace was called
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });

    // Verify children text is NOT in document
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("redirects to /dashboard when devMode is undefined (fail closed)", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({}),
      })
    ) as unknown as typeof fetch;

    render(
      <DevModeGuard>
        <div data-testid="children">Should not render</div>
      </DevModeGuard>
    );

    // Verify router.replace was called
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });

    // Verify children text is NOT in document
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("redirects to /dashboard on fetch rejection and children are not rendered", async () => {
    global.fetch = vi.fn(() =>
      Promise.reject(new Error("Network error"))
    ) as unknown as typeof fetch;

    render(
      <DevModeGuard>
        <div data-testid="children">Should not render</div>
      </DevModeGuard>
    );

    // Verify router.replace was called on error
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });

    // Verify children text is NOT in document
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
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
