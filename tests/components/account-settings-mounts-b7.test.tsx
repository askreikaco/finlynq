/**
 * @vitest-environment jsdom
 * Settings > Account mounts the real passkeys + recovery-codes cards (the
 * "coming soon" placeholder is gone) and the reset-password page links back to
 * the chooser.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

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

  it("reset-password page links back to the no-wipe chooser", async () => {
    render(<ResetPasswordPage />);
    const banner = await screen.findByTestId("recovery-banner");
    expect(banner).toHaveTextContent(/without losing data/i);
    expect(banner.querySelector("a")).toHaveAttribute("href", "/auth/forgot-password");
  });
});
