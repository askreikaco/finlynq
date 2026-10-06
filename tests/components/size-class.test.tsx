/**
 * @vitest-environment jsdom
 */
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sizeClassFor, useSizeClass } from "@/components/ui/size-class";

describe("sizeClassFor", () => {
  it("returns 'compact' for width < 640", () => {
    expect(sizeClassFor(0)).toBe("compact");
    expect(sizeClassFor(639)).toBe("compact");
  });

  it("returns 'regular' for width 640-1024", () => {
    expect(sizeClassFor(640)).toBe("regular");
    expect(sizeClassFor(832)).toBe("regular");
    expect(sizeClassFor(1024)).toBe("regular");
  });

  it("returns 'wide' for width > 1024", () => {
    expect(sizeClassFor(1025)).toBe("wide");
    expect(sizeClassFor(2000)).toBe("wide");
  });
});

describe("useSizeClass", () => {
  let resizeObserverCallbacks: ResizeObserverCallback[] = [];
  let observedElements: Element[] = [];

  beforeEach(() => {
    resizeObserverCallbacks = [];
    observedElements = [];

    class MockResizeObserver {
      callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeObserverCallbacks.push(callback);
      }

      observe(element: Element) {
        observedElements.push(element);
      }

      disconnect() {
        resizeObserverCallbacks = [];
        observedElements = [];
      }
    }

    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).ResizeObserver;
  });

  it("initializes to 'compact' before observer fires", () => {
    const ref = { current: document.createElement("div") };
    const { result } = renderHook(() => useSizeClass(ref));

    expect(result.current).toBe("compact");
  });

  it("updates size class on ResizeObserver callback", () => {
    const element = document.createElement("div");
    const ref = { current: element };

    const { result } = renderHook(() => useSizeClass(ref));

    expect(result.current).toBe("compact");

    // Simulate ResizeObserver firing with width 800 (regular)
    act(() => {
      const callback = resizeObserverCallbacks[0];
      const mockObserver = {} as ResizeObserver;
      callback(
        [
          {
            target: element,
            contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
            borderBoxSize: [] as ResizeObserverSize[],
            contentBoxSize: [] as ResizeObserverSize[],
            devicePixelContentBoxSize: [] as ResizeObserverSize[],
          },
        ] as ResizeObserverEntry[],
        mockObserver
      );
    });

    expect(result.current).toBe("regular");

    // Simulate ResizeObserver firing with width 1500 (wide)
    act(() => {
      const callback = resizeObserverCallbacks[0];
      const mockObserver = {} as ResizeObserver;
      callback(
        [
          {
            target: element,
            contentRect: { width: 1500, height: 600 } as DOMRectReadOnly,
            borderBoxSize: [] as ResizeObserverSize[],
            contentBoxSize: [] as ResizeObserverSize[],
            devicePixelContentBoxSize: [] as ResizeObserverSize[],
          },
        ] as ResizeObserverEntry[],
        mockObserver
      );
    });

    expect(result.current).toBe("wide");
  });

  it("disconnects observer on unmount", () => {
    const ref = { current: document.createElement("div") };
    const { unmount } = renderHook(() => useSizeClass(ref));

    expect(observedElements.length).toBeGreaterThan(0);

    unmount();

    // After disconnect, arrays should be cleared by the mock
    expect(resizeObserverCallbacks.length).toBe(0);
  });

  it("handles missing ResizeObserver gracefully", () => {
    delete (globalThis as Record<string, unknown>).ResizeObserver;

    const ref = { current: document.createElement("div") };
    const { result } = renderHook(() => useSizeClass(ref));

    // Should default to "compact" without errors
    expect(result.current).toBe("compact");
  });

  it("handles null ref gracefully", () => {
    const ref = { current: null } as unknown as React.RefObject<HTMLElement>;
    const { result } = renderHook(() => useSizeClass(ref));

    expect(result.current).toBe("compact");
    expect(observedElements.length).toBe(0);
  });
});
