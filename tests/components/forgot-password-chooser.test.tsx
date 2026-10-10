/**
 * @vitest-environment jsdom
 * /auth/forgot-password chooser: passkey, this device (account picker),
 * recovery code, and the email reset that erases data. fetch routed; WebAuthn
 * browser lib mocked UNDER the real helper (passkeyRecovery runs for real).
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const hardReload = vi.fn();
vi.mock("@/lib/client/hard-reload", () => ({ hardReload: (...a: unknown[]) => hardReload(...a) }));
vi.mock("@/components/logo-mark", () => ({ LogoMark: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const startAuthentication = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
  startRegistration: vi.fn(),
}));

import ForgotPasswordPage from "@/app/auth/forgot-password/page";

type Reply = { status?: number; body: unknown };
let handlers: Record<string, (b: Record<string, unknown>) => Reply>;
let calls: { url: string; body: Record<string, unknown> }[];
const bodiesOf = (url: string) => calls.filter((c) => c.url === url).map((c) => c.body);
const lastBody = (url: string) => bodiesOf(url).at(-1)!;

const NEW_PW = "Zq7!vLm3#Xt9wKd2";
const PRF32 = new Uint8Array(32).fill(3).buffer;
const assertion = (prf?: ArrayBuffer) => ({
  id: "cred1", rawId: "cred1", type: "public-key",
  response: { clientDataJSON: "a", authenticatorData: "b", signature: "c" },
  clientExtensionResults: prf ? { prf: { results: { first: prf } } } : {},
});
const ACC = (over: Record<string, unknown> = {}) => ({
  deviceId: "dev-1", account: "a***@example.com", label: "Chrome", available: true, needs: "totp", ...over,
});

beforeEach(() => {
  calls = [];
  push.mockClear(); replace.mockClear(); hardReload.mockClear();
  startAuthentication.mockReset();
  localStorage.clear();
  handlers = {
    "/api/auth/recovery/device/check": () => ({ body: { available: false } }),
  };
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

async function fillNewPassword(user: ReturnType<typeof userEvent.setup>, prefix: string) {
  await user.type(document.getElementById(`${prefix}-new-password`)!, NEW_PW);
  await user.type(document.getElementById(`${prefix}-confirm-password`)!, NEW_PW);
}

describe("chooser", () => {
  it("lists passkey, this device, recovery code, and email-erases LAST, with a clear warning", async () => {
    render(<ForgotPasswordPage />);
    await screen.findByRole("button", { name: /this device/i });
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const idx = (re: RegExp) => labels.findIndex((t) => re.test(t));
    const [pk, dev, code, mail] = [idx(/use a passkey/i), idx(/this device/i), idx(/use a recovery code/i), idx(/reset by email \(erases your data\)/i)];
    expect([pk, dev, code, mail].every((i) => i >= 0)).toBe(true);
    expect(pk).toBeLessThan(dev);
    expect(dev).toBeLessThan(code);
    expect(code).toBeLessThan(mail);
    expect(mail).toBe(labels.length - 1);
    expect(screen.getByText(/erases all data in your account/i)).toBeInTheDocument();
  });

  it("hides the passkey option when WebAuthn is missing", async () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    render(<ForgotPasswordPage />);
    await screen.findByRole("button", { name: /this device/i });
    expect(screen.queryByRole("button", { name: /use a passkey/i })).toBeNull();
  });

  it("this device is disabled with a reason when the browser is not trusted / not set up", async () => {
    render(<ForgotPasswordPage />);
    const dev = await screen.findByRole("button", { name: /this device/i });
    await waitFor(() => expect(dev).toHaveTextContent(/not a trusted device/i));
    expect(dev).toBeDisabled();
    cleanup();
    handlers["/api/auth/recovery/device/check"] = () => ({
      body: { available: false, reason: "setup_required", accounts: [ACC({ available: false, needs: null, reason: "setup_required" })] },
    });
    render(<ForgotPasswordPage />);
    const dev2 = await screen.findByRole("button", { name: /this device/i });
    await waitFor(() => expect(dev2).toHaveTextContent(/no authenticator app or recovery codes/i));
    expect(dev2).toBeDisabled();
  });
});

describe("passkey recovery", () => {
  function wire(resetReply: Reply = { body: { success: true } }) {
    handlers["/api/auth/recovery/passkey/options"] = () => ({ body: { options: { challenge: "c1", allowCredentials: [] }, token: "rec-token" } });
    handlers["/api/auth/recovery/passkey/reset"] = (b) =>
      b.prfOutput === undefined
        ? { body: { step: "prf", options: { challenge: "c2", allowCredentials: [{ id: "cred1" }] }, token: "prf-token", prfSalt: Buffer.alloc(32, 1).toString("base64url") } }
        : resetReply;
  }

  it("new password + passkey -> reset with newPassword -> hardReload('/dashboard') (never router.push)", async () => {
    const user = userEvent.setup();
    wire();
    startAuthentication.mockResolvedValueOnce(assertion()).mockResolvedValueOnce(assertion(PRF32));
    render(<ForgotPasswordPage />);
    await user.click(await screen.findByRole("button", { name: /use a passkey/i }));
    const go = screen.getByRole("button", { name: /continue with passkey/i });
    expect(go).toBeDisabled();
    await fillNewPassword(user, "pk");
    await user.click(go);
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(lastBody("/api/auth/recovery/passkey/reset")).toMatchObject({ token: "prf-token", newPassword: NEW_PW, trustDevice: true });
  });

  it("password mismatch / too short never reaches the server", async () => {
    const user = userEvent.setup();
    wire();
    render(<ForgotPasswordPage />);
    await user.click(await screen.findByRole("button", { name: /use a passkey/i }));
    await user.type(document.getElementById("pk-new-password")!, NEW_PW);
    await user.type(document.getElementById("pk-confirm-password")!, "different-password-1");
    expect(screen.getByRole("button", { name: /continue with passkey/i })).toBeDisabled();
    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("recovery/passkey"))).toBe(false);
  });

  it("shared computer -> trustDevice:false", async () => {
    const user = userEvent.setup();
    wire();
    startAuthentication.mockResolvedValueOnce(assertion()).mockResolvedValueOnce(assertion(PRF32));
    render(<ForgotPasswordPage />);
    await user.click(await screen.findByRole("button", { name: /use a passkey/i }));
    await fillNewPassword(user, "pk");
    await user.click(screen.getByRole("switch", { name: /shared computer/i }));
    await user.click(screen.getByRole("button", { name: /continue with passkey/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(lastBody("/api/auth/recovery/passkey/reset").trustDevice).toBe(false);
  });

  it("prf_unavailable: explains and does not reload; cancelled is silent", async () => {
    const user = userEvent.setup();
    wire({ status: 400, body: { code: "prf_unavailable", error: "x" } });
    startAuthentication.mockResolvedValueOnce(assertion()).mockResolvedValueOnce(assertion(PRF32));
    render(<ForgotPasswordPage />);
    await user.click(await screen.findByRole("button", { name: /use a passkey/i }));
    await fillNewPassword(user, "pk");
    await user.click(screen.getByRole("button", { name: /continue with passkey/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/can't unlock your data/i);
    expect(hardReload).not.toHaveBeenCalled();

    startAuthentication.mockReset();
    startAuthentication.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    await user.click(screen.getByRole("button", { name: /continue with passkey/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(hardReload).not.toHaveBeenCalled();
  });
});

describe("this device", () => {
  it("single account: TOTP proof + new password -> device/reset with deviceId -> hardReload", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/recovery/device/check"] = () => ({ body: { available: true, label: "Chrome", needs: "totp", accounts: [ACC()] } });
    handlers["/api/auth/recovery/device/reset"] = () => ({ body: { success: true } });
    render(<ForgotPasswordPage />);
    const dev = await screen.findByRole("button", { name: /this device/i });
    await waitFor(() => expect(dev).toBeEnabled());
    await user.click(dev);
    expect(screen.getByText("a***@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull(); // no picker for one account
    const submit = screen.getByRole("button", { name: /reset password/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/authenticator code/i), "123456");
    await fillNewPassword(user, "dev");
    await user.click(submit);
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(push).not.toHaveBeenCalled();
    expect(lastBody("/api/auth/recovery/device/reset")).toEqual({
      newPassword: NEW_PW,
      deviceId: "dev-1",
      proof: { type: "totp", value: "123456" },
    });
  });

  it("account that only has recovery codes asks for a code (type: code)", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/recovery/device/check"] = () => ({ body: { available: true, needs: "code", accounts: [ACC({ needs: "code" })] } });
    handlers["/api/auth/recovery/device/reset"] = () => ({ body: { success: true } });
    render(<ForgotPasswordPage />);
    const dev = await screen.findByRole("button", { name: /this device/i });
    await waitFor(() => expect(dev).toBeEnabled());
    await user.click(dev);
    await user.type(screen.getByLabelText(/^recovery code$/i), "abcde-fghij-klmno-pqrst");
    await fillNewPassword(user, "dev");
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(lastBody("/api/auth/recovery/device/reset").proof).toEqual({ type: "code", value: "ABCDE-FGHIJ-KLMNO-PQRST" });
  });

  it("several accounts: masked picker (never raw emails), unavailable one disabled, chosen deviceId is sent", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/recovery/device/check"] = () => ({
      body: {
        available: true,
        accounts: [
          ACC({ deviceId: "dev-A", account: "a***@example.com" }),
          ACC({ deviceId: "dev-B", account: "b***@example.org", needs: "code" }),
          ACC({ deviceId: "dev-C", account: "c***@example.net", available: false, needs: null, reason: "setup_required" }),
        ],
      },
    });
    handlers["/api/auth/recovery/device/reset"] = () => ({ body: { success: true } });
    render(<ForgotPasswordPage />);
    const dev = await screen.findByRole("button", { name: /this device/i });
    await waitFor(() => expect(dev).toBeEnabled());
    await user.click(dev);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[2]).toBeDisabled();
    expect(radios[0]).toBeChecked();
    expect(screen.queryByText(/@example\.com$/)?.textContent).toBe("a***@example.com");
    await user.click(radios[1]);
    await user.type(screen.getByLabelText(/^recovery code$/i), "AAAAA-BBBBB-CCCCC-DDDDD");
    await fillNewPassword(user, "dev");
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(lastBody("/api/auth/recovery/device/reset")).toMatchObject({ deviceId: "dev-B", proof: { type: "code" } });
  });

  it("wrong proof: generic error, no reload", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/recovery/device/check"] = () => ({ body: { available: true, accounts: [ACC()] } });
    handlers["/api/auth/recovery/device/reset"] = () => ({ status: 400, body: { error: "Recovery failed. Check your details and try again." } });
    render(<ForgotPasswordPage />);
    const dev = await screen.findByRole("button", { name: /this device/i });
    await waitFor(() => expect(dev).toBeEnabled());
    await user.click(dev);
    await user.type(screen.getByLabelText(/authenticator code/i), "000000");
    await fillNewPassword(user, "dev");
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/recovery failed/i);
    expect(hardReload).not.toHaveBeenCalled();
  });
});

describe("recovery code", () => {
  async function open(user: ReturnType<typeof userEvent.setup>) {
    render(<ForgotPasswordPage />);
    await user.click(await screen.findByRole("button", { name: /use a recovery code/i }));
  }

  it("identifier + auto-formatted code + new password -> code/reset -> hardReload", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/recovery/code/reset"] = () => ({ body: { success: true } });
    await open(user);
    const submit = screen.getByRole("button", { name: /reset password/i });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/email or username/i), "alice@example.com");
    const code = screen.getByLabelText(/^recovery code$/i) as HTMLInputElement;
    await user.type(code, "abcde fghij-klmno-pqrst!");
    expect(code.value).toBe("ABCDE FGHIJ-KLMNO-PQRST");
    await fillNewPassword(user, "rc");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(push).not.toHaveBeenCalled();
    expect(lastBody("/api/auth/recovery/code/reset")).toEqual({
      identifier: "alice@example.com",
      recoveryCode: "ABCDE FGHIJ-KLMNO-PQRST",
      newPassword: NEW_PW,
      trustDevice: true,
    });
  });

  it("incomplete code keeps submit disabled; server 400 shows the generic text; 429 its own", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/recovery/code/reset"] = () => ({ status: 400, body: { error: "Recovery failed. Check your details and try again." } });
    await open(user);
    await user.type(screen.getByLabelText(/email or username/i), "alice");
    await user.type(screen.getByLabelText(/^recovery code$/i), "ABCDE-FGHIJ");
    await fillNewPassword(user, "rc");
    expect(screen.getByRole("button", { name: /reset password/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/^recovery code$/i), "-KLMNO-PQRST");
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/recovery failed/i);
    expect(hardReload).not.toHaveBeenCalled();
    handlers["/api/auth/recovery/code/reset"] = () => ({ status: 429, body: { error: "Too many attempts. Please try again later." } });
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/too many attempts/i));
  });

  it("shared computer -> trustDevice:false", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/recovery/code/reset"] = () => ({ body: { success: true } });
    await open(user);
    await user.type(screen.getByLabelText(/email or username/i), "alice");
    await user.type(screen.getByLabelText(/^recovery code$/i), "AAAAA-BBBBB-CCCCC-DDDDD");
    await fillNewPassword(user, "rc");
    await user.click(screen.getByRole("switch", { name: /shared computer/i }));
    await user.click(screen.getByRole("button", { name: /reset password/i }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(lastBody("/api/auth/recovery/code/reset").trustDevice).toBe(false);
  });
});

describe("reset by email (erases data)", () => {
  it("shows the erase warning and still sends the existing email request", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/password-reset/request"] = () => ({ body: { message: "If an account with that email exists, a password reset link has been sent." } });
    render(<ForgotPasswordPage />);
    await user.click(await screen.findByRole("button", { name: /reset by email \(erases your data\)/i }));
    const note = screen.getByRole("note");
    expect(within(note).getByText(/erases all data in the account/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByText(/reset link has been sent/i)).toBeInTheDocument();
    expect(lastBody("/api/auth/password-reset/request")).toEqual({ email: "alice@example.com" });
    expect(hardReload).not.toHaveBeenCalled();
  });
});
