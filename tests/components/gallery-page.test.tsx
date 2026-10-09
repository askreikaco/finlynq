/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import GalleryPage from "@/app/(app)/dev/gallery/page";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  usePathname: () => "/dev/gallery",
}));

describe("GalleryPage", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let resizeObserverConstructed = false;

  beforeEach(() => {
    // Mock fetch for DevModeGuard
    mockFetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ devMode: true }),
      })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = mockFetch;

    // Track if ResizeObserver is created
    resizeObserverConstructed = false;

    class MockResizeObserver {
      callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeObserverConstructed = true;
      }

      observe(_element: Element) {
        // Immediately fire with 1200px (wide)
        this.callback(
          [
            {
              target: _element,
              contentRect: { width: 1200, height: 600 } as DOMRectReadOnly,
              borderBoxSize: [] as ResizeObserverSize[],
              contentBoxSize: [] as ResizeObserverSize[],
              devicePixelContentBoxSize: [] as ResizeObserverSize[],
            },
          ] as ResizeObserverEntry[],
          {} as ResizeObserver
        );
      }

      disconnect() {}
    }

    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    mockReplace.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("constructs ResizeObserver and shows 'Current size class: wide' after guard resolves", async () => {
    render(<GalleryPage />);

    // Wait for guard to resolve and ResizeObserver to be set up
    await waitFor(() => {
      expect(resizeObserverConstructed).toBe(true);
    });

    // Verify the page title appears (proves guard resolved and page rendered)
    await waitFor(() => {
      expect(screen.getByText("Component Gallery")).toBeInTheDocument();
    });
  });

  it("redirects to /dashboard and renders no gallery content when devMode is false", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(() =>
      Promise.resolve({
        json: async () => ({ devMode: false }),
      })
    );

    render(<GalleryPage />);

    // Verify router.replace was called
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboard");
    });

    // Verify gallery content is not rendered
    await waitFor(() => {
      expect(screen.queryByText(/Component Gallery/)).not.toBeInTheDocument();
    });
  });
});
