/**
 * @vitest-environment jsdom
 * /cloud page: unified identifier-first sign-in/create account flow.
 * Tests: default screen, email flow (exact login/register bodies), auto passkey
 * (hint/skip/no-loop/skip conditions), deep links.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

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

// Mock passkey (real storage helpers + real page)
const mockPasskeyLogin = vi.fn();
vi.mock("@/lib/client/passkey-prf", () => ({
  passkeyLogin: (...a: unknown[]) => mockPasskeyLogin(...a),
  getAssertionWithPrf: vi.fn(),
}));

import CloudAuthPage from "@/app/cloud/page";

type Handler = (init?: RequestInit) => { status?: number; body: unknown };
let handlers: Record<string, Handler>;
let calls: { url: string; init?: RequestInit }[];

beforeEach(() => {
  params = new URLSearchParams();
  calls = [];
  localStorage.clear();
  sessionStorage.clear();
  handlers = { "/api/auth/config": () => ({ body: { googleEnabled: true } }) };
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
  hardReload.mockClear();
  mockPasskeyLogin.mockReset();
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const h = handlers[url];
    const r = h ? h(init) : { status: 404, body: {} };
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body } as Response;
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bodyOf = (url: string) => JSON.parse(String(calls.filter((c) => c.url === url).at(-1)?.init?.body));
const callCount = (url: string) => calls.filter((c) => c.url === url).length;

async function toIdentify() {
  fireEvent.click(await screen.findByText("Use email instead"));
  return screen.findByLabelText("Email or username");
}
async function identify(value: string, exists: boolean) {
  handlers["/api/auth/identify"] = () => ({ body: { exists } });
  const input = await toIdentify();
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}
const flush = () => new Promise((r) => setTimeout(r, 50));

describe("default screen", () => {
  it("shows logo-centered options: Google primary, passkey, email link, demo footer", async () => {
    render(<CloudAuthPage />);
    const google = await screen.findByText("Continue with Google");
    expect(google.closest("a")).toHaveAttribute("href", "/api/auth/google/start?intent=login&next=%2Fdashboard");
    expect(google.closest("a")!.className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: "Sign in with a passkey" }).className).not.toContain("bg-primary ");
    expect(screen.getByText("Use email instead")).toBeInTheDocument();
    expect(screen.getByText("One-click demo")).toBeInTheDocument();
  });

  it("google href carries the redirect param", async () => {
    params = new URLSearchParams("redirect=/budgets");
    render(<CloudAuthPage />);
    const google = await screen.findByText("Continue with Google");
    expect(google.closest("a")).toHaveAttribute("href", "/api/auth/google/start?intent=login&next=%2Fbudgets");
  });

  it("has no Back link, tabs, or email/password fields", async () => {
    render(<CloudAuthPage />);
    await screen.findByText("Use email instead");
    expect(screen.queryByText(/back to sign-in options/i)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Create Account")).toBeNull();
    expect(screen.queryByLabelText("Email or username")).toBeNull();
    expect(screen.queryByPlaceholderText("Password")).toBeNull();
  });
});

describe("email flow", () => {
  it("identify posts only { identifier } (trimmed)", async () => {
    await (async () => {
      render(<CloudAuthPage />);
      await identify("  user@example.com ", true);
    })();
    await screen.findByPlaceholderText("Password");
    expect(bodyOf("/api/auth/identify")).toEqual({ identifier: "user@example.com" });
  });

  it("exists -> sign-in posts the exact login body (no trustDevice when unchecked)", async () => {
    handlers["/api/auth/login"] = () => ({ body: { success: true } });
    render(<CloudAuthPage />);
    await identify("user@example.com", true);
    fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pw-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(bodyOf("/api/auth/login")).toStrictEqual({ identifier: "user@example.com", password: "pw-123" });
  });

  it("shared computer -> trustDevice:false in the login body", async () => {
    handlers["/api/auth/login"] = () => ({ body: { success: true } });
    render(<CloudAuthPage />);
    await identify("user@example.com", true);
    fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pw-123" } });
    fireEvent.click(screen.getByRole("switch", { name: /shared computer/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(callCount("/api/auth/login")).toBe(1));
    expect(bodyOf("/api/auth/login")).toStrictEqual({ identifier: "user@example.com", password: "pw-123", trustDevice: false });
  });

  it("MFA-required login still shows the 2FA step and does not reload", async () => {
    handlers["/api/auth/login"] = () => ({ body: { mfaRequired: true, mfaPendingToken: "tok" } });
    render(<CloudAuthPage />);
    await identify("user@example.com", true);
    fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pw-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByLabelText("Authentication code");
    expect(hardReload).not.toHaveBeenCalled();
  });

  it("password sign-in does NOT set the passkey hint", async () => {
    handlers["/api/auth/login"] = () => ({ body: { success: true } });
    render(<CloudAuthPage />);
    await identify("user@example.com", true);
    fireEvent.change(await screen.findByPlaceholderText("Password"), { target: { value: "pw-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(localStorage.getItem("pf-passkey-hint")).toBeNull();
  });

  it("not exists + email -> create account posts the exact register body", async () => {
    handlers["/api/auth/register"] = () => ({ body: { success: true } });
    render(<CloudAuthPage />);
    await identify("new@example.com", false);
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "correct-horse-battery" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "correct-horse-battery" } });
    expect(screen.queryByText(/zero-knowledge/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    const b = bodyOf("/api/auth/register");
    expect(Object.keys(b).sort()).toEqual(["email", "password", "username"]);
    expect(b).toMatchObject({ username: "new@example.com", email: "new@example.com", password: "correct-horse-battery" });
  });

  it("mismatched confirm never posts to register", async () => {
    render(<CloudAuthPage />);
    await identify("new@example.com", false);
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "correct-horse-battery" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "different-horse-battery" } });
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Confirm password").closest("form")!);
    await flush();
    expect(callCount("/api/auth/register")).toBe(0);
  });

  it("not exists + username -> error, stays on identify, no register", async () => {
    render(<CloudAuthPage />);
    await identify("newusername", false);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no account with that username/i);
    expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
    expect(callCount("/api/auth/register")).toBe(0);
  });

  it("identify failure shows the server error and does not advance", async () => {
    handlers["/api/auth/identify"] = () => ({ status: 429, body: { error: "Too many requests. Please try again later." } });
    render(<CloudAuthPage />);
    fireEvent.change(await toIdentify(), { target: { value: "a@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many requests/i);
    expect(screen.queryByPlaceholderText("Password")).toBeNull();
  });

  it("no helper text before an error; Change and Back links work", async () => {
    render(<CloudAuthPage />);
    await identify("user@example.com", true);
    await screen.findByPlaceholderText("Password");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByText("Change"));
    expect(await screen.findByLabelText("Email or username")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to sign-in options"));
    expect(await screen.findByText("Sign in with a passkey")).toBeInTheDocument();
  });

  it("sign-in and sign-up steps also offer Back to sign-in options", async () => {
    render(<CloudAuthPage />);
    await identify("new@example.com", false);
    await screen.findByLabelText("Confirm password");
    expect(screen.getByText("Back to sign-in options")).toBeInTheDocument();
  });
});

describe("auto passkey", () => {
  const hint = () => localStorage.setItem("pf-passkey-hint", "1");

  it("hint set -> starts exactly once, even across re-renders; success reloads", async () => {
    hint();
    mockPasskeyLogin.mockResolvedValue({ ok: true });
    const { rerender } = render(<CloudAuthPage />);
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    rerender(<CloudAuthPage />);
    await flush();
    expect(mockPasskeyLogin).toHaveBeenCalledTimes(1);
    // skip flag was cleared on success
    expect(sessionStorage.getItem("pf-passkey-auto-skip")).toBeNull();
  });

  it("no hint -> never starts", async () => {
    render(<CloudAuthPage />);
    await screen.findByText("Use email instead");
    await flush();
    expect(mockPasskeyLogin).not.toHaveBeenCalled();
  });

  it("sessionStorage skip flag blocks it", async () => {
    hint();
    sessionStorage.setItem("pf-passkey-auto-skip", "1");
    render(<CloudAuthPage />);
    await screen.findByText("Use email instead");
    await flush();
    expect(mockPasskeyLogin).not.toHaveBeenCalled();
  });

  it("a localStorage skip key is not the skip flag", async () => {
    hint();
    localStorage.setItem("pf-passkey-auto-skip", "1");
    mockPasskeyLogin.mockResolvedValue({ ok: true });
    render(<CloudAuthPage />);
    await waitFor(() => expect(mockPasskeyLogin).toHaveBeenCalledTimes(1));
  });

  it.each([
    "error=google_denied",
    "error=anything",
    "mode=signup",
    "tab=create",
    "tab=register",
    "add=1",
    "step=mfa",
    "step=unlock",
    "google=1&tab=register",
    "demo=1",
  ])("?%s blocks it", async (qs) => {
    hint();
    params = new URLSearchParams(qs);
    handlers["/api/auth/google/pending"] = () => ({ body: { kind: "signup", email: "g@example.com", name: "G" } });
    render(<CloudAuthPage />);
    await flush();
    expect(mockPasskeyLogin).not.toHaveBeenCalled();
  });

  it("cancel (NotAllowedError path): silent, skip flag set, passkey button becomes primary, no loop", async () => {
    hint();
    mockPasskeyLogin.mockResolvedValue({ ok: false, code: "cancelled", status: 0 });
    render(<CloudAuthPage />);
    const btn = await screen.findByRole("button", { name: "Sign in with a passkey" });
    await waitFor(() => expect(btn.className).toContain("bg-primary"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(sessionStorage.getItem("pf-passkey-auto-skip")).toBe("1");
    expect(hardReload).not.toHaveBeenCalled();
    await flush();
    expect(mockPasskeyLogin).toHaveBeenCalledTimes(1);
  });

  it("failure and thrown errors: skip flag set, falls back, no loop", async () => {
    hint();
    mockPasskeyLogin.mockRejectedValue(new Error("boom"));
    render(<CloudAuthPage />);
    await waitFor(() => expect(sessionStorage.getItem("pf-passkey-auto-skip")).toBe("1"));
    await screen.findByText("Use email instead");
    await flush();
    expect(mockPasskeyLogin).toHaveBeenCalledTimes(1);
  });

  it("manual passkey success sets the hint; cancel sets the skip flag", async () => {
    mockPasskeyLogin.mockResolvedValueOnce({ ok: false, code: "cancelled", status: 0 });
    render(<CloudAuthPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(sessionStorage.getItem("pf-passkey-auto-skip")).toBe("1"));
    expect(localStorage.getItem("pf-passkey-hint")).toBeNull();
    mockPasskeyLogin.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(hardReload).toHaveBeenCalled());
    expect(localStorage.getItem("pf-passkey-hint")).toBe("1");
  });
});

describe("deep links", () => {
  it("?email= opens identify prefilled", async () => {
    params = new URLSearchParams("email=test@example.com");
    render(<CloudAuthPage />);
    expect(((await screen.findByLabelText("Email or username")) as HTMLInputElement).value).toBe("test@example.com");
  });

  it.each(["mode=signup", "tab=create", "tab=register"])("?%s opens the email flow", async (qs) => {
    params = new URLSearchParams(qs);
    render(<CloudAuthPage />);
    expect(await screen.findByLabelText("Email or username")).toBeInTheDocument();
  });

  it("Google signup callback (?tab=register&google=1) lands on the signup step and posts googleSignup", async () => {
    params = new URLSearchParams("tab=register&google=1");
    handlers["/api/auth/google/pending"] = () => ({ body: { kind: "signup", email: "g***@example.com", name: "Gee" } });
    handlers["/api/auth/register"] = () => ({ body: { success: true } });
    render(<CloudAuthPage />);
    fireEvent.change(await screen.findByLabelText("Username"), { target: { value: "gee_user" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse-battery" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "correct-horse-battery" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(callCount("/api/auth/register")).toBe(1));
    // pending email is masked server-side; username must be the user's choice, never the mask
    expect(bodyOf("/api/auth/register")).toMatchObject({
      username: "gee_user",
      email: "g***@example.com",
      displayName: "Gee",
      googleSignup: true,
    });
  });

  it("?demo=1 opens sign-in with demo credentials prefilled (no auto-submit)", async () => {
    params = new URLSearchParams("demo=1");
    render(<CloudAuthPage />);
    expect(await screen.findByText("demo@finlynq.com")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("Password") as HTMLInputElement).value).toBe("finlynq-demo");
    await flush();
    expect(callCount("/api/auth/login")).toBe(0);
  });
});
