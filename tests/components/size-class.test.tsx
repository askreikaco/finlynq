/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";
import { sizeClassFor, useSizeClass } from "@/components/ui/size-class";

describe("sizeClassFor", () => {
  it("returns 'compact' for width < 640", () => {
    expect(sizeClassFor(0)).toBe("compact");
    expect(sizeClassFor(639)).toBe("compact");
  });

  it("returns 'regular' for width >= 640 and <= 1024", () => {
    expect(sizeClassFor(640)).toBe("regular");
    expect(sizeClassFor(832)).toBe("regular");
    expect(sizeClassFor(1024)).toBe("regular");
  });

  it("returns 'wide' for width > 1024", () => {
    expect(sizeClassFor(1025)).toBe("wide");
    expect(sizeClassFor(1920)).toBe("wide");
  });
});

describe("useSizeClass hook", () => {
  let resizeObserverCallback: ResizeObserverCallback | null = null;
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockObserve = vi.fn();
    mockDisconnect = vi.fn();

    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverCallback = callback;
      }
      observe = mockObserve;
      disconnect = mockDisconnect;
      unobserve = vi.fn();
    }

    global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    resizeObserverCallback = null;
    vi.clearAllMocks();
  });

  it("returns 'compact' on initial render (SSR-safe)", () => {
    const ref = React.createRef<HTMLDivElement>();

    function TestComponent() {
      const size = useSizeClass(ref as React.RefObject<HTMLElement | null>);
      return <div ref={ref}>{size}</div>;
    }

    render(<TestComponent />);
    expect(screen.getByText("compact")).toBeTruthy();
  });

  it("calls ResizeObserver.observe when mounted", () => {
    const ref = React.createRef<HTMLDivElement>();

    function TestComponent() {
      useSizeClass(ref as React.RefObject<HTMLElement | null>);
      return <div ref={ref} />;
    }

    render(<TestComponent />);
    expect(mockObserve).toHaveBeenCalled();
  });

  it("disconnects ResizeObserver on unmount", () => {
    const ref = React.createRef<HTMLDivElement>();

    function TestComponent() {
      useSizeClass(ref as React.RefObject<HTMLElement | null>);
      return <div ref={ref} />;
    }

    const { unmount } = render(<TestComponent />);
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("updates size class when ResizeObserver fires", async () => {
    const ref = React.createRef<HTMLDivElement>();

    function TestComponent() {
      const size = useSizeClass(ref as React.RefObject<HTMLElement | null>);
      return <div ref={ref}>{size}</div>;
    }

    render(<TestComponent />);

    // Simulate element having width of 1500px (wide)
    if (ref.current) {
      Object.defineProperty(ref.current, "clientWidth", {
        value: 1500,
        writable: true,
        configurable: true,
      });
    }

    // Trigger ResizeObserver callback
    if (resizeObserverCallback && ref.current) {
      await act(async () => {
        resizeObserverCallback?.(
          [{ target: ref.current! } as unknown as ResizeObserverEntry],
          {} as ResizeObserver
        );
      });
    }

    await waitFor(() => {
      expect(screen.getByText("wide")).toBeTruthy();
    });
  });
});
