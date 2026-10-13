// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

type FakeSW = EventTarget & {
  controller: object | null;
  register: (url: string, opts: unknown) => Promise<unknown>;
};

const update = vi.fn(async () => undefined);

function installServiceWorker(hasController: boolean): FakeSW {
  const target = new EventTarget() as FakeSW;
  target.controller = hasController ? {} : null;
  target.register = vi.fn(async () => ({ addEventListener: vi.fn(), update }));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: target });
  return target;
}

async function mountPwaRegister() {
  const mod = await import("@/components/pwa-register");
  const r = render(<mod.PwaRegister />);
  await new Promise((res) => setTimeout(res, 0)); // let register() resolve
  return { ...r, mod };
}

describe("PwaRegister silent update", () => {
  const reload = vi.fn();
  const assign = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    reload.mockReset();
    assign.mockReset();
    update.mockClear();
    vi.stubEnv("NODE_ENV", "production");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload, assign, origin: "http://localhost:3000", href: "http://localhost:3000/a", pathname: "/a", search: "" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });

  it("never reloads on controllerchange (no prompt, no forced reload)", async () => {
    const sw = installServiceWorker(true);
    await mountPwaRegister();
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("after an update, the next link click does a full page load", async () => {
    const sw = installServiceWorker(true);
    await mountPwaRegister();
    const a = document.createElement("a");
    a.href = "http://localhost:3000/b";
    document.body.appendChild(a);
    // before update: normal client transition
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(assign).not.toHaveBeenCalled();
    sw.dispatchEvent(new Event("controllerchange"));
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    a.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(assign).toHaveBeenCalledWith("http://localhost:3000/b");
    // only once
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("does not hijack the first install or modified/external clicks", async () => {
    const sw = installServiceWorker(false);
    await mountPwaRegister();
    sw.dispatchEvent(new Event("controllerchange"));
    const a = document.createElement("a");
    a.href = "http://localhost:3000/b";
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(assign).not.toHaveBeenCalled();
  });

  it("updates the registration when the tab becomes visible, throttled to once per 60 s", async () => {
    installServiceWorker(true);
    await mountPwaRegister();
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("recovers from a chunk load error with exactly one silent reload", async () => {
    installServiceWorker(true);
    await mountPwaRegister();
    const fire = () => {
      const e = new Event("unhandledrejection") as Event & { reason: unknown };
      e.reason = new Error("Loading chunk 123 failed.");
      window.dispatchEvent(e);
    };
    fire();
    fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("pwa-chunk-reload-at")).not.toBeNull();
  });

  it("ignores unrelated errors", async () => {
    installServiceWorker(true);
    await mountPwaRegister();
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", error: new Error("boom") }));
    expect(reload).not.toHaveBeenCalled();
  });

  it("clears the chunk-reload guard after 60 s of stable load", async () => {
    vi.useFakeTimers();
    installServiceWorker(true);
    sessionStorage.setItem("pwa-chunk-reload-at", "1");
    const mod = await import("@/components/pwa-register");
    render(<mod.PwaRegister />);
    vi.advanceTimersByTime(60_001);
    expect(sessionStorage.getItem("pwa-chunk-reload-at")).toBeNull();
  });

  it("isChunkLoadError matches the known failure shapes", async () => {
    const { isChunkLoadError } = await import("@/components/pwa-register");
    expect(isChunkLoadError({ name: "ChunkLoadError", message: "x" })).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: /a.js"))).toBe(true);
    expect(isChunkLoadError(new Error("nope"))).toBe(false);
  });
});
