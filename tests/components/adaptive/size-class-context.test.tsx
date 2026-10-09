/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, act, cleanup, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AppSizeClassProvider,
  useAppSizeClass,
  APP_MAIN_ATTRIBUTE,
} from "@/components/adaptive/size-class-context";
import type { SizeClass } from "@/components/ui/size-class";

let callbacks: ResizeObserverCallback[] = [];
let disconnects = 0;

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    callbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    disconnects += 1;
  }
}

/** Fire every observer callback with the given content width. */
function resize(element: Element, width: number) {
  act(() => {
    for (const callback of callbacks) {
      callback(
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
  });
}

function Probe() {
  const sizeClass: SizeClass = useAppSizeClass();
  return <div data-testid="size">{sizeClass}</div>;
}

function mount(element: HTMLElement) {
  const target = { current: element };
  return render(
    <AppSizeClassProvider target={target}>
      <Probe />
    </AppSizeClassProvider>
  );
}

describe("AppSizeClassProvider and useAppSizeClass", () => {
  beforeEach(() => {
    callbacks = [];
    disconnects = 0;
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as Record<string, unknown>).ResizeObserver;
    document.body.innerHTML = "";
  });

  it("defaults to 'compact' without a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("size").textContent).toBe("compact");
  });

  it("defaults to 'compact' when the target element has zero width", () => {
    mount(document.createElement("div"));
    expect(screen.getByTestId("size").textContent).toBe("compact");
  });

  it("measures the target synchronously on mount", () => {
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 800 } as DOMRect);
    mount(element);
    expect(screen.getByTestId("size").textContent).toBe("regular");
  });

  it("resizes to 'regular' and 'wide' through the observer", () => {
    const element = document.createElement("div");
    mount(element);
    expect(screen.getByTestId("size").textContent).toBe("compact");

    resize(element, 800);
    expect(screen.getByTestId("size").textContent).toBe("regular");

    resize(element, 1500);
    expect(screen.getByTestId("size").textContent).toBe("wide");

    resize(element, 400);
    expect(screen.getByTestId("size").textContent).toBe("compact");
  });

  it.each([
    [639, "compact"],
    [640, "regular"],
    [1024, "regular"],
    [1025, "wide"],
  ] as const)("boundary: width %i gives '%s'", (width, expected) => {
    const element = document.createElement("div");
    mount(element);
    resize(element, width);
    expect(screen.getByTestId("size").textContent).toBe(expected);
  });

  it("finds the element tagged with data-app-main when no target is given", () => {
    const main = document.createElement("main");
    main.setAttribute(APP_MAIN_ATTRIBUTE, "");
    vi.spyOn(main, "getBoundingClientRect").mockReturnValue({ width: 1200 } as DOMRect);
    document.body.appendChild(main);

    render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>
    );
    expect(screen.getByTestId("size").textContent).toBe("wide");
  });

  it("disconnects the observer on unmount", () => {
    const element = document.createElement("div");
    const { unmount } = mount(element);
    expect(callbacks.length).toBe(1);
    expect(disconnects).toBe(0);

    unmount();
    expect(disconnects).toBe(1);
  });

  it("renders without ResizeObserver", () => {
    delete (globalThis as Record<string, unknown>).ResizeObserver;
    mount(document.createElement("div"));
    expect(screen.getByTestId("size").textContent).toBe("compact");
  });
});
