/**
 * Local-first op-log endpoints (L1). Ciphertext only: the server stores and
 * returns opaque frames and never decrypts them.
 *   POST { frames: string[] }  base64 frames, max 500 frames, max 1 MB body
 *   GET  ?after=<cursor>&limit=<n>  frames with id > after, limit <= 500
 * Off unless FINLYNQ_LOCAL_FIRST_API=1. Returns 404 otherwise.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { appendFrames, pullFrames, MAX_APPEND_FRAMES, MAX_PULL_LIMIT } from "@/lib/local-first/server/op-store";
import { MalformedFrameError, TruncatedFrameError, UnsupportedVersionError } from "@/lib/local-first/oplog/errors";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024 * 1024;
const B64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const NOT_FOUND = () => NextResponse.json({ error: "Not found" }, { status: 404 });

function apiEnabled(): boolean {
  return process.env.FINLYNQ_LOCAL_FIRST_API === "1";
}

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function frameErrorResponse(err: unknown): NextResponse | null {
  if (
    err instanceof MalformedFrameError ||
    err instanceof TruncatedFrameError ||
    err instanceof UnsupportedVersionError ||
    err instanceof RangeError
  ) {
    return noStore(NextResponse.json({ error: err.message }, { status: 400 }));
  }
  return null;
}

export async function POST(request: NextRequest) {
  if (!apiEnabled()) return NOT_FOUND();
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return noStore(NextResponse.json({ error: "Body too large" }, { status: 413 }));
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return noStore(NextResponse.json({ error: "Body too large" }, { status: 413 }));
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return noStore(NextResponse.json({ error: "Invalid JSON" }, { status: 400 }));
  }
  const list = (body as { frames?: unknown } | null)?.frames;
  if (!Array.isArray(list) || list.length === 0 || !list.every((x) => typeof x === "string")) {
    return noStore(NextResponse.json({ error: "frames must be a non-empty array of base64 strings" }, { status: 400 }));
  }
  if (list.length > MAX_APPEND_FRAMES) {
    return noStore(NextResponse.json({ error: `at most ${MAX_APPEND_FRAMES} frames per request` }, { status: 400 }));
  }

  const frames: Uint8Array[] = [];
  for (const s of list as string[]) {
    if (s.length === 0 || s.length % 4 !== 0 || !B64_RE.test(s)) {
      return noStore(NextResponse.json({ error: "frame is not valid base64" }, { status: 400 }));
    }
    frames.push(new Uint8Array(Buffer.from(s, "base64")));
  }

  try {
    const result = await appendFrames(userId, frames);
    return noStore(NextResponse.json(result));
  } catch (err) {
    const bad = frameErrorResponse(err);
    if (bad) return bad;
    throw err;
  }
}

export async function GET(request: NextRequest) {
  if (!apiEnabled()) return NOT_FOUND();
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;

  const sp = request.nextUrl.searchParams;
  const afterRaw = sp.get("after") ?? "0";
  const limitRaw = sp.get("limit") ?? "100";
  if (!/^\d+$/.test(afterRaw) || !Number.isSafeInteger(Number(afterRaw))) {
    return noStore(NextResponse.json({ error: "after must be a non-negative integer" }, { status: 400 }));
  }
  if (!/^\d+$/.test(limitRaw) || Number(limitRaw) < 1) {
    return noStore(NextResponse.json({ error: "limit must be a positive integer" }, { status: 400 }));
  }
  const limit = Math.min(Number(limitRaw), MAX_PULL_LIMIT);

  const page = await pullFrames(userId, Number(afterRaw), limit);
  return noStore(
    NextResponse.json({
      frames: page.frames.map((f) => ({
        id: f.id,
        deviceId: f.deviceId,
        opId: f.opId,
        seq: f.seq,
        frame: Buffer.from(f.frame).toString("base64"),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    }),
  );
}
