/**
 * @vitest-environment jsdom
 * Security section of /settings/account: real components, fetch mocked.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/settings/account",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async () => "data:image/png;base64,AAA") },
}));

import { TwoFactor } from "@/app/(app)/settings/account/_components/two-factor";
import { SignInMethods } from "@/app/(app)/settings/account/_components/sign-in-methods";
import { TrustedDevices } from "@/app/(app)/settings/account/_components/trusted-devices";

type Handler = (init?: RequestInit) => { status?: number; body: unknown };
let handlers: Record<string, Handler>;
let calls: { url: string; init?: RequestInit }[];

beforeEach(() => {
  calls = [];
  handlers = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const h = handlers[url];
      const r = h ? h(init) : { status: 404, body: {} };
      const status = r.status ?? 200;
      return { ok: status < 400, status, json: async () => r.body } as Response;
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const bodiesOf = (url: string) =>
  calls.filter((c) => c.url === url).map((c) => JSON.parse(String(c.init?.body ?? "{}")));

describe("TwoFactor", () => {
  it("enable POST body is exactly {action,secret,code,currentPassword}", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: false } });
    handlers["/api/auth/mfa/setup"] = (init) => {
      const b = JSON.parse(String(init?.body));
      return b.action === "generate"
        ? { body: { secret: "SECRET1", uri: "otpauth://totp/x?secret=SECRET1" } }
        : { body: { success: true } };
    };
    render(<TwoFactor />);
    await user.click(await screen.findByRole("button", { name: "Enable 2FA" }));
    expect(await screen.findByAltText(/provisioning qr/i)).toHaveAttribute("src", expect.stringMatching(/^data:image\/png/));
    await user.type(screen.getByLabelText(/verification code/i), "123456");
    await user.type(screen.getByLabelText(/current password/i), "pw");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(bodiesOf("/api/auth/mfa/setup").some((b) => b.action === "enable")).toBe(true));
    const enable = bodiesOf("/api/auth/mfa/setup").find((b) => b.action === "enable");
    expect(enable).toEqual({ action: "enable", secret: "SECRET1", code: "123456", currentPassword: "pw" });
    // secret no longer visible after enabling
    await waitFor(() => expect(screen.queryByDisplayValue("SECRET1")).toBeNull());
    expect(screen.getByText(/^On — authenticator app$/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
  });

  it("does not render the secret into localStorage", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: false } });
    handlers["/api/auth/mfa/setup"] = () => ({ body: { secret: "SECRET1", uri: "otpauth://x" } });
    render(<TwoFactor />);
    await user.click(await screen.findByRole("button", { name: "Enable 2FA" }));
    await screen.findByDisplayValue("SECRET1");
    expect(JSON.stringify({ ...localStorage })).not.toContain("SECRET1");
  });

  it("shows the disable form when session reports mfaEnabled:true", async () => {
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: true } });
    render(<TwoFactor />);
    expect(await screen.findByRole("button", { name: "Disable 2FA" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable 2FA" })).toBeNull();
  });

  it("disable POST body is {action,code,currentPassword}", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: true } });
    handlers["/api/auth/mfa/setup"] = () => ({ body: { success: true } });
    render(<TwoFactor />);
    await user.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    await user.type(await screen.findByLabelText(/verification code/i), "654321");
    await user.type(screen.getByLabelText(/current password/i), "pw");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(bodiesOf("/api/auth/mfa/setup").length).toBe(1));
    expect(bodiesOf("/api/auth/mfa/setup")[0]).toEqual({ action: "disable", code: "654321", currentPassword: "pw" });
    // success collapses and flips the status
    expect(await screen.findByRole("button", { name: "Enable 2FA" })).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
  });

  it("default render has no input fields (On and Off)", async () => {
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: true } });
    const on = render(<TwoFactor />);
    await screen.findByText("On — authenticator app");
    expect(on.container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Disable 2FA" })).toBeInTheDocument();
    cleanup();
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: false } });
    const off = render(<TwoFactor />);
    await screen.findByText("Off");
    expect(off.container.querySelectorAll("input")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Enable 2FA" })).toBeInTheDocument();
  });

  it("disable: click reveals fields; Cancel hides and clears them", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: true } });
    render(<TwoFactor />);
    await user.click(await screen.findByRole("button", { name: "Disable 2FA" }));
    await user.type(screen.getByLabelText(/verification code/i), "123");
    await user.type(screen.getByLabelText(/current password/i), "pw");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    expect(screen.getByText("On — authenticator app")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disable 2FA" }));
    expect(screen.getByLabelText(/verification code/i)).toHaveValue("");
    expect(screen.getByLabelText(/current password/i)).toHaveValue("");
  });

  it("enable: Cancel hides the QR/fields and clears them", async () => {
    const user = userEvent.setup();
    handlers["/api/auth/session"] = () => ({ body: { mfaEnabled: false } });
    handlers["/api/auth/mfa/setup"] = () => ({ body: { secret: "SECRET1", uri: "otpauth://x" } });
    render(<TwoFactor />);
    await user.click(await screen.findByRole("button", { name: "Enable 2FA" }));
    await user.type(await screen.findByLabelText(/verification code/i), "123");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    expect(screen.queryByDisplayValue("SECRET1")).toBeNull();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
});

describe("SignInMethods", () => {
  const methods = (linked: boolean) => ({
    body: {
      google: linked ? { linked: true, email: "a@b.c", linkedAt: "2026-01-01T00:00:00Z", lastLoginAt: null } : { linked: false },
      hasPassword: true,
      devices: [],
    },
  });

  it("renders Link Google as an <a> with intent=link when googleEnabled", async () => {
    handlers["/api/settings/sign-in-methods"] = () => methods(false);
    handlers["/api/auth/config"] = () => ({ body: { googleEnabled: true } });
    render(<SignInMethods />);
    const link = await screen.findByRole("link", { name: /link google/i });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toContain("/api/auth/google/start?intent=link");
    expect(screen.queryByRole("button", { name: /link google/i })).toBeNull();
  });

  it("hides Link Google when googleEnabled is false", async () => {
    handlers["/api/settings/sign-in-methods"] = () => methods(false);
    handlers["/api/auth/config"] = () => ({ body: { googleEnabled: false } });
    render(<SignInMethods />);
    await screen.findByText("Sign-in methods");
    expect(screen.queryByRole("link", { name: /link google/i })).toBeNull();
  });

  it("unlink sends DELETE with {password} and maps 401/429", async () => {
    const user = userEvent.setup();
    handlers["/api/settings/sign-in-methods"] = () => methods(true);
    handlers["/api/auth/config"] = () => ({ body: { googleEnabled: true } });
    let status = 401;
    handlers["/api/settings/sign-in-methods/google"] = () => ({ status, body: { error: "x" } });
    render(<SignInMethods />);
    await user.click(await screen.findByRole("button", { name: "Unlink" }));
    await user.type(screen.getByLabelText(/password to confirm/i), "pw");
    const confirm = screen.getAllByRole("button", { name: "Unlink" }).at(-1)!;
    await user.click(confirm);
    expect(await screen.findByText("Invalid password")).toBeInTheDocument();
    const del = calls.find((c) => c.url === "/api/settings/sign-in-methods/google")!;
    expect(del.init?.method).toBe("DELETE");
    expect(JSON.parse(String(del.init?.body))).toEqual({ password: "pw" });
    status = 429;
    await user.click(screen.getAllByRole("button", { name: "Unlink" }).at(-1)!);
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });
});

describe("TrustedDevices", () => {
  const dev = (id: string) => ({
    id, label: `Dev ${id}`, createdAt: "2026-01-01T00:00:00Z", lastUsedAt: null, expiresAt: "2099-01-01T00:00:00Z", current: false,
  });
  beforeEach(() => {
    handlers["/api/settings/sign-in-methods"] = () => ({ body: { google: { linked: false }, devices: [dev("d1"), dev("d2")] } });
    handlers["/api/auth/device-current"] = () => ({ body: { id: "d2" } });
    handlers["/api/settings/devices?id=d1"] = () => ({ body: { ok: true } });
    handlers["/api/settings/devices?all=1"] = () => ({ body: { ok: true } });
  });

  it("badges This device via /api/auth/device-current and disables its Revoke", async () => {
    render(<TrustedDevices />);
    expect(await screen.findByText("This device")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/auth/device-current")).toBe(true);
    expect(screen.getByRole("button", { name: /revoke dev d2/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /revoke dev d1/i })).toBeEnabled();
  });

  it("single revoke calls ?id= (not all=1)", async () => {
    const user = userEvent.setup();
    render(<TrustedDevices />);
    await user.click(await screen.findByRole("button", { name: /revoke dev d1/i }));
    await waitFor(() => expect(calls.some((c) => c.init?.method === "DELETE")).toBe(true));
    const dels = calls.filter((c) => c.init?.method === "DELETE").map((c) => c.url);
    expect(dels).toEqual(["/api/settings/devices?id=d1"]);
  });

  it("revoke all calls ?all=1 after confirm", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(<TrustedDevices />);
    await user.click(await screen.findByRole("button", { name: /revoke all devices/i }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/settings/devices?all=1")).toBe(true));
  });
});
