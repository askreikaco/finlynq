/**
 * Client step-up helper: options -> assertion (no PRF) -> { token, response }.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const startAuthentication = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
  startRegistration: vi.fn(),
}));

import { getPasskeyStepUp } from "@/lib/client/passkey-stepup";

beforeEach(() => {
  startAuthentication.mockReset();
  vi.unstubAllGlobals();
});

describe("getPasskeyStepUp", () => {
  it("posts the action, returns the single-use token + assertion with PRF stripped", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ options: { challenge: "c" }, token: "t1" }) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    startAuthentication.mockResolvedValue({
      id: "x", rawId: "x", type: "public-key",
      response: { clientDataJSON: "a", authenticatorData: "b", signature: "c" },
      clientExtensionResults: { prf: { results: { first: new ArrayBuffer(32) } } },
    });
    const r = await getPasskeyStepUp("wipe-account");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ action: "wipe-account" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.passkeyStepUp.token).toBe("t1");
      expect(r.passkeyStepUp.response.clientExtensionResults).toEqual({});
    }
    // no PRF eval requested for a step-up
    expect(startAuthentication.mock.calls[0][0].optionsJSON.extensions).toBeUndefined();
  });

  it("maps a cancelled prompt and a server refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ options: {}, token: "t" }) }) as unknown as Response));
    startAuthentication.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    expect(await getPasskeyStepUp("passkey-remove")).toEqual({ ok: false, code: "cancelled" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response));
    expect(await getPasskeyStepUp("passkey-remove")).toEqual({ ok: false, code: "failed" });
  });
});
