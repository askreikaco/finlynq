/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

process.env.NEXT_PUBLIC_APP_BUILD = "100";

let serverBuild = "100";
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ build: serverBuild }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetModules(); });

async function mount() {
  const { VersionGate } = await import("@/components/version-gate");
  render(<VersionGate />);
}

describe("VersionGate", () => {
  it("stays hidden while the server runs the same build", async () => {
    serverBuild = "100";
    await mount();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/version", { cache: "no-store" }));
    expect(screen.queryByTestId("version-gate")).toBeNull();
  });

  it("asks to update when the server build changed; Update reloads once per build", async () => {
    serverBuild = "200";
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
    await mount();
    expect(await screen.findByText("New version available")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Update/ }));
    expect(reload).toHaveBeenCalled();
    expect(sessionStorage.getItem("pf-reloaded-for-build")).toBe("200");
  });

  it("does not loop: after reloading for a build, a still-different id stays hidden", async () => {
    serverBuild = "200";
    sessionStorage.setItem("pf-reloaded-for-build", "200");
    await mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByTestId("version-gate")).toBeNull();
  });
});
