/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSizeClass, sizeClassFor } from "@/components/ui/size-class";

const TEST_WIDTHS = {
  compact: 400,  // < 640
  regular: 800,  // 640-1024
  wide: 1200,    // > 1024
};

describe("gallery-contract", () => {
  describe("useSizeClass hook at 3 container widths", () => {
    beforeEach(() => {
      class MockResizeObserver {
        callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
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

        disconnect() {}
      }

      globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    });

    it("detects 'compact' size class at 400px width", () => {
      const element = document.createElement("div");
      Object.defineProperty(element, "clientWidth", {
        value: TEST_WIDTHS.compact,
        writable: false,
      });
      const ref = { current: element };

      const { result } = renderHook(() => useSizeClass(ref));

      expect(result.current).toBe("compact");
    });

    it("detects 'regular' size class at 800px width", () => {
      const element = document.createElement("div");
      Object.defineProperty(element, "clientWidth", {
        value: TEST_WIDTHS.regular,
        writable: false,
      });
      const ref = { current: element };

      const { result } = renderHook(() => useSizeClass(ref));

      expect(result.current).toBe("regular");
    });

    it("detects 'wide' size class at 1200px width", () => {
      const element = document.createElement("div");
      Object.defineProperty(element, "clientWidth", {
        value: TEST_WIDTHS.wide,
        writable: false,
      });
      const ref = { current: element };

      const { result } = renderHook(() => useSizeClass(ref));

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
