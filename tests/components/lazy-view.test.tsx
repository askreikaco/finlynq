/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { LazyView } from "@/components/ui/lazy-view";

describe("LazyView", () => {
  let originalIntersectionObserver: typeof IntersectionObserver | undefined;

  beforeEach(() => {
    originalIntersectionObserver = window.IntersectionObserver;
  });

  afterEach(() => {
    window.IntersectionObserver = originalIntersectionObserver as any;
    vi.restoreAllMocks();
  });

  it("renders children immediately if disabled is true", () => {
    render(
      <LazyView disabled>
        <span data-testid="child-content">Loaded content</span>
      </LazyView>
    );
    expect(screen.getByTestId("child-content")).toBeTruthy();
  });

  it("renders children if IntersectionObserver is undefined", () => {
    // @ts-expect-error simulate environment without IntersectionObserver
    delete window.IntersectionObserver;

    render(
      <LazyView>
        <span data-testid="child-content">Fallback content</span>
      </LazyView>
    );
    expect(screen.getByTestId("child-content")).toBeTruthy();
  });

  it("renders placeholder first, then renders children upon intersection", () => {
    let callback: IntersectionObserverCallback = () => {};
    const disconnectMock = vi.fn();
    const observeMock = vi.fn();

    class MockIntersectionObserver {
      observe = observeMock;
      disconnect = disconnectMock;
      unobserve = vi.fn();
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
    }
    window.IntersectionObserver = MockIntersectionObserver as any;

    render(
      <LazyView
        placeholder={<div data-testid="custom-skeleton">Loading skeleton...</div>}
      >
        <div data-testid="real-card">Heavy Chart Component</div>
      </LazyView>
    );

    // Initial state: skeleton rendered, real component not yet in DOM
    expect(screen.getByTestId("custom-skeleton")).toBeTruthy();
    expect(screen.queryByTestId("real-card")).toBeNull();
    expect(observeMock).toHaveBeenCalled();

    // Trigger intersection
    act(() => {
      callback(
        [{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    // Post-intersection: real component rendered, skeleton unmounted, observer disconnected
    expect(screen.getByTestId("real-card")).toBeTruthy();
    expect(screen.queryByTestId("custom-skeleton")).toBeNull();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
