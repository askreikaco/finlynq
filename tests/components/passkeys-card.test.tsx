/**
 * @vitest-environment jsdom
 * Settings > Account > PasskeysCard: list, add (incl. PRF), rename, remove with
 * step-up, enable password-free unlock. fetch is routed; the WebAuthn browser
 * lib is mocked UNDER the real client helper (src/lib/client/passkey-prf.ts).
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const startRegistration = vi.fn();
const startAuthentication = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: (...a: unknown[]) => startRegistration(...a),
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
}));

import { PasskeysCard } from "@/components/settings/passkeys-card";

type Reply = { status?: number; body: unknown };
type Handler = (body: Record<string, unknown>) => Reply;
let handlers: Record<string, Handler>;
let calls: { method: string; url: string; body: Record<string, unknown> }[];
let list: Array<Record<string, unknown>>;

const PRF32 = new Uint8Array(32).fill(5).buffer;
const attestation = (prfEnabled?: boolean) => ({
  id: "newcred",
  rawId: "newcred",
  type: "public-key",
  response: { clientDataJSON: "a", attestationObject: "b" },
  clientExtensionResults: prfEnabled === undefined ? {} : { prf: { enabled: prfEnabled } },
});
const assertion = (prf?: ArrayBuffer) => ({
  id: "newcred",
  rawId: "newcred",
  type: "public-key",
  response: { clientDataJSON: "a", authenticatorData: "b", signature: "c" },
  clientExtensionResults: prf ? { prf: { results: { first: prf } } } : {},
});

const KEY = (m: string, u: string) => `${m} ${u}`;
const callsTo = (m: string, u: string) => calls.filter((c) => c.method === m && c.url === u);

beforeEach(() => {
  calls = [];
  startRegistration.mockReset();
  startAuthentication.mockReset();
  list = [
    { id: "pk1", label: "MacBook", createdAt: "2026-09-01T10:00:00.000Z", lastUsedAt: "2026-09-20T10:00:00.000Z", backedUp: true, prfSupported: true },
    { id: "pk2", label: "YubiKey", createdAt: "2026-09-02T10:00:00.000Z", lastUsedAt: null, backedUp: false, prfSupported: false },
  ];
  handlers = {
    [KEY("GET", "/api/settings/passkeys")]: () => ({ body: { passkeys: list } }),
  };
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, url, body });
      const h = handlers[KEY(method, url)];
      const r = h ? h(body) : { status: 404, body: {} };
      const status = r.status ?? 200;
      return { ok: status < 400, status, json: async () => r.body } as Response;
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  render(<PasskeysCard />);
  await screen.findByText("MacBook");
}

describe("PasskeysCard list", () => {
  it("shows name, created, last used, and the unlock badge only for PRF credentials", async () => {
    await renderLoaded();
    const mac = screen.getByTestId("passkey-pk1");
    expect(within(mac).getByText("MacBook")).toBeInTheDocument();
    expect(within(mac).getByText(/added/i)).toBeInTheDocument();
    expect(within(mac).getByText(/last used/i)).toBeInTheDocument();
    expect(within(mac).getByText(/unlock without password/i)).toBeInTheDocument();
    expect(within(mac).queryByRole("button", { name: /enable password-free unlock/i })).toBeNull();

    const yubi = screen.getByTestId("passkey-pk2");
    expect(within(yubi).getByText(/never used/i)).toBeInTheDocument();
    expect(within(yubi).getByText(/2FA only/i)).toBeInTheDocument();
    expect(within(yubi).queryByText(/unlock without password/i)).toBeNull();
    expect(within(yubi).getByRole("button", { name: /enable password-free unlock/i })).toBeInTheDocument();
  });

  it("disables Add when the browser has no WebAuthn", async () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    await renderLoaded();
    expect(screen.getByRole("button", { name: /add a passkey/i })).toBeDisabled();
    expect(screen.getByText(/does not support passkeys/i)).toBeInTheDocument();
  });
});

describe("PasskeysCard add", () => {
  function wireAdd(over: { prfEnabled?: boolean; needsPrf?: boolean } = {}) {
    handlers[KEY("POST", "/api/settings/passkeys/register/options")] = () => ({ body: { options: { challenge: "c1", rp: { id: "x" } }, token: "reg-token" } });
    handlers[KEY("POST", "/api/settings/passkeys/register/verify")] = () => ({
      body: { id: "newcred", label: "Phone", prfSupported: false, needsPrfAssertion: over.needsPrf ?? true },
    });
    handlers[KEY("POST", "/api/settings/passkeys/register/prf-options")] = () => ({
      body: { options: { challenge: "c2", allowCredentials: [] }, token: "prf-token", prfSalt: Buffer.alloc(32, 1).toString("base64url") },
    });
    handlers[KEY("POST", "/api/settings/passkeys/register/finish-prf")] = () => ({ body: { ok: true } });
    startRegistration.mockResolvedValue(attestation(over.prfEnabled ?? true));
  }

  it("register/options -> create -> register/verify -> PRF assertion -> finish-prf, then reloads the list", async () => {
    const user = userEvent.setup();
    wireAdd();
    startAuthentication.mockResolvedValue(assertion(PRF32));
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /add a passkey/i }));
    expect(await screen.findByText(/it can also unlock your data without your password/i)).toBeInTheDocument();
    const order = calls.map((c) => `${c.method} ${c.url}`).filter((x) => x.includes("register"));
    expect(order).toEqual([
      "POST /api/settings/passkeys/register/options",
      "POST /api/settings/passkeys/register/verify",
      "POST /api/settings/passkeys/register/prf-options",
      "POST /api/settings/passkeys/register/finish-prf",
    ]);
    const verify = callsTo("POST", "/api/settings/passkeys/register/verify")[0].body;
    expect(verify).toMatchObject({ token: "reg-token" });
    expect(verify).not.toHaveProperty("label"); // server names it
    expect((verify.response as { id: string }).id).toBe("newcred");
    expect(callsTo("POST", "/api/settings/passkeys/register/prf-options")[0].body).toMatchObject({ credentialId: "newcred" });
    const finish = callsTo("POST", "/api/settings/passkeys/register/finish-prf")[0].body;
    expect(finish).toMatchObject({ token: "prf-token" });
    expect(typeof finish.prfOutput).toBe("string");
    expect(callsTo("GET", "/api/settings/passkeys").length).toBeGreaterThanOrEqual(2);
  });

  it("Add: no name input, one click goes straight to the WebAuthn prompt, list shows the generated name", async () => {
    const user = userEvent.setup();
    wireAdd();
    startAuthentication.mockResolvedValue(assertion(PRF32));
    const added = { id: "newcred", label: "iPhone · Safari", createdAt: "2026-10-01T10:00:00.000Z", lastUsedAt: null, backedUp: true, prfSupported: true };
    handlers[KEY("GET", "/api/settings/passkeys")] = () => ({
      body: { passkeys: callsTo("POST", "/api/settings/passkeys/register/verify").length ? [...list, added] : list },
    });
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /add a passkey/i }));
    expect(screen.queryByLabelText(/passkey name/i)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    await waitFor(() => expect(startRegistration).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/it can also unlock/i)).toBeInTheDocument();
    expect(await screen.findByText("iPhone · Safari")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rename iphone · safari/i })).toBeInTheDocument();
  });

  it("the PRF value never leaves in the assertion JSON", async () => {
    const user = userEvent.setup();
    wireAdd();
    startAuthentication.mockResolvedValue(assertion(PRF32));
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /add a passkey/i }));
    await screen.findByText(/it can also unlock/i);
    const finish = callsTo("POST", "/api/settings/passkeys/register/finish-prf")[0].body;
    expect((finish.response as { clientExtensionResults: unknown }).clientExtensionResults).toEqual({});
    expect(JSON.stringify(finish.response)).not.toContain(String(finish.prfOutput));
  });

  it("needsPrfAssertion false: no PRF step, 2FA-only note", async () => {
    const user = userEvent.setup();
    wireAdd({ needsPrf: false, prfEnabled: false });
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /add a passkey/i }));
    expect(await screen.findByText(/two-factor verification; it cannot unlock/i)).toBeInTheDocument();
    expect(callsTo("POST", "/api/settings/passkeys/register/prf-options")).toHaveLength(0);
  });

  it("authenticator returns no PRF: still added, falls back to the 2FA-only note", async () => {
    const user = userEvent.setup();
    wireAdd();
    startAuthentication.mockResolvedValue(assertion());
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /add a passkey/i }));
    expect(await screen.findByText(/cannot unlock your data without your password on this device/i)).toBeInTheDocument();
    expect(callsTo("POST", "/api/settings/passkeys/register/finish-prf")).toHaveLength(0);
  });

  it("cancelled create prompt: nothing is verified or stored", async () => {
    const user = userEvent.setup();
    wireAdd();
    startRegistration.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /add a passkey/i }));
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument();
    expect(callsTo("POST", "/api/settings/passkeys/register/verify")).toHaveLength(0);
  });

  it("stale session: options 401 asks for the password, then retries with it", async () => {
    const user = userEvent.setup();
    wireAdd();
    let n = 0;
    const ok = handlers[KEY("POST", "/api/settings/passkeys/register/options")];
    handlers[KEY("POST", "/api/settings/passkeys/register/options")] = (b) =>
      b.currentPassword ? ok(b) : (n++, { status: 401, body: { error: "Password required for this action." } });
    startAuthentication.mockResolvedValue(assertion(PRF32));
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /add a passkey/i }));
    const pw = await screen.findByLabelText(/current password/i);
    expect(n).toBe(1);
    expect(startRegistration).not.toHaveBeenCalled();
    await user.type(pw, "Hunter2!Hunter2");
    await user.click(screen.getByRole("button", { name: /create passkey/i }));
    await screen.findByText(/it can also unlock/i);
    expect(callsTo("POST", "/api/settings/passkeys/register/options").at(-1)!.body).toEqual({ currentPassword: "Hunter2!Hunter2" });
    // the same password is reused for the PRF step
    expect(callsTo("POST", "/api/settings/passkeys/register/prf-options")[0].body).toMatchObject({ currentPassword: "Hunter2!Hunter2" });
  });
});

describe("PasskeysCard rename / remove / enable PRF", () => {
  it("rename PATCHes the new label", async () => {
    const user = userEvent.setup();
    handlers[KEY("PATCH", "/api/settings/passkeys/pk1")] = () => ({ body: { success: true } });
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /rename macbook/i }));
    const input = screen.getByLabelText(/new name for macbook/i);
    await user.clear(input);
    await user.type(input, "Work laptop");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(callsTo("PATCH", "/api/settings/passkeys/pk1")).toHaveLength(1));
    expect(callsTo("PATCH", "/api/settings/passkeys/pk1")[0].body).toEqual({ label: "Work laptop" });
    expect(await screen.findByText(/passkey renamed/i)).toBeInTheDocument();
  });

  it("remove asks for the password FIRST (no DELETE before it is entered), then sends it", async () => {
    const user = userEvent.setup();
    handlers[KEY("DELETE", "/api/settings/passkeys/pk2")] = () => ({ body: { success: true } });
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /remove yubikey/i }));
    expect(callsTo("DELETE", "/api/settings/passkeys/pk2")).toHaveLength(0);
    const confirm = screen.getByRole("button", { name: /remove passkey/i });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/current password/i), "Hunter2!Hunter2");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(callsTo("DELETE", "/api/settings/passkeys/pk2")).toHaveLength(1));
    expect(callsTo("DELETE", "/api/settings/passkeys/pk2")[0].body).toEqual({ currentPassword: "Hunter2!Hunter2" });
    await waitFor(() => expect(screen.queryByText("YubiKey")).toBeNull());
    expect(screen.getByText("MacBook")).toBeInTheDocument();
  });

  it("wrong password: error shown, passkey stays", async () => {
    const user = userEvent.setup();
    handlers[KEY("DELETE", "/api/settings/passkeys/pk2")] = () => ({ status: 401, body: { error: "Your password is incorrect." } });
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /remove yubikey/i }));
    await user.type(screen.getByLabelText(/current password/i), "nope");
    await user.click(screen.getByRole("button", { name: /remove passkey/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/password is incorrect/i);
    expect(screen.getByText("YubiKey")).toBeInTheDocument();
  });

  it("session without 2FA: server asks for a second factor -> TOTP code is sent with the password", async () => {
    const user = userEvent.setup();
    let n = 0;
    handlers[KEY("DELETE", "/api/settings/passkeys/pk2")] = (b) =>
      b.totpCode ? { body: { success: true } } : (n++, { status: 401, body: { code: "second-factor-required", methods: ["totp", "passkey"] } });
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /remove yubikey/i }));
    await user.type(screen.getByLabelText(/current password/i), "Hunter2!Hunter2");
    await user.click(screen.getByRole("button", { name: /remove passkey/i }));
    const totp = await screen.findByLabelText(/authenticator code/i);
    await user.type(totp, "123456");
    await user.click(screen.getByRole("button", { name: /verify and remove/i }));
    await waitFor(() => expect(screen.queryByText("YubiKey")).toBeNull());
    expect(n).toBe(1);
    expect(callsTo("DELETE", "/api/settings/passkeys/pk2").at(-1)!.body).toEqual({ currentPassword: "Hunter2!Hunter2", totpCode: "123456" });
  });

  it("second factor via a passkey assertion bound to action passkey-remove", async () => {
    const user = userEvent.setup();
    handlers[KEY("DELETE", "/api/settings/passkeys/pk2")] = (b) =>
      b.passkeyStepUp ? { body: { success: true } } : { status: 401, body: { code: "second-factor-required", methods: ["passkey"] } };
    handlers[KEY("POST", "/api/auth/step-up/passkey/options")] = () => ({ body: { options: { challenge: "s1", allowCredentials: [] }, token: "step-token" } });
    startAuthentication.mockResolvedValue(assertion());
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /remove yubikey/i }));
    await user.type(screen.getByLabelText(/current password/i), "Hunter2!Hunter2");
    await user.click(screen.getByRole("button", { name: /remove passkey/i }));
    expect(screen.queryByLabelText(/authenticator code/i)).toBeNull(); // TOTP not offered
    await user.click(await screen.findByRole("button", { name: /use a passkey instead/i }));
    await waitFor(() => expect(screen.queryByText("YubiKey")).toBeNull());
    expect(callsTo("POST", "/api/auth/step-up/passkey/options")[0].body).toEqual({ action: "passkey-remove" });
    const del = callsTo("DELETE", "/api/settings/passkeys/pk2").at(-1)!.body;
    expect((del.passkeyStepUp as { token: string }).token).toBe("step-token");
  });

  it("Enable password-free unlock: runs the PRF flow for that credential; password prompt on 401", async () => {
    const user = userEvent.setup();
    handlers[KEY("POST", "/api/settings/passkeys/register/prf-options")] = (b) =>
      b.currentPassword
        ? { body: { options: { challenge: "c2", allowCredentials: [] }, token: "prf-token", prfSalt: Buffer.alloc(32, 1).toString("base64url") } }
        : { status: 401, body: { error: "Password required" } };
    handlers[KEY("POST", "/api/settings/passkeys/register/finish-prf")] = () => ({ body: { ok: true } });
    startAuthentication.mockResolvedValue(assertion(PRF32));
    await renderLoaded();
    await user.click(screen.getByRole("button", { name: /enable password-free unlock/i }));
    const pw = await screen.findByLabelText(/current password/i);
    expect(callsTo("POST", "/api/settings/passkeys/register/prf-options")[0].body).toEqual({ credentialId: "pk2" });
    await user.type(pw, "Hunter2!Hunter2");
    await user.click(screen.getByRole("button", { name: /^enable$/i }));
    expect(await screen.findByText(/password-free unlock enabled/i)).toBeInTheDocument();
    expect(callsTo("POST", "/api/settings/passkeys/register/finish-prf")).toHaveLength(1);
  });
});
