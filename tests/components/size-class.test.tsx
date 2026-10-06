import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sizeClassFor, useSizeClass } from "@/components/ui/size-class";
import { useRef } from "react";

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
  let resizeObserverMock: {
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resizeObserverMock = {
      observe: vi.fn(),
      disconnect: vi.fn(),
    };

    global.ResizeObserver = vi.fn((callback: ResizeObserverCallback) => {
      resizeObserverMock.callback = callback;
      return resizeObserverMock as any;
    }) as any;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (global as any).ResizeObserver;
  });

  it("initializes to 'compact' before observer fires", () => {
    const ref = { current: document.createElement("div") };
    const { result } = renderHook(() => useSizeClass(ref));

    expect(result.current).toBe("compact");
  });

  it("updates size class on ResizeObserver callback", () => {
    const element = document.createElement("div");
    const ref = { current: element };

    const { result, rerender } = renderHook(() => useSizeClass(ref));

    expect(result.current).toBe("compact");

    // Simulate ResizeObserver firing with width 800 (regular)
    act(() => {
      const callback = (resizeObserverMock as any).callback;
      callback([
        {
          target: element,
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ]);
    });

    expect(result.current).toBe("regular");

    // Simulate ResizeObserver firing with width 1500 (wide)
    act(() => {
      const callback = (resizeObserverMock as any).callback;
      callback([
        {
          target: element,
          contentRect: { width: 1500, height: 600 } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ]);
    });

    expect(result.current).toBe("wide");
  });

  it("disconnects observer on unmount", () => {
    const ref = { current: document.createElement("div") };
    const { unmount } = renderHook(() => useSizeClass(ref));

    expect(resizeObserverMock.observe).toHaveBeenCalled();
    expect(resizeObserverMock.disconnect).not.toHaveBeenCalled();

    unmount();

    expect(resizeObserverMock.disconnect).toHaveBeenCalled();
  });

  it("handles missing ResizeObserver gracefully", () => {
    delete (global as any).ResizeObserver;

    const ref = { current: document.createElement("div") };
    const { result } = renderHook(() => useSizeClass(ref));

    // Should default to "compact" without errors
    expect(result.current).toBe("compact");
  });

  it("handles null ref gracefully", () => {
    const ref = { current: null };
    const { result } = renderHook(() => useSizeClass(ref as any));

    expect(result.current).toBe("compact");
    expect(resizeObserverMock.observe).not.toHaveBeenCalled();
  });
});
