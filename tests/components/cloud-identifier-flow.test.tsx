/**
 * @vitest-environment jsdom
 * /cloud page: unified identifier-first sign-in/create account flow.
 * Tests: default screen, email flow, auto passkey, and deep links.
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

// Mock passkey
const mockPasskeyLogin = vi.fn();
vi.mock("@/lib/client/passkey-prf", () => ({
  passkeyLogin: () => mockPasskeyLogin(),
  getAssertionWithPrf: vi.fn(),
}));

import CloudAuthPage from "@/app/cloud/page";

type Handler = (init?: RequestInit) => { status?: number; body: unknown };
let handlers: Record<string, Handler>;
let calls: { url: string; init?: RequestInit }[];
let localStorageMock: Record<string, string> = {};

beforeEach(() => {
  params = new URLSearchParams();
  calls = [];
  localStorageMock = {};
  handlers = { "/api/auth/config": () => ({ body: { googleEnabled: true, signupDisabled: false } }) };
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
  hardReload.mockClear();
  mockPasskeyLogin.mockClear();

  // Mock localStorage
  global.localStorage = {
    getItem: (key: string) => localStorageMock[key] ?? null,
    setItem: (key: string, value: string) => {
      localStorageMock[key] = value;
    },
    removeItem: (key: string) => {
      delete localStorageMock[key];
    },
    clear: () => {
      localStorageMock = {};
    },
    length: Object.keys(localStorageMock).length,
    key: () => null,
  } as Storage;

  // Mock PublicKeyCredential for passkey support detection
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).PublicKeyCredential = true;
  }

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

describe("/cloud identifier-first flow", () => {
  describe("default screen (options)", () => {
    it("shows Google button when googleEnabled is true", async () => {
      render(<CloudAuthPage />);
      await waitFor(() => expect(screen.queryByText("Continue with Google")).toBeInTheDocument());
    });

    it("shows passkey button when supported", async () => {
      render(<CloudAuthPage />);
      await waitFor(() => expect(screen.queryByText("Sign in with a passkey")).toBeInTheDocument());
    });

    it("shows 'Use email instead' link", async () => {
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      expect(link).toBeInTheDocument();
    });

    it("shows One-click demo footer", async () => {
      render(<CloudAuthPage />);
      const demoLink = await screen.findByText("One-click demo");
      expect(demoLink).toBeInTheDocument();
    });

    it("does not show email/password fields by default", async () => {
      render(<CloudAuthPage />);
      await waitFor(() => expect(screen.queryByLabelText("Email or username")).not.toBeInTheDocument());
      expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
    });

    it("does not show Sign In or Create Account tablist", async () => {
      render(<CloudAuthPage />);
      await waitFor(() => {
        const buttons = screen.queryAllByRole("button");
        const hasTabSwitch = buttons.some((b) =>
          b.textContent?.includes("Sign In") && b.textContent?.includes("Create Account")
        );
        expect(hasTabSwitch).toBe(false);
      });
    });
  });

  describe("'Use email instead' flow", () => {
    it("reveals identifier-first flow when clicked", async () => {
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      await waitFor(() => {
        expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
      });
    });

    it("step 1: identify -> exists true -> shows sign in", async () => {
      handlers["/api/auth/identify"] = () => ({ body: { exists: true } });
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      const input = await screen.findByLabelText("Email or username");
      fireEvent.change(input, { target: { value: "existing@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      });
    });

    it("step 1: identify -> exists false + email -> shows signup", async () => {
      handlers["/api/auth/identify"] = () => ({ body: { exists: false } });
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      const input = await screen.findByLabelText("Email or username");
      fireEvent.change(input, { target: { value: "new@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => {
        expect(screen.getByLabelText("Display name")).toBeInTheDocument();
      });
    });

    it("step 1: identify -> exists false + username -> error", async () => {
      handlers["/api/auth/identify"] = () => ({ body: { exists: false } });
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      const input = await screen.findByLabelText("Email or username");
      fireEvent.change(input, { target: { value: "newusername" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/no account with that username/i);
      });
    });

    it("'Change' link in signin step returns to identify", async () => {
      handlers["/api/auth/identify"] = () => ({ body: { exists: true } });
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      let input = await screen.findByLabelText("Email or username");
      fireEvent.change(input, { target: { value: "existing@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      });
      const changeBtn = screen.getByText("Change");
      fireEvent.click(changeBtn);
      await waitFor(() => {
        input = screen.getByLabelText("Email or username");
        expect(input).toBeInTheDocument();
      });
    });

    it("signin posts to /api/auth/login with same body shape", async () => {
      handlers["/api/auth/identify"] = () => ({ body: { exists: true } });
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      let input = await screen.findByLabelText("Email or username");
      fireEvent.change(input, { target: { value: "user@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => {
        expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      });
      input = screen.getByLabelText("Password") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "password123" } });
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      await waitFor(() => {
        expect(calls.some((c) => c.url === "/api/auth/login")).toBe(true);
        const body = bodyOf("/api/auth/login");
        expect(body).toEqual({ identifier: "user@example.com", password: "password123" });
      });
    });

    it("signup posts to /api/auth/register with same body shape", async () => {
      handlers["/api/auth/identify"] = () => ({ body: { exists: false } });
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      let input = await screen.findByLabelText("Email or username");
      fireEvent.change(input, { target: { value: "new@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => {
        expect(screen.getByLabelText("Display name")).toBeInTheDocument();
      });
      fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123456" } });
      fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123456" } });
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));
      await waitFor(() => {
        expect(calls.some((c) => c.url === "/api/auth/register")).toBe(true);
        const body = bodyOf("/api/auth/register");
        expect(body.username).toBe("new@example.com");
        expect(body.password).toBe("password123456");
      });
    });

    it("'Back to sign-in options' returns to options screen", async () => {
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      await waitFor(() => {
        expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
      });
      const backBtn = screen.getByText("Back to sign-in options");
      fireEvent.click(backBtn);
      await waitFor(() => {
        expect(screen.getByText("Sign in with a passkey")).toBeInTheDocument();
      });
    });
  });

  describe("auto passkey for returning users", () => {
    it("skip flag prevents auto passkey attempt", async () => {
      localStorageMock["pf-passkey-hint"] = "1";
      localStorageMock["pf-passkey-auto-skip"] = "1";
      mockPasskeyLogin.mockResolvedValue({ ok: true });
      render(<CloudAuthPage />);
      // Should not attempt auto passkey
      await new Promise((r) => setTimeout(r, 100));
      expect(mockPasskeyLogin).not.toHaveBeenCalled();
    });

    it("?mode=signup prevents auto passkey attempt", async () => {
      params = new URLSearchParams("mode=signup");
      localStorageMock["pf-passkey-hint"] = "1";
      mockPasskeyLogin.mockResolvedValue({ ok: true });
      render(<CloudAuthPage />);
      // Should show email flow and not attempt auto passkey
      await waitFor(() => {
        expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
      });
      expect(mockPasskeyLogin).not.toHaveBeenCalled();
    });

    it("?tab=create prevents auto passkey attempt", async () => {
      params = new URLSearchParams("tab=create");
      localStorageMock["pf-passkey-hint"] = "1";
      mockPasskeyLogin.mockResolvedValue({ ok: true });
      render(<CloudAuthPage />);
      // Should show email flow and not attempt auto passkey
      await waitFor(() => {
        expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
      });
      expect(mockPasskeyLogin).not.toHaveBeenCalled();
    });
  });

  describe("deep links and signup intent", () => {
    it("?email=x opens email flow at identify step", async () => {
      params = new URLSearchParams("email=test@example.com");
      render(<CloudAuthPage />);
      await waitFor(() => {
        expect((screen.getByLabelText("Email or username") as HTMLInputElement).value).toBe("test@example.com");
      });
    });

    it("?mode=signup opens email flow", async () => {
      params = new URLSearchParams("mode=signup");
      render(<CloudAuthPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
      });
    });

    it("?tab=create opens email flow (legacy compat)", async () => {
      params = new URLSearchParams("tab=create");
      render(<CloudAuthPage />);
      await waitFor(() => {
        expect(screen.getByLabelText("Email or username")).toBeInTheDocument();
      });
    });
  });

  describe("signup disabled config", () => {
    it("shows 'Sign-up is disabled' when signupDisabled is true", async () => {
      handlers["/api/auth/config"] = () => ({ body: { googleEnabled: true, signupDisabled: true } });
      handlers["/api/auth/identify"] = () => ({ body: { exists: false } });
      render(<CloudAuthPage />);
      const link = await screen.findByText("Use email instead");
      fireEvent.click(link);
      const input = await screen.findByLabelText("Email or username");
      fireEvent.change(input, { target: { value: "new@example.com" } });
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await waitFor(() => {
        expect(screen.getByText(/sign-up is currently disabled/i)).toBeInTheDocument();
      });
    });
  });
});
