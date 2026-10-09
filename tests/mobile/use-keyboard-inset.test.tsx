/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook, cleanup } from "@testing-library/react";
import {
  useKeyboardInset,
  computeKeyboardInset,
} from "@/components/mobile/use-keyboard-inset";

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

type FakeVV = EventTarget & { height: number; offsetTop: number; width: number };

function makeVV(height: number, offsetTop = 0): FakeVV {
  const vv = new EventTarget() as FakeVV;
  vv.height = height;
  vv.offsetTop = offsetTop;
  vv.width = 390;
  return vv;
}

let queue: Array<FrameRequestCallback> = [];
const flush = () => {
  const cbs = queue;
  queue = [];
  cbs.forEach((cb) => cb(0));
};

function setVV(vv: FakeVV | undefined) {
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
}

beforeEach(() => {
  queue = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  document.documentElement.style.removeProperty("--kb-inset");
  document.documentElement.removeAttribute("data-keyboard-open");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setVV(undefined);
});

describe("computeKeyboardInset", () => {
  it("is innerHeight - visualViewport.height - offsetTop, rounded and floored at 0", () => {
    expect(computeKeyboardInset(800, { height: 480, offsetTop: 0 })).toBe(320);
    expect(computeKeyboardInset(800, { height: 480, offsetTop: 40 })).toBe(280);
    expect(computeKeyboardInset(800, { height: 800.4, offsetTop: 0 })).toBe(0);
    expect(computeKeyboardInset(800, { height: 900, offsetTop: 0 })).toBe(0);
    expect(computeKeyboardInset(800, null)).toBe(0);
  });
});

describe("useKeyboardInset", () => {
  it("sets --kb-inset and data-keyboard-open when the keyboard covers >100px", () => {
    setVV(makeVV(480));
    renderHook(() => useKeyboardInset());
    flush();
    const html = document.documentElement;
    expect(html.style.getPropertyValue("--kb-inset")).toBe("320px");
    expect(html.hasAttribute("data-keyboard-open")).toBe(true);
  });

  it("does not set data-keyboard-open for a small overlap (<=100px)", () => {
    setVV(makeVV(760));
    renderHook(() => useKeyboardInset());
    flush();
    const html = document.documentElement;
    expect(html.style.getPropertyValue("--kb-inset")).toBe("40px");
    expect(html.hasAttribute("data-keyboard-open")).toBe(false);
  });

  it("follows resize events and toggles the attribute off when the keyboard closes", () => {
    const vv = makeVV(800);
    setVV(vv);
    renderHook(() => useKeyboardInset());
    flush();
    const html = document.documentElement;
    expect(html.style.getPropertyValue("--kb-inset")).toBe("0px");
    expect(html.hasAttribute("data-keyboard-open")).toBe(false);

    vv.height = 480;
    vv.dispatchEvent(new Event("resize"));
    flush();
    expect(html.style.getPropertyValue("--kb-inset")).toBe("320px");
    expect(html.hasAttribute("data-keyboard-open")).toBe(true);

    vv.height = 800;
    vv.dispatchEvent(new Event("resize"));
    flush();
    expect(html.style.getPropertyValue("--kb-inset")).toBe("0px");
    expect(html.hasAttribute("data-keyboard-open")).toBe(false);
  });

  it("follows scroll events (iOS pans the visual viewport via offsetTop)", () => {
    const vv = makeVV(480, 0);
    setVV(vv);
    renderHook(() => useKeyboardInset());
    flush();
    vv.offsetTop = 60;
    vv.dispatchEvent(new Event("scroll"));
    flush();
    expect(document.documentElement.style.getPropertyValue("--kb-inset")).toBe("260px");
  });

  it("throttles bursts of events to one animation frame", () => {
    const vv = makeVV(480);
    setVV(vv);
    renderHook(() => useKeyboardInset());
    flush();
    for (let i = 0; i < 10; i++) vv.dispatchEvent(new Event("resize"));
    expect(queue.length).toBe(1);
  });

  it("removes its listeners and clears the vars on unmount", () => {
    const vv = makeVV(480);
    const removeSpy = vi.spyOn(vv, "removeEventListener");
    setVV(vv);
    const { unmount } = renderHook(() => useKeyboardInset());
    flush();
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    const html = document.documentElement;
    expect(html.style.getPropertyValue("--kb-inset")).toBe("");
    expect(html.hasAttribute("data-keyboard-open")).toBe(false);
    vv.height = 300;
    vv.dispatchEvent(new Event("resize"));
    flush();
    expect(html.style.getPropertyValue("--kb-inset")).toBe("");
  });

  it("does nothing in browsers without visualViewport", () => {
    setVV(undefined);
    expect(() => renderHook(() => useKeyboardInset())).not.toThrow();
    flush();
    const html = document.documentElement;
    expect(html.style.getPropertyValue("--kb-inset")).toBe("");
    expect(html.hasAttribute("data-keyboard-open")).toBe(false);
  });
});

describe("keyboard-open CSS and wiring", () => {
  const css = read("src/app/globals.css");

  it("hides the mobile tab bar while the keyboard is open", () => {
    expect(css).toMatch(
      /html\[data-keyboard-open\] nav\[aria-label="Mobile navigation"\][^{]*\{\s*display:\s*none;?\s*\}/,
    );
  });

  it("hides the page FAB while the keyboard is open", () => {
    expect(css).toMatch(
      /html\[data-keyboard-open\] \[data-testid="page-fab"\][^{]*\{\s*display:\s*none;?\s*\}/,
    );
  });

  it("app layout mounts the observer; root viewport opts into resizes-content", () => {
    expect(read("src/app/(app)/layout.tsx")).toContain("<KeyboardInsetObserver />");
    expect(read("src/app/layout.tsx")).toContain('interactiveWidget: "resizes-content"');
    expect(read("src/app/layout.tsx")).toContain("maximumScale: 1");
  });
});
