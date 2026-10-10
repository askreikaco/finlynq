// @vitest-environment node
/**
 * /api/local-first/ops route contract: flag gate, auth, body validation, cursor
 * parsing. The store and auth are mocked; DB behaviour is in op-store.db.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { MalformedFrameError } from "@/lib/local-first/oplog/errors";

const requireAuthMock = vi.hoisted(() => vi.fn());
const appendMock = vi.hoisted(() => vi.fn());
const pullMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/local-first/server/op-store", () => ({
  appendFrames: appendMock,
  pullFrames: pullMock,
  MAX_APPEND_FRAMES: 500,
  MAX_PULL_LIMIT: 500,
}));

import { GET, POST } from "@/app/api/local-first/ops/route";

const URL_BASE = "http://localhost/api/local-first/ops";
const OK_AUTH = { authenticated: true, context: { userId: "user-A" } };
const DENIED = {
  authenticated: false,
  response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
};

function postReq(body: unknown, raw = false): NextRequest {
  return new NextRequest(URL_BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}
function getReq(qs = ""): NextRequest {
  return new NextRequest(`${URL_BASE}${qs}`);
}
const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

beforeEach(() => {
  process.env.FINLYNQ_LOCAL_FIRST_API = "1";
  requireAuthMock.mockReset().mockResolvedValue(OK_AUTH);
  appendMock.mockReset().mockResolvedValue({ accepted: 1, duplicate: 0, lastCursor: 7 });
  pullMock.mockReset().mockResolvedValue({ frames: [], nextCursor: 0, hasMore: false });
});

afterEach(() => {
  delete process.env.FINLYNQ_LOCAL_FIRST_API;
});

describe("flag gate", () => {
  it("returns 404 for POST and GET when FINLYNQ_LOCAL_FIRST_API is unset, before auth runs", async () => {
    delete process.env.FINLYNQ_LOCAL_FIRST_API;
    const p = await POST(postReq({ frames: [b64([1, 2, 3, 4])] }));
    const g = await GET(getReq("?after=0"));
    expect(p.status).toBe(404);
    expect(g.status).toBe(404);
    expect(requireAuthMock).not.toHaveBeenCalled();
    expect(appendMock).not.toHaveBeenCalled();
    expect(pullMock).not.toHaveBeenCalled();
  });

  it.each(["true", "yes", "on", "0", ""])("returns 404 for FINLYNQ_LOCAL_FIRST_API=%j (only the exact value 1 enables)", async (v) => {
    process.env.FINLYNQ_LOCAL_FIRST_API = v;
    expect((await GET(getReq())).status).toBe(404);
    expect(requireAuthMock).not.toHaveBeenCalled();
  });
});

describe("auth", () => {
  it("returns the auth response and never touches the store when unauthenticated", async () => {
    requireAuthMock.mockResolvedValue(DENIED);
    const p = await POST(postReq({ frames: [b64([1, 2, 3, 4])] }));
    const g = await GET(getReq());
    expect(p.status).toBe(401);
    expect(g.status).toBe(401);
    expect(appendMock).not.toHaveBeenCalled();
    expect(pullMock).not.toHaveBeenCalled();
  });

  it("scopes writes and reads to the authenticated user id", async () => {
    await POST(postReq({ frames: [b64([1, 2, 3, 4])] }));
    await GET(getReq("?after=3"));
    expect(appendMock.mock.calls[0][0]).toBe("user-A");
    expect(pullMock.mock.calls[0][0]).toBe("user-A");
  });
});

describe("POST body validation", () => {
  it("decodes base64 frames and passes raw bytes to appendFrames", async () => {
    const res = await POST(postReq({ frames: [b64([9, 8, 7, 6]), b64([5, 4, 3, 2])] }));
    expect(res.status).toBe(200);
    const frames = appendMock.mock.calls[0][1] as Uint8Array[];
    expect(Array.from(frames[0])).toEqual([9, 8, 7, 6]);
    expect(Array.from(frames[1])).toEqual([5, 4, 3, 2]);
    expect(await res.json()).toEqual({ accepted: 1, duplicate: 0, lastCursor: 7 });
  });

  it.each([
    ["missing frames", {}],
    ["empty array", { frames: [] }],
    ["non-string entry", { frames: [42] }],
    ["not an array", { frames: "abcd" }],
    ["bad base64 chars", { frames: ["@@@@"] }],
    ["bad base64 length", { frames: ["QUJDR"] }],
    ["base64 with interior padding", { frames: ["QQ==QQ=="] }],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await POST(postReq(body));
    expect(res.status).toBe(400);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    expect((await POST(postReq("{not json", true))).status).toBe(400);
  });

  it("returns 400 when more than 500 frames are sent", async () => {
    const frames = Array.from({ length: 501 }, () => b64([1, 2, 3, 4]));
    expect((await POST(postReq({ frames }))).status).toBe(400);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over 1 MB", async () => {
    const big = JSON.stringify({ frames: ["A".repeat(1024 * 1024 + 10)] });
    const res = await POST(postReq(big, true));
    expect(res.status).toBe(413);
    expect(appendMock).not.toHaveBeenCalled();
  });

  it("maps a store-level frame rejection to 400 with the fixed message", async () => {
    appendMock.mockRejectedValue(new MalformedFrameError("opId is not a ULID"));
    const res = await POST(postReq({ frames: [b64([1, 2, 3, 4])] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("malformed frame: opId is not a ULID");
  });
});

describe("GET cursor pull", () => {
  it("passes after and limit through and serialises frames as base64", async () => {
    pullMock.mockResolvedValue({
      frames: [{ id: 5, deviceId: "dev", opId: "01HZZZZZZZZZZZZZZZZZZZZZZZ", seq: 1, frame: new Uint8Array([7, 7]) }],
      nextCursor: 5,
      hasMore: true,
    });
    const res = await GET(getReq("?after=4&limit=25"));
    expect(pullMock).toHaveBeenCalledWith("user-A", 4, 25);
    const body = await res.json();
    expect(body.nextCursor).toBe(5);
    expect(body.hasMore).toBe(true);
    expect(body.frames[0]).toEqual({
      id: 5,
      deviceId: "dev",
      opId: "01HZZZZZZZZZZZZZZZZZZZZZZZ",
      seq: 1,
      frame: b64([7, 7]),
    });
  });

  it("defaults after=0 and limit=100", async () => {
    await GET(getReq());
    expect(pullMock).toHaveBeenCalledWith("user-A", 0, 100);
  });

  it("clamps limit to 500", async () => {
    await GET(getReq("?limit=9000"));
    expect(pullMock).toHaveBeenCalledWith("user-A", 0, 500);
  });

  it.each(["?after=-1", "?after=abc", "?after=1.5", "?limit=0", "?limit=-3"])("returns 400 for %s", async (qs) => {
    expect((await GET(getReq(qs))).status).toBe(400);
    expect(pullMock).not.toHaveBeenCalled();
  });

  it("sets no-store on responses", async () => {
    const res = await GET(getReq());
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
