/**
 * Client PRF helper (src/lib/client/passkey-prf.ts): the browser lib does not
 * convert PRF inputs/results, the helper must. @simplewebauthn/browser and
 * fetch are stubbed; no DOM needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const startAuthentication = vi.fn();
const startRegistration = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
  startRegistration: (...a: unknown[]) => startRegistration(...a),
}));

import {
  b64urlToBytes,
  bytesToB64url,
  getAssertionWithPrf,
  registerPasskey,
  passkeyLogin,
  passkeyRecovery,
  enablePasskeyPrf,
} from "@/lib/client/passkey-prf";

const SALT = Buffer.alloc(32, 7).toString("base64url");
const buf = (n: number, v: number) => new Uint8Array(n).fill(v).buffer;
const fakeAssertion = (prf?: ArrayBuffer) => ({
  id: "cred1",
  rawId: "cred1",
  type: "public-key",
  response: { clientDataJSON: "a", authenticatorData: "b", signature: "c" },
  clientExtensionResults: prf ? { prf: { results: { first: prf } } } : {},
});
const OPTS = { challenge: "ch", rpId: "x", allowCredentials: [], userVerification: "required" } as never;

beforeEach(() => {
  startAuthentication.mockReset();
  startRegistration.mockReset();
  vi.unstubAllGlobals();
});

describe("passkey-prf client helper", () => {
  it("base64url helpers roundtrip", () => {
    const b = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 1]);
    expect(Array.from(b64urlToBytes(bytesToB64url(b)))).toEqual(Array.from(b));
  });

  it("passes eval.first as BYTES (not a string), keeps other options, strips PRF from the JSON, returns 32-byte base64url", async () => {
    startAuthentication.mockResolvedValue(fakeAssertion(buf(32, 9)));
    const out = await getAssertionWithPrf(OPTS, SALT);
    const sent = startAuthentication.mock.calls[0][0].optionsJSON;
    expect(sent.extensions.prf.eval.first).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(sent.extensions.prf.eval.first).equals(Buffer.alloc(32, 7))).toBe(true);
    expect(sent.challenge).toBe("ch");
    expect(out.prfOutput).toBe(Buffer.alloc(32, 9).toString("base64url"));
    expect(out.response.clientExtensionResults).toEqual({});
    expect(JSON.stringify(out.response)).not.toContain(out.prfOutput!);
  });

  it("no salt -> no PRF extension; no result or wrong length -> prfOutput null", async () => {
    startAuthentication.mockResolvedValue(fakeAssertion());
    let out = await getAssertionWithPrf(OPTS, null);
    expect(startAuthentication.mock.calls[0][0].optionsJSON.extensions).toBeUndefined();
    expect(out.prfOutput).toBeNull();
    startAuthentication.mockResolvedValue(fakeAssertion());
    out = await getAssertionWithPrf(OPTS, SALT);
    expect(out.prfOutput).toBeNull();
    startAuthentication.mockResolvedValue(fakeAssertion(buf(16, 1)));
    out = await getAssertionWithPrf(OPTS, SALT);
    expect(out.prfOutput).toBeNull();
  });

  it("registerPasskey asks for prf:{} and reports enabled", async () => {
    startRegistration.mockResolvedValue({ id: "c", clientExtensionResults: { prf: { enabled: true } } });
    const r = await registerPasskey({ challenge: "x" } as never);
    expect(startRegistration.mock.calls[0][0].optionsJSON.extensions.prf).toEqual({});
    expect(r.prfEnabled).toBe(true);
    startRegistration.mockResolvedValue({ id: "c", clientExtensionResults: {} });
    expect((await registerPasskey({ challenge: "x" } as never)).prfEnabled).toBeUndefined();
  });

  const jsonRes = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

  it("passkeyLogin one prompt (server returned a salt): single assertion, PRF sent as prfOutput only", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (url.endsWith("/options")) return jsonRes(200, { options: OPTS, token: "T1", prfSalt: SALT });
      return jsonRes(200, { success: true });
    }));
    startAuthentication.mockResolvedValue(fakeAssertion(buf(32, 3)));
    const r = await passkeyLogin({ trustDevice: false });
    expect(r.ok).toBe(true);
    expect(startAuthentication).toHaveBeenCalledTimes(1);
    expect(calls[1].url).toBe("/api/auth/passkey/login/verify");
    expect(calls[1].body).toMatchObject({ token: "T1", prfOutput: Buffer.alloc(32, 3).toString("base64url"), trustDevice: false });
    expect((calls[1].body.response as { clientExtensionResults: unknown }).clientExtensionResults).toEqual({});
  });

  it("passkeyLogin two prompts (discoverable): step 1 without PRF, step 2 with the server-provided salt", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (url.endsWith("/options")) return jsonRes(200, { options: OPTS, token: "T1" });
      if (body.token === "T1") return jsonRes(200, { step: "prf", options: OPTS, token: "T2", prfSalt: SALT, credentialId: "cred1" });
      return jsonRes(200, { success: true });
    }));
    startAuthentication.mockResolvedValueOnce(fakeAssertion()).mockResolvedValueOnce(fakeAssertion(buf(32, 5)));
    const r = await passkeyLogin();
    expect(r.ok).toBe(true);
    expect(calls[1].body.prfOutput).toBeUndefined();
    expect(startAuthentication.mock.calls[1][0].optionsJSON.extensions.prf.eval.first).toBeInstanceOf(Uint8Array);
    expect(calls[2].body).toMatchObject({ token: "T2", prfOutput: Buffer.alloc(32, 5).toString("base64url") });
  });

  it("prf_unavailable from the server and 'authenticator returned no PRF' both surface as prf_unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.endsWith("/options") ? jsonRes(200, { options: OPTS, token: "T1", prfSalt: SALT }) : jsonRes(400, { code: "prf_unavailable" })));
    startAuthentication.mockResolvedValue(fakeAssertion());
    expect(await passkeyLogin()).toEqual({ ok: false, code: "prf_unavailable", status: 400 });

    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
      if (url.endsWith("/options")) return jsonRes(200, { options: OPTS, token: "T1" });
      return JSON.parse(init.body).token === "T1" ? jsonRes(200, { step: "prf", options: OPTS, token: "T2", prfSalt: SALT }) : jsonRes(200, {});
    }));
    startAuthentication.mockResolvedValue(fakeAssertion());
    expect(await passkeyLogin()).toMatchObject({ ok: false, code: "prf_unavailable" });
  });

  it("user cancel -> cancelled; recovery sends newPassword; enablePasskeyPrf maps password_required", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(200, { options: OPTS, token: "T1", prfSalt: SALT })));
    startAuthentication.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));
    expect(await passkeyLogin()).toMatchObject({ ok: false, code: "cancelled" });

    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return url.endsWith("/options") ? jsonRes(200, { options: OPTS, token: "T1", prfSalt: SALT }) : jsonRes(200, { success: true });
    }));
    startAuthentication.mockReset();
    startAuthentication.mockResolvedValue(fakeAssertion(buf(32, 2)));
    expect((await passkeyRecovery("New-Passw0rd!x")).ok).toBe(true);
    expect(bodies[1]).toMatchObject({ newPassword: "New-Passw0rd!x" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonRes(401, { error: "Password required" })));
    expect(await enablePasskeyPrf("cred1")).toEqual({ ok: false, code: "password_required" });
  });
});
