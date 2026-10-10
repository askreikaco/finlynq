/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, act, cleanup, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  AppSizeClassProvider,
  useAppSizeClass,
  APP_MAIN_ATTRIBUTE,
} from "@/components/adaptive/size-class-context";

let callbacks: ResizeObserverCallback[] = [];
let observed: Element[] = [];
let disconnects = 0;

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    callbacks.push(callback);
  }
  observe(element: Element) {
    observed.push(element);
  }
  unobserve() {}
  disconnect() {
    disconnects += 1;
  }
}

/** Viewport width as documentElement.clientWidth reports it (the provider's only source). */
let viewport = 0;
function setViewport(width: number) {
  viewport = width;
}

/** Fire every observer callback. The entry's contentRect is deliberately wrong: the provider must ignore it. */
function fireObserver() {
  act(() => {
    for (const callback of callbacks) {
      callback(
        [
          {
            target: document.documentElement,
            contentRect: { width: 1, height: 600 } as DOMRectReadOnly,
            borderBoxSize: [] as ResizeObserverSize[],
            contentBoxSize: [] as ResizeObserverSize[],
            devicePixelContentBoxSize: [] as ResizeObserverSize[],
          },
        ] as ResizeObserverEntry[],
        {} as ResizeObserver,
      );
    }
  });
}

function Probe() {
  const sizeClass = useAppSizeClass();
  return <div data-testid="size">{sizeClass}</div>;
}

function sizeText(): string {
  return screen.getByTestId("size").textContent ?? "";
}

beforeEach(() => {
  callbacks = [];
  observed = [];
  disconnects = 0;
  viewport = 0;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    get: () => viewport,
  });
});

afterEach(() => {
  cleanup();
  delete (globalThis as Record<string, unknown>).ResizeObserver;
  delete (document.documentElement as unknown as Record<string, unknown>).clientWidth;
});

describe("AppSizeClassProvider and useAppSizeClass (viewport source)", () => {
  it("defaults to 'compact' without a provider", () => {
    render(<Probe />);
    expect(sizeText()).toBe("compact");
  });

  it("measures documentElement.clientWidth synchronously on mount, before any observer callback", () => {
    setViewport(800);
    render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>,
    );
    expect(sizeText()).toBe("regular");
    expect(callbacks.length).toBe(1);
    expect(observed[0]).toBe(document.documentElement);
  });

  it("gives the same class from the first measure and the first observer callback (no flip)", () => {
    setViewport(700);
    render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>,
    );
    expect(sizeText()).toBe("regular");
    fireObserver();
    expect(sizeText()).toBe("regular");
  });

  it("ignores the element's own width: the observer entry and getBoundingClientRect do not matter", () => {
    setViewport(1040);
    const main = document.createElement("main");
    main.setAttribute(APP_MAIN_ATTRIBUTE, "");
    document.body.appendChild(main);
    main.getBoundingClientRect = () => ({ width: 300 }) as DOMRect;
    render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>,
    );
    expect(sizeText()).toBe("wide");
    fireObserver();
    expect(sizeText()).toBe("wide");
    main.remove();
  });

  it("follows the viewport through the observer: regular, wide, compact", () => {
    setViewport(800);
    render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>,
    );
    expect(sizeText()).toBe("regular");

    setViewport(1500);
    fireObserver();
    expect(sizeText()).toBe("wide");

    setViewport(400);
    fireObserver();
    expect(sizeText()).toBe("compact");
  });

  it.each([
    [639, "compact"],
    [640, "regular"],
    [1024, "regular"],
    [1025, "wide"],
  ] as const)("boundary: viewport %i gives '%s' (CSS: regular >= 40rem, wide > 64rem)", (width, expected) => {
    setViewport(width);
    render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>,
    );
    expect(sizeText()).toBe(expected);
  });

  it("renders without ResizeObserver and still measures", () => {
    delete (globalThis as Record<string, unknown>).ResizeObserver;
    setViewport(900);
    render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>,
    );
    expect(sizeText()).toBe("regular");
  });

  it("disconnects the observer on unmount", () => {
    const { unmount } = render(
      <AppSizeClassProvider>
        <Probe />
      </AppSizeClassProvider>,
    );
    expect(callbacks.length).toBe(1);
    expect(disconnects).toBe(0);
    unmount();
    expect(disconnects).toBe(1);
  });
});
