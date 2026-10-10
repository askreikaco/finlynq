/**
 * @vitest-environment jsdom
 * Locked DEK: automatic passkey unlock (once per page load), then the compact password card.
 * No banner text, no Dismiss button. Escape hides the card; it returns on the next locked action.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as fs from "fs";
import { resolve } from "path";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const passkeyLogin = vi.fn();
const pending = { value: false };
vi.mock("@/lib/client/passkey-prf", () => ({
  passkeyLogin: (...a: unknown[]) => passkeyLogin(...a),
  isWebAuthnPending: () => pending.value,
}));
const hardReload = vi.fn();
vi.mock("@/lib/client/hard-reload", () => ({ hardReload: (...a: unknown[]) => hardReload(...a) }));

import { UnlockGate } from "@/components/unlock-gate";

const state = {
  locked: true,
  deviceId: null as string | null,
  prfPasskeys: false,
  login: null as null | ((body: { identifier: string; password: string; trustDevice: boolean }) => Response),
};
let fetchMock: ReturnType<typeof vi.fn>;
const loginCalls = () => fetchMock.mock.calls.filter((c) => c[0] === "/api/auth/login");

beforeEach(() => {
  state.locked = true;
  state.deviceId = null;
  state.prfPasskeys = false;
  state.login = null;
  pending.value = false;
  passkeyLogin.mockReset();
  hardReload.mockReset();
  (window as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential = function () {};
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session")
      return new Response(
        JSON.stringify({ authenticated: true, userId: "u1", username: "reika", email: "a@b.c", encryptionLocked: state.locked }),
        { status: 200 },
      );
    if (url === "/api/auth/device-current") return new Response(JSON.stringify({ id: state.deviceId }), { status: 200 });
    if (url === "/api/settings/passkeys")
      return new Response(JSON.stringify({ passkeys: state.prfPasskeys ? [{ id: "p1", prfSupported: true }] : [] }), { status: 200 });
    if (url === "/api/auth/login") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return state.login ? state.login(body) : new Response(JSON.stringify({ error: "x" }), { status: 401 });
    }
    if (url === "/api/transactions") return new Response(JSON.stringify({ error: "session_locked" }), { status: 423 });
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const passwordField = () => screen.findByLabelText("Password");

describe("unlock: automatic passkey", () => {
  it("locked + PRF passkey: passkey unlock runs exactly once with no click, and no banner text", async () => {
    state.prfPasskeys = true;
    passkeyLogin.mockResolvedValue({ ok: true, json: {} });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(hardReload).toHaveBeenCalledTimes(1));
    expect(passkeyLogin).toHaveBeenCalledTimes(1);
    expect(passkeyLogin).toHaveBeenCalledWith({ trustDevice: false });
    expect(screen.queryByText(/Your data is locked/)).toBeNull();
    expect(screen.queryByText("Unlock with passkey")).toBeNull();
    expect(screen.queryByText("Unlock with password")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("trusted browser passes trustDevice true to the automatic attempt", async () => {
    state.prfPasskeys = true;
    state.deviceId = "dev-1";
    passkeyLogin.mockResolvedValue({ ok: true, json: {} });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await waitFor(() => expect(passkeyLogin).toHaveBeenCalledWith({ trustDevice: true }));
  });

  it("passkey failed: password card appears with a 'Use passkey' link", async () => {
    state.prfPasskeys = true;
    passkeyLogin.mockResolvedValue({ ok: false, code: "failed", status: 400 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    expect(await passwordField()).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Passkey unlock failed");
    expect(screen.getByRole("button", { name: "Use passkey" })).toBeInTheDocument();
    expect(passkeyLogin).toHaveBeenCalledTimes(1);
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("passkey cancelled: password card appears silently with a 'Use passkey' link", async () => {
    state.prfPasskeys = true;
    passkeyLogin.mockResolvedValue({ ok: false, code: "cancelled", status: 0 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    expect(await passwordField()).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Use passkey" })).toBeInTheDocument();
  });

  it("no passkey: password card without 'Use passkey', and the passkey function is never called", async () => {
    render(<UnlockGate><div>app</div></UnlockGate>);
    expect(await passwordField()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use passkey" })).toBeNull();
    expect(passkeyLogin).not.toHaveBeenCalled();
  });

  it("a passkey without PRF support does not start the automatic attempt", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/session")
        return new Response(JSON.stringify({ authenticated: true, userId: "u1", username: "reika", encryptionLocked: true }), { status: 200 });
      if (url === "/api/settings/passkeys") return new Response(JSON.stringify({ passkeys: [{ id: "p1", prfSupported: false }] }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    render(<UnlockGate><div>app</div></UnlockGate>);
    expect(await passwordField()).toBeInTheDocument();
    expect(passkeyLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Use passkey" })).toBeNull();
  });

  it("does not start while another WebAuthn call is pending; the password card still shows", async () => {
    state.prfPasskeys = true;
    pending.value = true;
    render(<UnlockGate><div>app</div></UnlockGate>);
    expect(await passwordField()).toBeInTheDocument();
    expect(passkeyLogin).not.toHaveBeenCalled();
  });

  it("'Use passkey' link runs a manual attempt and reloads on success", async () => {
    state.prfPasskeys = true;
    passkeyLogin
      .mockResolvedValueOnce({ ok: false, code: "failed", status: 400 })
      .mockResolvedValueOnce({ ok: true, json: {} });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.click(await screen.findByRole("button", { name: "Use passkey" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledTimes(1));
    expect(passkeyLogin).toHaveBeenCalledTimes(2);
  });
});

describe("unlock: no retrigger loop", () => {
  it("re-render with the same locked state, and repeated locked calls, keep the automatic attempt at one", async () => {
    state.prfPasskeys = true;
    passkeyLogin.mockResolvedValue({ ok: false, code: "failed", status: 400 });
    const tree = <UnlockGate><div>app</div></UnlockGate>;
    const { rerender } = render(tree);
    await passwordField();
    rerender(tree);
    await act(async () => {
      await fetch("/api/transactions");
      await fetch("/api/transactions");
    });
    rerender(tree);
    expect(passkeyLogin).toHaveBeenCalledTimes(1);
  });

  it("two consecutive failures do not cause another automatic attempt", async () => {
    state.prfPasskeys = true;
    passkeyLogin.mockResolvedValue({ ok: false, code: "failed", status: 400 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await passwordField();
    await userEvent.click(screen.getByRole("button", { name: "Use passkey" }));
    await waitFor(() => expect(passkeyLogin).toHaveBeenCalledTimes(2));
    expect(passkeyLogin).toHaveBeenCalledTimes(2);
  });

  it("Escape hides the card; the next locked action shows it again without a new automatic attempt", async () => {
    state.prfPasskeys = true;
    passkeyLogin.mockResolvedValue({ ok: false, code: "failed", status: 400 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await passwordField();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
    await act(async () => {
      await fetch("/api/transactions");
    });
    expect(await passwordField()).toBeInTheDocument();
    expect(passkeyLogin).toHaveBeenCalledTimes(1);
  });
});

describe("unlock: password card", () => {
  it("successful password unlock posts identifier + password and reloads like the passkey path", async () => {
    state.login = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.type(await passwordField(), "correct horse");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledTimes(1));
    expect(loginCalls()).toHaveLength(1);
    expect(JSON.parse(String(loginCalls()[0][1].body))).toMatchObject({ identifier: "reika", password: "correct horse" });
    expect(hardReload.mock.calls[0]).toEqual([]);
  });

  it("wrong password shows an inline error and does not reload", async () => {
    state.login = () => new Response(JSON.stringify({ error: "nope" }), { status: 401 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.type(await passwordField(), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect.");
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("MFA account is sent to /cloud to finish sign-in", async () => {
    state.login = () => new Response(JSON.stringify({ mfaRequired: true, mfaPendingToken: "t" }), { status: 200 });
    render(<UnlockGate><div>app</div></UnlockGate>);
    await userEvent.type(await passwordField(), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledTimes(1));
    expect(hardReload.mock.calls[0][0]).toMatch(/^\/cloud\?redirect=/);
  });

  it("card has no Dismiss button and no explanatory paragraph", async () => {
    render(<UnlockGate><div>app</div></UnlockGate>);
    await passwordField();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
    expect(screen.queryByText(/Unlock it to make changes/)).toBeNull();
  });
});

describe("unlock: unlocked state", () => {
  it("renders nothing when the session is unlocked", async () => {
    state.locked = false;
    render(<UnlockGate><div>app</div></UnlockGate>);
    await screen.findByText("app");
    expect(screen.queryByRole("dialog", { name: "Unlock your data" })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(passkeyLogin).not.toHaveBeenCalled();
  });
});

describe("unlock: old banner is gone from src", () => {
  const root = resolve(process.cwd(), "src");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(resolve(dir, d.name)) : /\.(tsx?|jsx?)$/.test(d.name) ? [resolve(dir, d.name)] : [],
    );
  it("no source file contains the old banner strings", () => {
    const hits = walk(root).filter((f) => {
      const s = fs.readFileSync(f, "utf8");
      return /Your data is locked|Unlock with passkey|Unlock with password/.test(s);
    });
    expect(hits).toEqual([]);
  });
  it("unlock panel and gate have no Dismiss control", () => {
    for (const f of ["components/unlock-panel.tsx", "components/unlock-gate.tsx"]) {
      expect(fs.readFileSync(resolve(root, f), "utf8")).not.toMatch(/>\s*Dismiss\s*</);
    }
  });
});
