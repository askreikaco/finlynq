// @vitest-environment node
// withIdempotency against real Postgres (local-first L3). Skipped unless DATABASE_URL names a *_test database.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray, and, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { db, schema, setAdapter, setDialect, PostgresAdapter } from "@/db";
import { withIdempotency } from "@/lib/idempotency";

const HAS_DB = /\/[^/]*_test([?#]|$)/.test(process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL ?? "");
const TAG = randomUUID().slice(0, 8);
const U1 = `idem-${TAG}-u1`;
const U2 = `idem-${TAG}-u2`;

// The budget route under test: auth and ownership are not the subject here.
vi.mock("@/lib/auth/require-auth", () => ({
  requireAuth: vi.fn(async (req: { headers: Headers }) => ({
    authenticated: true,
    context: { userId: req.headers.get("x-test-user") ?? "none", method: "passphrase", mfaVerified: false, dek: Buffer.alloc(32, 1), sessionId: "s" },
  })),
}));
vi.mock("@/lib/verify-ownership", () => ({
  verifyOwnership: vi.fn(async () => undefined),
  OwnershipError: class OwnershipError extends Error {},
}));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const req = (key?: string, user = U1, entity = "budget") => new Request("http://x/api/test", { method: "POST", headers: { ...(key ? { "Idempotency-Key": key } : {}), "x-test-user": user, "x-entity": entity } });

async function rowsFor(user: string) {
  return db.select().from(schema.requestIdempotency).where(eq(schema.requestIdempotency.userId, user));
}

beforeAll(async () => {
  if (!HAS_DB) return;
  const adapter = new PostgresAdapter();
  await adapter.initialize({
    dialect: "postgres",
    postgres: { connectionString: (process.env.DATABASE_URL ?? process.env.PF_DATABASE_URL)!, userId: "" },
  });
  setAdapter(adapter);
  setDialect("postgres");
});

afterAll(async () => {
  if (!HAS_DB) return;
  await db.delete(schema.requestIdempotency).where(inArray(schema.requestIdempotency.userId, [U1, U2]));
});

describe.skipIf(!HAS_DB)("withIdempotency (real Postgres)", () => {
  it("no Idempotency-Key header: the handler runs every time and nothing is stored", async () => {
    let calls = 0;
    const h = async () => (calls++, json(201, { id: calls }));
    await withIdempotency(req(undefined, U2), U2, "budget", h);
    await withIdempotency(req(undefined, U2), U2, "budget", h);
    expect(calls).toBe(2);
    expect(await rowsFor(U2)).toEqual([]);
  });

  it("an invalid key is refused with 400 and the handler does not run", async () => {
    let calls = 0;
    const res = await withIdempotency(req("bad key!"), U1, "budget", async () => (calls++, json(201, {})));
    expect(res.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("first request runs and stores; a retry with the same key replays the identical response", async () => {
    const key = randomUUID();
    let calls = 0;
    const h = async () => (calls++, json(201, { id: 77, amount: 12.5 }));
    const first = await withIdempotency(req(key), U1, "budget", h);
    expect(first.status).toBe(201);
    const second = await withIdempotency(req(key), U1, "budget", h);
    expect(calls).toBe(1);
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await second.json()).toEqual({ id: 77, amount: 12.5 });
    const stored = await rowsFor(U1);
    expect(stored.filter((r) => r.idempotencyKey === key)).toHaveLength(1);
  });

  it("concurrent identical requests: the handler runs once, both get the same response", async () => {
    const key = randomUUID();
    let calls = 0;
    const h = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 400));
      return json(201, { id: 900 + calls });
    };
    const [a, b] = await Promise.all([withIdempotency(req(key), U1, "budget", h), withIdempotency(req(key), U1, "budget", h)]);
    expect(calls).toBe(1);
    expect(await a.json()).toEqual({ id: 901 });
    expect(await b.json()).toEqual({ id: 901 });
  });

  it("a 5xx result is not stored: the retry runs the handler again", async () => {
    const key = randomUUID();
    let calls = 0;
    const h = async () => (calls++ === 0 ? json(500, { error: "boom" }) : json(201, { ok: true }));
    expect((await withIdempotency(req(key), U1, "budget", h)).status).toBe(500);
    expect((await withIdempotency(req(key), U1, "budget", h)).status).toBe(201);
    expect(calls).toBe(2);
  });

  it("a thrown handler releases the claim: the retry runs again", async () => {
    const key = randomUUID();
    let calls = 0;
    const h = async () => {
      if (calls++ === 0) throw new Error("db down");
      return json(201, { ok: 1 });
    };
    await expect(withIdempotency(req(key), U1, "budget", h)).rejects.toThrow("db down");
    expect((await withIdempotency(req(key), U1, "budget", h)).status).toBe(201);
    expect(calls).toBe(2);
  });

  it("the same key used for another entity is refused with 422", async () => {
    const key = randomUUID();
    await withIdempotency(req(key), U1, "budget", async () => json(201, { id: 1 }));
    const res = await withIdempotency(req(key), U1, "goal", async () => json(201, { id: 2 }));
    expect(res.status).toBe(422);
  });

  it("keys are per user: the same key from another user runs its own handler", async () => {
    const key = randomUUID();
    let calls = 0;
    await withIdempotency(req(key), U1, "budget", async () => (calls++, json(201, { u: 1 })));
    const res = await withIdempotency(req(key, U2), U2, "budget", async () => (calls++, json(201, { u: 2 })));
    expect(calls).toBe(2);
    expect(await res.json()).toEqual({ u: 2 });
  });

  it("an expired row (older than 72 h) is not replayed", async () => {
    const key = randomUUID();
    await db.insert(schema.requestIdempotency).values({
      userId: U1, idempotencyKey: key, entity: "budget", responseStatus: 201, responseBody: sql`'{"old":true}'::jsonb`,
      createdAt: new Date(Date.now() - 73 * 60 * 60 * 1000),
    });
    let calls = 0;
    const res = await withIdempotency(req(key), U1, "budget", async () => (calls++, json(201, { fresh: true })));
    expect(calls).toBe(1);
    expect(await res.json()).toEqual({ fresh: true });
  });
});

describe.skipIf(!HAS_DB)("POST /api/budgets with an Idempotency-Key (real Postgres)", () => {
  it("two identical POSTs with one key create one budget row; the second replays", async () => {
    const { POST } = await import("@/app/api/budgets/route");
    const user = `${U1}-budget`;
    const [cat] = await db.insert(schema.categories).values({ userId: user, type: "E", group: "Living", nameLookup: `food-${TAG}` }).returning({ id: schema.categories.id });
    const key = randomUUID();
    const body = JSON.stringify({ categoryId: cat.id, month: "2026-10", amount: 300, currency: "CAD" });
    const mk = () =>
      new NextRequest("http://x/api/budgets", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key, "x-test-user": user }, body });
    const a = await POST(mk());
    const b = await POST(mk());
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await b.json()).toEqual(await a.json());
    const rows = await db.select().from(schema.budgets).where(and(eq(schema.budgets.userId, user), eq(schema.budgets.categoryId, cat.id)));
    expect(rows).toHaveLength(1);
    await db.delete(schema.budgets).where(eq(schema.budgets.userId, user));
    await db.delete(schema.categories).where(eq(schema.categories.userId, user));
    await db.delete(schema.requestIdempotency).where(eq(schema.requestIdempotency.userId, user));
  });
});
