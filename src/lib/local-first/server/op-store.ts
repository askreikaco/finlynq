/**
 * Server-side ciphertext-only op-log (local-first L1). The server stores each
 * encrypted frame as an opaque blob and NEVER decrypts it. Only the plaintext
 * header (deviceId, opId, seq) is parsed, to fill index columns.
 * All reads and writes are scoped by userId.
 */
import { and, asc, eq, gt, max } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseFrameHeader } from "@/lib/local-first/oplog/frame";

export const MAX_PULL_LIMIT = 500;
export const MAX_APPEND_FRAMES = 500;

export interface AppendResult {
  accepted: number;
  duplicate: number;
  /** Highest cursor (lf_op_frame.id) for this user after the append. 0 when the user has no frames. */
  lastCursor: number;
}

export interface PulledFrame {
  id: number;
  deviceId: string;
  opId: string;
  seq: number;
  frame: Uint8Array;
}

export interface PullResult {
  frames: PulledFrame[];
  /** Pass as `after` on the next pull. Equals the input `afterId` when no frames were returned. */
  nextCursor: number;
  hasMore: boolean;
}

/**
 * Parse every frame first (throws MalformedFrameError / TruncatedFrameError /
 * UnsupportedVersionError before any write), then insert in one statement.
 * Idempotent: a repeated (userId, opId) is a duplicate and is not modified.
 */
export async function appendFrames(userId: string, frames: Uint8Array[]): Promise<AppendResult> {
  if (frames.length > MAX_APPEND_FRAMES) {
    throw new RangeError(`at most ${MAX_APPEND_FRAMES} frames per append`);
  }
  const rows = frames.map((f) => {
    const h = parseFrameHeader(f);
    return {
      userId,
      deviceId: h.deviceId,
      opId: h.opId,
      seq: h.seq,
      frame: Buffer.from(f.buffer, f.byteOffset, f.byteLength),
    };
  });

  let accepted = 0;
  if (rows.length > 0) {
    const inserted = await db
      .insert(schema.lfOpFrame)
      .values(rows)
      .onConflictDoNothing({ target: [schema.lfOpFrame.userId, schema.lfOpFrame.opId] })
      .returning({ id: schema.lfOpFrame.id });
    accepted = inserted.length;
  }

  const [last] = await db
    .select({ id: max(schema.lfOpFrame.id) })
    .from(schema.lfOpFrame)
    .where(eq(schema.lfOpFrame.userId, userId));
  return {
    accepted,
    duplicate: rows.length - accepted,
    lastCursor: Number(last?.id ?? 0),
  };
}

/** Frames for one user with id > afterId, ascending. limit is clamped to 1..MAX_PULL_LIMIT. */
export async function pullFrames(userId: string, afterId: number, limit: number): Promise<PullResult> {
  const take = Math.min(Math.max(1, Math.floor(limit)), MAX_PULL_LIMIT);
  const rows = await db
    .select({
      id: schema.lfOpFrame.id,
      deviceId: schema.lfOpFrame.deviceId,
      opId: schema.lfOpFrame.opId,
      seq: schema.lfOpFrame.seq,
      frame: schema.lfOpFrame.frame,
    })
    .from(schema.lfOpFrame)
    .where(and(eq(schema.lfOpFrame.userId, userId), gt(schema.lfOpFrame.id, afterId)))
    .orderBy(asc(schema.lfOpFrame.id))
    .limit(take + 1);

  const hasMore = rows.length > take;
  const page = rows.slice(0, take).map((r) => ({
    id: Number(r.id),
    deviceId: r.deviceId,
    opId: r.opId,
    seq: r.seq,
    frame: new Uint8Array(r.frame),
  }));
  const nextCursor = page.length > 0 ? page[page.length - 1].id : afterId;
  return { frames: page, nextCursor, hasMore };
}
