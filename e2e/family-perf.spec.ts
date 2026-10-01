/**
 * Family Wealth N-member overview latency (plan P6 / risk 11).
 * 1 viewer, 5 owners sharing ALL sections, each owner with 50 accounts / 5 goals / 3 loans.
 * Budget: GET /api/family/overview p95 < 1.5 s locally. Numbers are printed and attached.
 *
 * Note: runs against `next dev` (unminified, no output cache): production latency is lower.
 */
import { test, expect } from "@playwright/test";
import { FAMILY_SECTIONS_V1 as FAMILY_SECTIONS } from "../src/lib/family/sections";
import { TestUser, capturedMails, eventually, inviteTokenFrom, sharedMembers, waitForMail, withDb, type Member } from "./family-helpers";

const OWNERS = 5;
const ACCOUNTS = 50;
const GOALS = 5;
const LOANS = 3;
const SAMPLES = 25;
const BUDGET_P95_MS = 1500;

async function pool<T>(n: number, items: T[], fn: (t: T) => Promise<unknown>) {
  const q = [...items];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (let t = q.shift(); t !== undefined; t = q.shift()) await fn(t);
    }),
  );
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

test("overview latency with 5 owners x (50 accounts, 5 goals, 3 loans)", async () => {
  test.setTimeout(900_000);
  const viewer = await TestUser.register("perfv");
  const owners = await Promise.all(Array.from({ length: OWNERS }, (_, i) => TestUser.register(`perfo${i}`)));
  await viewer.enableTotp();

  // Seed every owner through the public API (real encryption, real label registry).
  await pool(OWNERS, owners, async (o) => {
    const cat = await o.createCategory(`Cat ${o.username}`);
    const ids: number[] = [];
    await pool(8, Array.from({ length: ACCOUNTS }, (_, i) => i), async (i) => {
      ids[i] = await o.createAccount(`${o.username} account ${i}`, { group: i % 2 ? "Banking" : "Savings" });
    });
    await pool(8, ids, (id) => o.addTransaction(id, cat, 100 + (id % 17) * 10));
    for (let g = 0; g < GOALS; g++) {
      await o.json(await o.post("/api/goals", { name: `${o.username} goal ${g}`, type: "savings", targetAmount: 5000 + g, currency: "USD" }), 201);
    }
    for (let l = 0; l < LOANS; l++) {
      await o.json(
        await o.post("/api/loans", {
          name: `${o.username} loan ${l}`,
          type: "auto",
          principal: 9000 + l,
          annualRate: 4.5,
          termMonths: 36,
          startDate: "2025-06-01",
          currency: "USD",
        }),
        201,
      );
    }
  });

  // Share everything with the viewer. The invite limiter is 3/day/address, so the viewer's address is
  // re-pointed (direct SQL on the *_test DB) before each owner invites it; accept checks the session's
  // current verified address.
  for (const [i, o] of owners.entries()) {
    const email = `perf-view-${i}-${viewer.username}@fam6.test`;
    await withDb((c) => c.query("UPDATE users SET email=$1 WHERE id=$2", [email, viewer.id]));
    const before = capturedMails().length;
    await o.json(await o.post("/api/family/manage/invite", { viewerEmail: email, sections: [...FAMILY_SECTIONS] }), 201);
    const token = await waitForMail(email, inviteTokenFrom, { after: before });
    await viewer.json(await viewer.post("/api/family/manage/accept", { token }));
  }
  // Owners' next presence finalizes the grants (login sweep builds the label sidecars).
  await Promise.all(owners.map((o) => o.login()));
  const warm = await eventually(async () => {
    const body = await viewer.json<{ members: Member[] }>(await viewer.overview());
    const shared = sharedMembers(body);
    return shared.length === OWNERS && shared.every((m) => !m.genericLabels && Object.keys(m.sections).length === FAMILY_SECTIONS.length)
      ? body
      : false;
  }, "all owners finalized with real labels", 120_000);
  for (const m of sharedMembers(warm)) {
    expect(m.sections.accounts.accounts).toHaveLength(ACCOUNTS);
    expect(m.sections.goals.goals).toHaveLength(GOALS);
    expect(m.sections.loans.loans).toHaveLength(LOANS);
    expect(m.unavailable).toEqual([]);
  }

  // Overview is rate limited to 30/min per viewer: start a fresh window, then 1 cold + 2 warm-up + SAMPLES.
  await new Promise((r) => setTimeout(r, 61_000));
  const timed = async () => {
    const t0 = performance.now();
    const res = await viewer.overview();
    const body = await res.body();
    const ms = performance.now() - t0;
    expect(res.status()).toBe(200);
    return { ms, bytes: body.length };
  };
  const first = await timed();
  await timed();
  await timed();
  const samples: number[] = [];
  let bytes = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const r = await timed();
    samples.push(r.ms);
    bytes = r.bytes;
  }
  const stats = {
    members: OWNERS + 1,
    accountsPerOwner: ACCOUNTS,
    samples: SAMPLES,
    firstMs: Math.round(first.ms),
    p50Ms: Math.round(pct(samples, 50)),
    p95Ms: Math.round(pct(samples, 95)),
    maxMs: Math.round(Math.max(...samples)),
    responseKB: Math.round(bytes / 1024),
  };
  console.log("PERF " + JSON.stringify(stats));
  await test.info().attach("perf.json", { body: JSON.stringify(stats, null, 2), contentType: "application/json" });
  expect(pct(samples, 95)).toBeLessThan(BUDGET_P95_MS);

  await Promise.all([viewer, ...owners].map((u) => u.dispose()));
});
