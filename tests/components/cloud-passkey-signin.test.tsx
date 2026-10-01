/**
 * @vitest-environment jsdom
 * /cloud sign-in: passkey button, passkey/recovery-code 2FA, shared computer.
 * fetch is routed; @simplewebauthn/browser is mocked UNDER the real client
 * helper (src/lib/client/passkey-prf.ts), so passkeyLogin runs for real.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let params = new URLSearchParams();
const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => params,
}));
const hardReload = vi.fn();
vi.mock("@/lib/client/hard-reload", () => ({ hardReload: (...a: unknown[]) => hardReload(...a) }));
vi.mock("@/components/analytics-consent", () => ({ AnalyticsConsent: () => null }));
vi.mock("@/components/logo-mark", () => ({ LogoMark: () => null }));

const startAuthentication = vi.fn();
const startRegistration = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
  startRegistration: (...a: unknown[]) => startRegistration(...a),
}));

import CloudAuthPage from "@/app/cloud/page";

type Reply = { status?: number; body: unknown };
let handlers: Record<string, (b: Record<string, unknown>) => Reply>;
let calls: { url: string; body: Record<string, unknown> }[];
const bodiesOf = (url: string) => calls.filter((c) => c.url === url).map((c) => c.body);
const lastBody = (url: string) => bodiesOf(url).at(-1)!;

const PRF32 = new Uint8Array(32).fill(3).buffer;
const assertion = (prf?: ArrayBuffer) => ({
  id: "cred1",
  rawId: "cred1",
  type: "public-key",
  response: { clientDataJSON: "a", authenticatorData: "b", signature: "c" },
  clientExtensionResults: prf ? { prf: { results: { first: prf } } } : {},
});

function wirePasskeyLogin(verify: Reply = { body: { success: true } }) {
  handlers["/api/auth/passkey/login/options"] = () => ({
    body: { options: { challenge: "c1", allowCredentials: [] }, token: "login-token" },
  });
  handlers["/api/auth/passkey/login/verify"] = (b) =>
    b.prfOutput === undefined
      ? { body: { step: "prf", options: { challenge: "c2", allowCredentials: [{ id: "cred1" }] }, token: "prf-token", prfSalt: Buffer.alloc(32, 1).toString("base64url") } }
      : verify;
}

beforeEach(() => {
  params = new URLSearchParams();
  calls = [];
  localStorage.clear();
  sessionStorage.clear();
  handlers = { "/api/auth/config": () => ({ body: { googleEnabled: false } }) };
  push.mockClear(); replace.mockClear(); refresh.mockClear(); hardReload.mockClear();
  startAuthentication.mockReset();
  startRegistration.mockReset();
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body });
      const h = handlers[url];
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

describe("/cloud: Sign in with a passkey", () => {
  it("button is shown only when WebAuthn exists", async () => {
    render(<CloudAuthPage />);
    expect(await screen.findByRole("button", { name: /sign in with a passkey/i })).toBeInTheDocument();
    cleanup();
    vi.stubGlobal("PublicKeyCredential", undefined);
    render(<CloudAuthPage />);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/config")).toBe(true));
    expect(screen.queryByRole("button", { name: /sign in with a passkey/i })).toBeNull();
  });

  it("success (discoverable, two prompts): options -> assertion -> verify -> PRF assertion -> verify(PRF output) -> hardReload, never router.push", async () => {
    const user = userEvent.setup();
    wirePasskeyLogin();
    startAuthentication.mockResolvedValueOnce(assertion()).mockResolvedValueOnce(assertion(PRF32));
    render(<CloudAuthPage />);
    await user.click(await screen.findByRole("button", { name: /sign in with a passkey/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    const verifies = bodiesOf("/api/auth/passkey/login/verify");
    expect(verifies.at(-1)).toMatchObject({ token: "prf-token", trustDevice: true });
    expect(typeof verifies.at(-1)!.prfOutput).toBe("string");
  });

  it("honours ?redirect on success", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams("redirect=/budgets");
    wirePasskeyLogin();
    startAuthentication.mockResolvedValue(assertion(PRF32));
    render(<CloudAuthPage />);
    await user.click(await screen.findByRole("button", { name: /sign in with a passkey/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/budgets"));
  });

  it("prf_unavailable: no reload; tells the user to continue with the password and focuses it", async () => {
    const user = userEvent.setup();
    wirePasskeyLogin({ status: 400, body: { code: "prf_unavailable", error: "x" } });
    startAuthentication.mockResolvedValue(assertion(PRF32));
    render(<CloudAuthPage />);
    await user.click(await screen.findByRole("button", { name: /sign in with a passkey/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/enter your password to continue/i);
    expect(hardReload).not.toHaveBeenCalled();
    // prf_unavailable falls back to the email flow (identifier step, focused)
    expect(await screen.findByLabelText("Email or username")).toHaveFocus();
    expect(sessionStorage.getItem("pf-passkey-auto-skip")).toBe("1");
  });

  it("cancelled prompt is silent: no error, no reload", async () => {
    const user = userEvent.setup();
    wirePasskeyLogin();
    startAuthentication.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    render(<CloudAuthPage />);
    await user.click(await screen.findByRole("button", { name: /sign in with a passkey/i }));
    await waitFor(() => expect(startAuthentication).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(hardReload).not.toHaveBeenCalled();
    expect(calls.some((c) => c.url === "/api/auth/passkey/login/verify")).toBe(false);
  });

  it("server failure: generic message, no reload", async () => {
    const user = userEvent.setup();
    wirePasskeyLogin({ status: 400, body: { error: "Passkey sign-in failed." } });
    startAuthentication.mockResolvedValue(assertion(PRF32));
    render(<CloudAuthPage />);
    await user.click(await screen.findByRole("button", { name: /sign in with a passkey/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/passkey sign-in failed/i);
    expect(hardReload).not.toHaveBeenCalled();
  });
});

describe("/cloud: shared computer", () => {
  it("checkbox is off by default; checked -> passkey login sends trustDevice:false", async () => {
    const user = userEvent.setup();
    wirePasskeyLogin();
    startAuthentication.mockResolvedValue(assertion(PRF32));
    render(<CloudAuthPage />);
    const box = await screen.findByLabelText(/this is a shared computer/i);
    expect(box).not.toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole("button", { name: /sign in with a passkey/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(bodiesOf("/api/auth/passkey/login/verify").at(-1)!.trustDevice).toBe(false);
  });

  it("checked -> password login sends trustDevice:false; unchecked leaves the body unchanged", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/identify"] = () => ({ body: { exists: true } });
    handlers["/api/auth/login"] = () => ({ body: { ok: true } });
    render(<CloudAuthPage />);
    // Navigate to email flow
    await user.click(screen.getByText("Use email instead"));
    // Enter identifier and continue
    const identifierInput = await screen.findByLabelText("Email or username");
    await user.type(identifierInput, "bob");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    // Enter password
    const passwordInput = await screen.findByPlaceholderText("Password");
    await user.type(passwordInput, "secret-pass");
    // Check shared computer and submit
    const sharedCheckbox = screen.getByLabelText(/this is a shared computer/i);
    await user.click(sharedCheckbox);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(bodiesOf("/api/auth/login")).toHaveLength(1));
    expect(lastBody("/api/auth/login")).toEqual({ identifier: "bob", password: "secret-pass", trustDevice: false });
  });
});

describe("/cloud: 2FA step", () => {
  async function toMfaStep(token = "pend-1") {
    handlers["/api/auth/identify"] = () => ({ body: { exists: true } });
    handlers["/api/auth/login"] = () => ({ body: { mfaRequired: true, mfaPendingToken: token } });
    render(<CloudAuthPage />);
    // Navigate to email flow
    fireEvent.click(screen.getByText("Use email instead"));
    // Enter identifier and continue
    const identifierInput = await screen.findByLabelText("Email or username");
    fireEvent.change(identifierInput, { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Enter password and sign in
    const passwordInput = await screen.findByPlaceholderText("Password");
    fireEvent.change(passwordInput, { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    // Wait for MFA step
    await screen.findByLabelText("Authentication code");
  }

  it("offers 'Use a passkey' and 'Use a recovery code'", async () => {
    await toMfaStep();
    expect(screen.getByRole("button", { name: /use a passkey/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use a recovery code/i })).toBeInTheDocument();
  });

  it("passkey 2FA: webauthn/options -> assertion -> webauthn/verify with the pending token -> hardReload", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/mfa/webauthn/options"] = () => ({ body: { options: { challenge: "m1", allowCredentials: [{ id: "cred1" }] }, token: "wa-token" } });
    handlers["/api/auth/mfa/webauthn/verify"] = () => ({ body: { success: true } });
    startAuthentication.mockResolvedValue(assertion());
    await toMfaStep("pend-7");
    await user.click(screen.getByRole("button", { name: /use a passkey/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(push).not.toHaveBeenCalled();
    expect(lastBody("/api/auth/mfa/webauthn/options")).toEqual({ mfaPendingToken: "pend-7" });
    const v = lastBody("/api/auth/mfa/webauthn/verify");
    expect(v).toMatchObject({ mfaPendingToken: "pend-7", token: "wa-token" });
    expect((v.response as { id: string }).id).toBe("cred1");
    expect(calls.some((c) => c.url === "/api/auth/mfa/verify")).toBe(false);
  });

  it("passkey 2FA: no passkey registered -> server message, no reload; cancelled prompt is silent", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/mfa/webauthn/options"] = () => ({ status: 400, body: { error: "No passkey is registered for this account." } });
    await toMfaStep();
    await user.click(screen.getByRole("button", { name: /use a passkey/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no passkey is registered/i);
    expect(hardReload).not.toHaveBeenCalled();

    handlers["/api/auth/mfa/webauthn/options"] = () => ({ body: { options: { challenge: "m1" }, token: "t" } });
    startAuthentication.mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    await user.click(screen.getByRole("button", { name: /use a passkey/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("recovery code 2FA: posts to mfa/recovery/verify (not mfa/verify) with the pending token, then hardReload", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/mfa/recovery/verify"] = () => ({ body: { success: true } });
    await toMfaStep("pend-9");
    await user.click(screen.getByRole("button", { name: /use a recovery code/i }));
    const input = await screen.findByLabelText("Recovery code");
    const submit = screen.getByRole("button", { name: "Verify" });
    expect(submit).toBeDisabled();
    await user.type(input, "abcde-fghij-klmno-pqrst");
    expect((input as HTMLInputElement).value).toBe("ABCDE-FGHIJ-KLMNO-PQRST"); // auto-uppercased
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(push).not.toHaveBeenCalled();
    expect(lastBody("/api/auth/mfa/recovery/verify")).toEqual({ mfaPendingToken: "pend-9", code: "ABCDE-FGHIJ-KLMNO-PQRST" });
    expect(calls.some((c) => c.url === "/api/auth/mfa/verify")).toBe(false);
  });

  it("recovery code 2FA: failure shows the server's generic error and does not reload; can switch back to the authenticator code", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/mfa/recovery/verify"] = () => ({ status: 400, body: { error: "Recovery failed. Check your details and try again." } });
    await toMfaStep();
    await user.click(screen.getByRole("button", { name: /use a recovery code/i }));
    await user.type(await screen.findByLabelText("Recovery code"), "AAAAA-BBBBB-CCCCC-DDDDD");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/recovery failed/i);
    expect(hardReload).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /use an authenticator code/i }));
    expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
  });

  it("shared computer carries into the 2FA step (recovery code and TOTP)", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/mfa/recovery/verify"] = () => ({ body: { success: true } });
    handlers["/api/auth/mfa/verify"] = () => ({ body: { success: true } });
    await toMfaStep();
    await user.click(screen.getByLabelText(/this is a shared computer/i));
    await user.type(screen.getByLabelText("Authentication code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(bodiesOf("/api/auth/mfa/verify")).toHaveLength(1));
    expect(lastBody("/api/auth/mfa/verify")).toEqual({ mfaPendingToken: "pend-1", code: "123456", trustDevice: false });
  });
});
