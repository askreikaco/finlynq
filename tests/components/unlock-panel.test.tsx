/**
 * @vitest-environment jsdom
 * 423 (DEK locked) in the app shell offers passkey unlock next to the password path.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const passkeyLogin = vi.fn();
vi.mock("@/lib/client/passkey-prf", () => ({ passkeyLogin: (...a: unknown[]) => passkeyLogin(...a) }));
const hardReload = vi.fn();
vi.mock("@/lib/client/hard-reload", () => ({ hardReload: (...a: unknown[]) => hardReload(...a) }));

import { UnlockGate } from "@/components/unlock-gate";

let locked = false;
let deviceId: string | null = null;
beforeEach(() => {
  locked = false;
  deviceId = null;
  passkeyLogin.mockReset();
  hardReload.mockReset();
  (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/session")
        return new Response(JSON.stringify({ authenticated: true, encryptionLocked: locked }), { status: 200 });
      if (url === "/api/auth/device-current") return new Response(JSON.stringify({ id: deviceId }), { status: 200 });
      if (url === "/api/transactions") return new Response(JSON.stringify({ error: "session_locked" }), { status: 423 });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("unlock panel", () => {
  it("not shown while unlocked", async () => {
    render(<UnlockGate><div>app</div></UnlockGate>);
    await screen.findByText("app");
    expect(screen.queryByText("Unlock with passkey")).toBeNull();
  });

  it("an API 423 opens the panel with passkey + password options", async () => {
    render(<UnlockGate><div>app</div></UnlockGate>);
    await screen.findByText("app");
    await fetch("/api/transactions");
    expect(await screen.findByText("Unlock with passkey")).toBeInTheDocument();
    expect(screen.getByText("Unlock with password")).toBeInTheDocument();
  });

  it("session reporting encryptionLocked opens it on load", async () => {
    locked = true;
    render(<UnlockGate><div>app</div></UnlockGate>);
    expect(await screen.findByText("Unlock with passkey")).toBeInTheDocument();
  });

  it("passkey unlock reloads on success; untrusted browser -> trustDevice false", async () => {
    locked = true;
    passkeyLogin.mockResolvedValue({ ok: true, json: {} });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.click(await screen.findByText("Unlock with passkey"));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(passkeyLogin).toHaveBeenCalledWith({ trustDevice: false });
  });

  it("trusted browser keeps trustDevice true", async () => {
    locked = true;
    deviceId = "dev-1";
    passkeyLogin.mockResolvedValue({ ok: true, json: {} });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.click(await screen.findByText("Unlock with passkey"));
    await waitFor(() => expect(passkeyLogin).toHaveBeenCalledWith({ trustDevice: true }));
  });

  it("prf_unavailable shows a message and does not reload; password path goes to /cloud with return", async () => {
    locked = true;
    passkeyLogin.mockResolvedValue({ ok: false, code: "prf_unavailable", status: 400 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.click(await screen.findByText("Unlock with passkey"));
    expect(await screen.findByRole("alert")).toHaveTextContent("can't unlock your data");
    expect(hardReload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("Unlock with password"));
    expect(hardReload.mock.calls[0][0]).toMatch(/^\/cloud\?redirect=/);
  });

  it("hides the passkey button without WebAuthn", async () => {
    delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    locked = true;
    render(<UnlockGate><div>app</div></UnlockGate>);
    await screen.findByText("Unlock with password");
    expect(screen.queryByText("Unlock with passkey")).toBeNull();
  });
});
