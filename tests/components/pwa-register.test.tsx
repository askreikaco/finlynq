/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PwaRegister } from "@/components/pwa-register";

const register = vi.fn().mockResolvedValue({ addEventListener: () => {}, installing: null });

function stubSW() {
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register, controller: null, addEventListener: () => {}, removeEventListener: () => {} },
    configurable: true,
  });
}

describe("PwaRegister", () => {
  afterEach(() => {
    cleanup();
    register.mockClear();
    vi.unstubAllEnvs();
  });

  it("does not call navigator.serviceWorker.register in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    stubSW();
    render(<PwaRegister />);
    expect(register).not.toHaveBeenCalled();
  });

  it("registers /sw.js in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    stubSW();
    render(<PwaRegister />);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });
});
