/**
 * Request idempotency for non-transaction POSTs (local-first L3, offline write queue). Table: request_idempotency.
 *
 * withIdempotency(req, userId, entity, handler):
 *   - no Idempotency-Key header: runs the handler exactly as before (no table access).
 *   - invalid key: 400.
 *   - first request for (user, key): claims the row (INSERT ... ON CONFLICT DO NOTHING; the primary key is the lock),
 *     runs the handler, stores status + JSON body. Only a response below 500 is stored; a 5xx or a thrown error releases
 *     the claim so a retry runs again.
 *   - same key, finished: replays the stored status + body (header Idempotent-Replayed: true), handler not run.
 *   - same key, still running (concurrent retry): waits on the row (about 6 s), then replays; 409 if it never finishes.
 *   - same key, different entity: 422.
 * Keys are per user and expire after 72 h. A claim older than 60 s with no result is treated as abandoned.
 */
import { NextResponse } from "next/server";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const IDEMPOTENCY_TTL_MS = 72 * 60 * 60 * 1000;
const STALE_CLAIM_MS = 60_000;
const IN_PROGRESS = 0;
const WAIT_STEP_MS = 150;
const WAIT_STEPS = 40;
/** UUIDs and similar opaque keys. Anything else is refused rather than silently run without protection. */
const KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;

const t = schema.requestIdempotency;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function expireOne(userId: string, key: string): Promise<void> {
  const now = Date.now();
  await db.delete(t).where(
    and(
      eq(t.userId, userId),
      eq(t.idempotencyKey, key),
      or(
        lt(t.createdAt, new Date(now - IDEMPOTENCY_TTL_MS)),
        and(eq(t.responseStatus, IN_PROGRESS), lt(t.createdAt, new Date(now - STALE_CLAIM_MS))),
      ),
    ),
  );
}

async function claim(userId: string, key: string, entity: string): Promise<boolean> {
  const rows = await db
    .insert(t)
    .values({ userId, idempotencyKey: key, entity, responseStatus: IN_PROGRESS, responseBody: sql`'null'::jsonb` })
    .onConflictDoNothing()
    .returning({ key: t.idempotencyKey });
  return rows.length === 1;
}

async function readRow(userId: string, key: string) {
  const rows = await db
    .select({ entity: t.entity, responseStatus: t.responseStatus, responseBody: t.responseBody })
    .from(t)
    .where(and(eq(t.userId, userId), eq(t.idempotencyKey, key)))
    .limit(1);
  return rows[0] ?? null;
}

async function release(userId: string, key: string): Promise<void> {
  await db.delete(t).where(and(eq(t.userId, userId), eq(t.idempotencyKey, key), eq(t.responseStatus, IN_PROGRESS)));
}

function replay(row: { responseStatus: number; responseBody: unknown }): Response {
  return NextResponse.json(row.responseBody, { status: row.responseStatus, headers: { "Idempotent-Replayed": "true" } });
}

export async function withIdempotency(req: Request, userId: string, entity: string, handler: () => Promise<Response>): Promise<Response> {
  const key = req.headers.get("Idempotency-Key");
  if (key === null) return handler();
  if (!KEY_RE.test(key)) return NextResponse.json({ error: "Invalid Idempotency-Key header" }, { status: 400 });

  await expireOne(userId, key);
  for (let i = 0; i < WAIT_STEPS; i++) {
    if (await claim(userId, key, entity)) return runClaimed(userId, key, handler);
    const row = await readRow(userId, key);
    if (row) {
      if (row.entity !== entity) return NextResponse.json({ error: "Idempotency-Key was used for another request" }, { status: 422 });
      if (row.responseStatus !== IN_PROGRESS) return replay(row);
    }
    await sleep(WAIT_STEP_MS);
  }
  return NextResponse.json({ error: "A request with this Idempotency-Key is still in progress" }, { status: 409 });
}

async function runClaimed(userId: string, key: string, handler: () => Promise<Response>): Promise<Response> {
  let res: Response;
  try {
    res = await handler();
  } catch (err) {
    await release(userId, key);
    throw err;
  }
  if (res.status >= 500) {
    await release(userId, key);
    return res;
  }
  let parsed: unknown;
  try {
    parsed = await res.clone().json();
  } catch {
    // Not JSON: cannot be replayed exactly, so do not store it (the claim is released).
    await release(userId, key);
    return res;
  }
  await db
    .update(t)
    .set({ responseStatus: res.status, responseBody: sql`${JSON.stringify(parsed)}::jsonb` })
    .where(and(eq(t.userId, userId), eq(t.idempotencyKey, key)));
  return res;
}

/** Daily sweep (wired in src/lib/cron/sweep-mcp-idempotency.ts): deletes expired rows and abandoned claims. */
export async function sweepRequestIdempotency(): Promise<{ deleted: number }> {
  const now = Date.now();
  const deleted = await db
    .delete(t)
    .where(or(lt(t.createdAt, new Date(now - IDEMPOTENCY_TTL_MS)), and(eq(t.responseStatus, IN_PROGRESS), lt(t.createdAt, new Date(now - STALE_CLAIM_MS)))))
    .returning({ key: t.idempotencyKey });
  return { deleted: deleted.length };
}
