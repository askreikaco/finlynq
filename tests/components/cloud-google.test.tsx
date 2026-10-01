/**
 * @vitest-environment jsdom
 * /cloud page: Google sign-in flow (button, unlock, mfa, register prefill, errors).
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

import CloudAuthPage from "@/app/cloud/page";

type Handler = (init?: RequestInit) => { status?: number; body: unknown };
let handlers: Record<string, Handler>;
let calls: { url: string; init?: RequestInit }[];

beforeEach(() => {
  params = new URLSearchParams();
  calls = [];
  handlers = { "/api/auth/config": () => ({ body: { googleEnabled: true } }) };
  push.mockClear(); replace.mockClear(); refresh.mockClear(); hardReload.mockClear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const h = handlers[url];
    const r = h ? h(init) : { status: 404, body: {} };
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const bodyOf = (url: string) =>
  JSON.parse(String(calls.filter((c) => c.url === url).at(-1)?.init?.body));

describe("/cloud Google flow", () => {
  it("(a) hides the Google button when googleEnabled is false", async () => {
    handlers["/api/auth/config"] = () => ({ body: { googleEnabled: false } });
    render(<CloudAuthPage />);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/config")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Continue with Google")).toBeNull();
  });

  it("(b) button is a link to /api/auth/google/start with next=", async () => {
    render(<CloudAuthPage />);
    const link = await screen.findByRole("link", { name: /continue with google/i });
    expect(link.getAttribute("href")).toContain("/api/auth/google/start");
    expect(link.getAttribute("href")).toContain("next=");
  });

  it("(c) unsafe ?next is replaced by the default", async () => {
    params = new URLSearchParams("next=//evil.com");
    render(<CloudAuthPage />);
    const link = await screen.findByRole("link", { name: /continue with google/i });
    expect(link.getAttribute("href")).toContain("next=%2Fdashboard");
    expect(link.getAttribute("href")).not.toContain("evil");
  });

  it("(d) unlock shows masked email; 401 keeps step, shows alert, keeps password", async () => {
    params = new URLSearchParams("step=unlock");
    handlers["/api/auth/google/pending"] = () => ({ body: { kind: "unlock", email: "a***@x.com" } });
    handlers["/api/auth/google/unlock"] = () => ({ status: 401, body: { error: "Wrong password", retry: true } });
    render(<CloudAuthPage />);
    expect(await screen.findByText(/a\*\*\*@x\.com/)).toBeInTheDocument();
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hunter2hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/wrong password/i);
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("hunter2hunter2");
    expect(screen.getByRole("heading", { name: /confirm your password/i })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("(d2) unlock 429 shows restart message", async () => {
    params = new URLSearchParams("step=unlock");
    handlers["/api/auth/google/unlock"] = () => ({ status: 429, body: { error: "Too many requests" } });
    render(<CloudAuthPage />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/start over with google/i);
  });

  it("(e) unlock mfaRequired -> mfa step; verify body carries the token", async () => {
    params = new URLSearchParams("step=unlock");
    handlers["/api/auth/google/unlock"] = () => ({ body: { mfaRequired: true, mfaPendingToken: "tok123" } });
    handlers["/api/auth/mfa/verify"] = () => ({ body: { ok: true } });
    render(<CloudAuthPage />);
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const code = await screen.findByLabelText("Authentication code");
    expect(replace).toHaveBeenCalledWith(expect.stringContaining("step=mfa"));
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(bodyOf("/api/auth/mfa/verify")).toEqual({ mfaPendingToken: "tok123", code: "123456" }));
  });

  it("(f) step=mfa from URL omits mfaPendingToken key", async () => {
    params = new URLSearchParams("step=mfa");
    handlers["/api/auth/mfa/verify"] = () => ({ body: { ok: true } });
    render(<CloudAuthPage />);
    const code = await screen.findByLabelText("Authentication code");
    fireEvent.change(code, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/mfa/verify")).toBe(true));
    const body = bodyOf("/api/auth/mfa/verify");
    expect(body).toEqual({ code: "654321" });
    expect("mfaPendingToken" in body).toBe(false);
  });

  it("(g) error=google_denied shows mapped message in an alert", async () => {
    params = new URLSearchParams("error=google_denied");
    render(<CloudAuthPage />);
    expect((await screen.findByRole("alert")).textContent).toBe("Google sign-in was cancelled.");
  });

  it("(g2) register with google=1 pre-fills email", async () => {
    params = new URLSearchParams("tab=register&google=1");
    handlers["/api/auth/google/pending"] = () => ({ body: { kind: "signup", email: "a***@x.com", name: "Al" } });
    render(<CloudAuthPage />);
    // Signup step shows the (masked) Google email as the identifier chip; user picks a username.
    expect(await screen.findByText("a***@x.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("(h) password login POST body is unchanged", async () => {
    handlers["/api/auth/login"] = () => ({ body: { ok: true } });
    handlers["/api/auth/identify"] = () => ({ body: { exists: true } });
    render(<CloudAuthPage />);
    fireEvent.click(await screen.findByText("Use email instead"));
    fireEvent.change(await screen.findByLabelText("Email or username"), { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const pw = await screen.findByPlaceholderText("Password");
    fireEvent.change(pw, { target: { value: "secret-pass" } });
    fireEvent.submit(pw.closest("form")!);
    await waitFor(() => expect(calls.some((c) => c.url === "/api/auth/login")).toBe(true));
    expect(bodyOf("/api/auth/login")).toEqual({ identifier: "bob", password: "secret-pass" });
    // Login is a FULL page load (kills SWR/React caches), never a client-side push.
    await waitFor(() => expect(hardReload).toHaveBeenCalledWith("/dashboard"));
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
