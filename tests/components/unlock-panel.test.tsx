/**
 * @vitest-environment jsdom
 * Manual unlock path of the locked-DEK card (see unlock-auto.test.tsx for the automatic attempt).
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const passkeyLogin = vi.fn();
vi.mock("@/lib/client/passkey-prf", () => ({
  passkeyLogin: (...a: unknown[]) => passkeyLogin(...a),
  isWebAuthnPending: () => false,
}));
const hardReload = vi.fn();
vi.mock("@/lib/client/hard-reload", () => ({ hardReload: (...a: unknown[]) => hardReload(...a) }));

import { UnlockGate } from "@/components/unlock-gate";

let locked = false;
let prf = false;
beforeEach(() => {
  locked = false;
  prf = false;
  passkeyLogin.mockReset();
  hardReload.mockReset();
  (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/auth/session")
        return new Response(JSON.stringify({ authenticated: true, userId: "u1", username: "reika", encryptionLocked: locked }), { status: 200 });
      if (url === "/api/auth/device-current") return new Response(JSON.stringify({ id: null }), { status: 200 });
      if (url === "/api/settings/passkeys")
        return new Response(JSON.stringify({ passkeys: prf ? [{ id: "p1", prfSupported: true }] : [] }), { status: 200 });
      if (url === "/api/transactions") return new Response(JSON.stringify({ error: "session_locked" }), { status: 423 });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("unlock panel (manual path)", () => {
  it("not shown while unlocked", async () => {
    render(<UnlockGate><div>app</div></UnlockGate>);
    await screen.findByText("app");
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("an API 423 opens the password card; no passkey means no 'Use passkey' link", async () => {
    render(<UnlockGate><div>app</div></UnlockGate>);
    await screen.findByText("app");
    await fetch("/api/transactions");
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use passkey" })).toBeNull();
    expect(passkeyLogin).not.toHaveBeenCalled();
  });

  it("'Use passkey' reloads on success", async () => {
    locked = true;
    prf = true;
    passkeyLogin.mockResolvedValueOnce({ ok: false, code: "failed", status: 400 }).mockResolvedValueOnce({ ok: true, json: {} });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.click(await screen.findByRole("button", { name: "Use passkey" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
  });

  it("prf_unavailable shows an inline message and does not reload", async () => {
    locked = true;
    prf = true;
    passkeyLogin.mockResolvedValue({ ok: false, code: "prf_unavailable", status: 400 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.click(await screen.findByRole("button", { name: "Use passkey" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("can't unlock on its own");
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("hides the passkey link without WebAuthn", async () => {
    delete (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    locked = true;
    prf = true;
    render(<UnlockGate><div>app</div></UnlockGate>);
    await screen.findByLabelText("Password");
    expect(screen.queryByRole("button", { name: "Use passkey" })).toBeNull();
    expect(passkeyLogin).not.toHaveBeenCalled();
  });
});
