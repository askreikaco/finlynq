/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSizeClass, sizeClassFor } from "@/components/ui/size-class";

const TEST_WIDTHS = {
  compact: 400,  // < 640
  regular: 800,  // 640-1024
  wide: 1200,    // > 1024
};

describe("gallery-contract", () => {
  describe("primitives render at 3 container widths with correct sizeClass", () => {
    let resizeObserverCallbacks: ResizeObserverCallback[] = [];

    beforeEach(() => {
      resizeObserverCallbacks = [];

      class MockResizeObserver {
        callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          resizeObserverCallbacks.push(callback);
        }

        observe(element: Element) {
          // Immediately fire the observer with the element's mocked clientWidth
          const width = (element as HTMLElement).clientWidth;
          this.callback(
            [
              {
                target: element,
                contentRect: { width, height: 600 } as DOMRectReadOnly,
                borderBoxSize: [] as ResizeObserverSize[],
                contentBoxSize: [] as ResizeObserverSize[],
                devicePixelContentBoxSize: [] as ResizeObserverSize[],
              },
            ] as ResizeObserverEntry[],
            {} as ResizeObserver
          );
        }

        disconnect() {
          resizeObserverCallbacks = [];
        }
      }

      globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    });

    it("renders component at compact width (400px) and detects 'compact' size class", () => {
      const element = document.createElement("div");
      Object.defineProperty(element, "clientWidth", {
        value: TEST_WIDTHS.compact,
        writable: false,
      });
      const ref = { current: element };

      const { result } = renderHook(() => useSizeClass(ref));

      // Trigger observer callback with compact width
      act(() => {
        const callback = resizeObserverCallbacks[0];
        if (callback) {
          callback(
            [
              {
                target: element,
                contentRect: { width: TEST_WIDTHS.compact, height: 600 } as DOMRectReadOnly,
                borderBoxSize: [] as ResizeObserverSize[],
                contentBoxSize: [] as ResizeObserverSize[],
                devicePixelContentBoxSize: [] as ResizeObserverSize[],
              },
            ] as ResizeObserverEntry[],
            {} as ResizeObserver
          );
        }
      });

      expect(result.current).toBe("compact");
    });

    it("renders component at regular width (800px) and detects 'regular' size class", () => {
      const element = document.createElement("div");
      Object.defineProperty(element, "clientWidth", {
        value: TEST_WIDTHS.regular,
        writable: false,
      });
      const ref = { current: element };

      const { result } = renderHook(() => useSizeClass(ref));

      // Trigger observer callback with regular width
      act(() => {
        const callback = resizeObserverCallbacks[0];
        if (callback) {
          callback(
            [
              {
                target: element,
                contentRect: { width: TEST_WIDTHS.regular, height: 600 } as DOMRectReadOnly,
                borderBoxSize: [] as ResizeObserverSize[],
                contentBoxSize: [] as ResizeObserverSize[],
                devicePixelContentBoxSize: [] as ResizeObserverSize[],
              },
            ] as ResizeObserverEntry[],
            {} as ResizeObserver
          );
        }
      });

      expect(result.current).toBe("regular");
    });

    it("renders component at wide width (1200px) and detects 'wide' size class", () => {
      const element = document.createElement("div");
      Object.defineProperty(element, "clientWidth", {
        value: TEST_WIDTHS.wide,
        writable: false,
      });
      const ref = { current: element };

      const { result } = renderHook(() => useSizeClass(ref));

      // Trigger observer callback with wide width
      act(() => {
        const callback = resizeObserverCallbacks[0];
        if (callback) {
          callback(
            [
              {
                target: element,
                contentRect: { width: TEST_WIDTHS.wide, height: 600 } as DOMRectReadOnly,
                borderBoxSize: [] as ResizeObserverSize[],
                contentBoxSize: [] as ResizeObserverSize[],
                devicePixelContentBoxSize: [] as ResizeObserverSize[],
              },
            ] as ResizeObserverEntry[],
            {} as ResizeObserver
          );
        }
      });

      expect(result.current).toBe("wide");
    });
  });

  describe("size class boundaries", () => {
    it("boundary at 639 is compact", () => {
      expect(sizeClassFor(639)).toBe("compact");
    });

    it("boundary at 640 is regular", () => {
      expect(sizeClassFor(640)).toBe("regular");
    });

    it("boundary at 1024 is regular", () => {
      expect(sizeClassFor(1024)).toBe("regular");
    });

    it("boundary at 1025 is wide", () => {
      expect(sizeClassFor(1025)).toBe("wide");
    });
  });
});
