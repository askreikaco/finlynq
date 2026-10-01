/**
 * @vitest-environment jsdom
 * Multi-account B3: /cloud?add=1 banner, email prefill, and redirect sanitising.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

let params = new URLSearchParams();
const push = vi.fn();
const replace = vi.fn();
const hardReload = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  useSearchParams: () => params,
}));
vi.mock("@/lib/client/hard-reload", () => ({ hardReload: (...a: unknown[]) => hardReload(...a) }));
vi.mock("@/components/analytics-consent", () => ({ AnalyticsConsent: () => null }));
vi.mock("@/components/logo-mark", () => ({ LogoMark: () => null }));

import CloudAuthPage from "@/app/cloud/page";

type Handler = () => { status?: number; body: unknown };
let handlers: Record<string, Handler>;

const ACTIVE = [
  { userId: "u1", email: "alice@example.com", displayName: "Alice", active: true, status: "active" },
];

beforeEach(() => {
  params = new URLSearchParams();
  push.mockClear();
  replace.mockClear();
  hardReload.mockClear();
  handlers = {
    "/api/auth/config": () => ({ body: { googleEnabled: false } }),
    "/api/auth/accounts": () => ({ body: ACTIVE }),
    "/api/auth/login": () => ({ body: { success: true } }),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const h = handlers[url];
      const r = h ? h() : { status: 404, body: {} };
      const status = r.status ?? 200;
      return { ok: status < 400, status, json: async () => r.body } as Response;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function signIn() {
  const id = await screen.findByPlaceholderText(/username or/i);
  fireEvent.change(id, { target: { value: "bob" } });
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: "pw12345678" } });
  fireEvent.submit(id.closest("form")!);
}

describe("/cloud?add=1", () => {
  it("shows the banner naming the account that stays signed in, plus Cancel to /dashboard", async () => {
    params = new URLSearchParams("add=1");
    render(<CloudAuthPage />);
    expect(
      await screen.findByText("Adding another account — you'll stay signed in as alice@example.com"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^cancel$/i })).toHaveAttribute("href", "/dashboard");
  });

  it("renders the active email as text, never as HTML", async () => {
    params = new URLSearchParams("add=1");
    handlers["/api/auth/accounts"] = () => ({
      body: [{ ...ACTIVE[0], email: '<img src=x onerror="window.__xss=1">' }],
    });
    render(<CloudAuthPage />);
    await screen.findByText(/stay signed in as/);
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("no banner without ?add=1 (and no accounts request)", async () => {
    render(<CloudAuthPage />);
    await screen.findByPlaceholderText(/username or/i);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Adding another account/)).toBeNull();
    expect(vi.mocked(fetch).mock.calls.some((c) => c[0] === "/api/auth/accounts")).toBe(false);
  });

  it("no banner for ?add=0", async () => {
    params = new URLSearchParams("add=0");
    render(<CloudAuthPage />);
    await screen.findByPlaceholderText(/username or/i);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Adding another account/)).toBeNull();
  });

  it("no banner when nobody is signed in (accounts 401)", async () => {
    params = new URLSearchParams("add=1");
    handlers["/api/auth/accounts"] = () => ({ status: 401, body: {} });
    render(<CloudAuthPage />);
    await screen.findByPlaceholderText(/username or/i);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Adding another account/)).toBeNull();
  });

  it("prefills the identifier from ?email= as a plain value", async () => {
    params = new URLSearchParams({ add: "1", email: "bob+x@example.com" });
    render(<CloudAuthPage />);
    const id = (await screen.findByPlaceholderText(/username or/i)) as HTMLInputElement;
    expect(id.value).toBe("bob+x@example.com");
  });

  it("an HTML-looking ?email= is inert text in the input", async () => {
    params = new URLSearchParams({ add: "1", email: '"><img src=x onerror=alert(1)>' });
    render(<CloudAuthPage />);
    const id = (await screen.findByPlaceholderText(/username or/i)) as HTMLInputElement;
    expect(id.value).toContain("<img");
    expect(document.querySelector("img[src='x']")).toBeNull();
  });
});

describe("/cloud redirect sanitising (open redirect)", () => {
  const cases: [string, string][] = [
    ["https://evil.com/steal", "/dashboard"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["/\t/evil.com", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    ["/budgets?x=1", "/budgets?x=1"],
  ];
  for (const [input, expected] of cases) {
    it(`?redirect=${JSON.stringify(input)} -> hardReload(${expected})`, async () => {
      params = new URLSearchParams({ redirect: input });
      render(<CloudAuthPage />);
      await signIn();
      await waitFor(() => expect(hardReload).toHaveBeenCalled());
      expect(hardReload).toHaveBeenCalledWith(expected);
      expect(push).not.toHaveBeenCalled();
    });
  }

  it("?next= is sanitised the same way", async () => {
    params = new URLSearchParams({ next: "https://evil.com" });
    render(<CloudAuthPage />);
    await signIn();
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
  });
});
