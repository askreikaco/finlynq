/**
 * @vitest-environment jsdom
 * Settings > Account mounts the real passkeys + recovery-codes cards (the
 * "coming soon" placeholder is gone) and the reset-password page links back to
 * the chooser.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("token=abc"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/components/logo-mark", () => ({ LogoMark: () => null }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,AAA") } }));

import AccountSettingsPage from "@/app/(app)/settings/account/page";
import userEvent from "@testing-library/user-event";
import ResetPasswordPage from "@/app/auth/reset-password/page";

beforeEach(() => {
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body =
        url === "/api/settings/passkeys" ? { passkeys: [] } :
        url === "/api/settings/recovery-codes" ? { unused: 0, total: 0, createdAt: null } :
        url === "/api/user/me" ? { username: "u", email: null } :
        url === "/api/settings/sign-in-methods" ? { google: { linked: false }, devices: [] } :
        {};
      return { ok: true, status: 200, json: async () => body } as Response;
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("B7 mounts", () => {
  it("Settings > Account renders both cards and no 'coming soon' placeholder", async () => {
    render(<AccountSettingsPage />);
    expect(await screen.findByText("Passkeys")).toBeInTheDocument();
    expect(await screen.findByText("Recovery codes")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /add a passkey/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^generate recovery codes$/i })).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("Change password / Change email: button first, no inputs by default; click reveals, Cancel clears, success collapses", async () => {
    const user = userEvent.setup();
    let pwOk = false;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/settings/change-password") { pwOk = true; return { ok: true, status: 200, json: async () => ({}) } as Response; }
      const body =
        url === "/api/user/me" ? { username: "u", email: null } :
        url === "/api/settings/passkeys" ? { passkeys: [] } :
        url === "/api/settings/recovery-codes" ? { unused: 0, total: 0, createdAt: null } :
        url === "/api/settings/sign-in-methods" ? { google: { linked: false }, devices: [] } : {};
      void init;
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(<AccountSettingsPage />);
    const open = await screen.findByRole("button", { name: "Change password" });
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole("textbox", { name: /new email/i })).toBeNull();
    await user.click(open);
    expect(document.querySelectorAll('input[type="password"]').length).toBe(3);
    await user.type(document.querySelector('input[autocomplete="current-password"]') as HTMLInputElement, "abc");
    const card = screen.getByRole("button", { name: "Update password" }).closest("form") as HTMLElement;
    await user.click(screen.getAllByRole("button", { name: "Cancel" }).find((b) => card.contains(b))!);
    expect(document.querySelector('input[type="password"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect((document.querySelector('input[autocomplete="current-password"]') as HTMLInputElement).value).toBe("");
    const pws = document.querySelectorAll('input[type="password"]');
    await user.type(pws[0] as HTMLInputElement, "oldpassword");
    await user.type(pws[1] as HTMLInputElement, "a-new-password-123");
    await user.type(pws[2] as HTMLInputElement, "a-new-password-123");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(pwOk).toBe(true));
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
    // email card
    await user.click(screen.getByRole("button", { name: "Change email" }));
    expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Cancel" }).find((b) => b.closest("form")?.querySelector('input[type="email"]'))!);
    expect(screen.queryByPlaceholderText("you@example.com")).toBeNull();
  });

  it("reset-password page links back to the no-wipe chooser", async () => {
    render(<ResetPasswordPage />);
    const banner = await screen.findByTestId("recovery-banner");
    expect(banner).toHaveTextContent(/without losing data/i);
    expect(banner.querySelector("a")).toHaveAttribute("href", "/auth/forgot-password");
  });
});
