/**
 * @vitest-environment jsdom
 * Settings > Data > Delete account for a passkey-only user: the server answers
 * 401 passkey-required; the UI runs a passkey step-up (action delete-account)
 * and retries once with { passkeyStepUp }.
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/data",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/portfolio/rebuild-snapshots-button", () => ({ RebuildSnapshotsButton: () => null }));

const startAuthentication = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
  startRegistration: vi.fn(),
}));

import DataSettingsPage from "@/app/(app)/settings/data/page";

let calls: { url: string; body: Record<string, unknown> }[];
let deleteReplies: Array<{ status: number; body: unknown }>;

beforeEach(() => {
  calls = [];
  startAuthentication.mockReset();
  deleteReplies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body });
      let r: { status: number; body: unknown } = { status: 404, body: {} };
      if (url === "/api/auth/delete-account") r = deleteReplies.shift() ?? { status: 500, body: {} };
      if (url === "/api/auth/step-up/passkey/options") r = { status: 200, body: { options: { challenge: "s1", allowCredentials: [] }, token: "step-token" } };
      return { ok: r.status < 400, status: r.status, json: async () => r.body, clone() { return this; } } as unknown as Response;
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openDeleteForm(user: ReturnType<typeof userEvent.setup>) {
  render(<DataSettingsPage />);
  await user.click(await screen.findByRole("button", { name: /delete account/i }));
  await user.click(screen.getByRole("button", { name: /^continue$/i }));
  await user.type(screen.getByPlaceholderText("Your password"), "Hunter2!Hunter2");
  await user.type(screen.getByPlaceholderText("Type DELETE"), "DELETE");
}
const deletes = () => calls.filter((c) => c.url === "/api/auth/delete-account");

describe("delete account with a passkey-only user", () => {
  it("passkey-required -> step-up for 'delete-account' -> retry carries passkeyStepUp", async () => {
    const user = userEvent.setup();
    deleteReplies = [
      { status: 401, body: { code: "passkey-required", error: "x" } },
      { status: 200, body: { success: true } },
    ];
    startAuthentication.mockResolvedValue({
      id: "cred1", rawId: "cred1", type: "public-key",
      response: { clientDataJSON: "a", authenticatorData: "b", signature: "c" },
      clientExtensionResults: {},
    });
    await openDeleteForm(user);
    await user.click(screen.getByRole("button", { name: /delete my account/i }));
    await waitFor(() => expect(deletes()).toHaveLength(2));
    expect(deletes()[0].body).toMatchObject({ password: "Hunter2!Hunter2", confirmation: "DELETE" });
    expect("passkeyStepUp" in deletes()[0].body).toBe(false);
    expect(calls.find((c) => c.url === "/api/auth/step-up/passkey/options")!.body).toEqual({ action: "delete-account" });
    const retry = deletes()[1].body.passkeyStepUp as { token: string; response: { id: string } };
    expect(retry.token).toBe("step-token");
    expect(retry.response.id).toBe("cred1");
  });

  it("cancelled passkey prompt: no retry, message shown", async () => {
    const user = userEvent.setup();
    deleteReplies = [{ status: 401, body: { code: "passkey-required", error: "x" } }];
    startAuthentication.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    await openDeleteForm(user);
    await user.click(screen.getByRole("button", { name: /delete my account/i }));
    expect(await screen.findByText(/passkey confirmation was cancelled/i)).toBeInTheDocument();
    expect(deletes()).toHaveLength(1);
  });
});
