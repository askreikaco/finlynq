// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

type FakeSW = EventTarget & {
  controller: object | null;
  register: (url: string, opts: unknown) => Promise<unknown>;
};

function installServiceWorker(hasController: boolean): FakeSW {
  const target = new EventTarget() as FakeSW;
  target.controller = hasController ? {} : null;
  target.register = vi.fn(async () => ({ addEventListener: vi.fn() }));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: target });
  return target;
}

async function mountPwaRegister() {
  const mod = await import("@/components/pwa-register");
  return render(<mod.PwaRegister />);
}

describe("PwaRegister controllerchange reload", () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    reload.mockReset();
    vi.stubEnv("NODE_ENV", "production");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    Object.defineProperty(document, "activeElement", { configurable: true, get: () => document.body });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });

  it("reloads once when a new worker takes control of an already-controlled page", async () => {
    const sw = installServiceWorker(true);
    await mountPwaRegister();
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload on first install (no controller at load)", async () => {
    const sw = installServiceWorker(false);
    await mountPwaRegister();
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload twice on repeated controllerchange", async () => {
    const sw = installServiceWorker(true);
    await mountPwaRegister();
    sw.dispatchEvent(new Event("controllerchange"));
    sw.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
