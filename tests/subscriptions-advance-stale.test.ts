import { describe, it, expect, vi } from "vitest";
import { advanceStaleSubscriptionDates } from "@/lib/subscriptions/advance-next-dates";

type Row = {
  id: number; next_date: string; frequency: string; end_date: string | null;
  remaining_count: number | null; postable: boolean;
};

/** Executor fake: first call = the SELECT (returns rows), later calls = UPDATEs (recorded). */
function fakeDb(rows: Row[]) {
  const updates: string[] = [];
  const execute = vi.fn(async (q: unknown) => {
    const text = JSON.stringify(q);
    if (text.includes("UPDATE")) {
      updates.push(text);
      return [];
    }
    return rows;
  });
  return { db: { execute } as never, updates, execute };
}
const base: Row = { id: 1, next_date: "2026-03-10", frequency: "monthly", end_date: null, remaining_count: null, postable: false };
const TODAY = "2026-06-15";

describe("advanceStaleSubscriptionDates", () => {
  it("non-postable: rolls next_date to the next occurrence on/after today", async () => {
    const { db, updates } = fakeDb([base]);
    expect(await advanceStaleSubscriptionDates(db, "u1", TODAY)).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("2026-07-10");
    expect(updates[0]).not.toContain("'ended'");
  });

  it("postable: never rolls past unposted due occurrences", async () => {
    const { db, updates } = fakeDb([{ ...base, postable: true }]);
    expect(await advanceStaleSubscriptionDates(db, "u1", TODAY)).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("postable but exhausted (next_date past end_date / count 0): marked ended, next_date untouched", async () => {
    for (const patch of [{ end_date: "2026-03-01" }, { remaining_count: 0 }]) {
      const { db, updates } = fakeDb([{ ...base, postable: true, ...patch }]);
      expect(await advanceStaleSubscriptionDates(db, "u1", TODAY)).toBe(1);
      expect(updates[0]).toContain("ended");
      expect(updates[0]).not.toContain("SET next_date");
    }
  });

  it("non-postable: ends instead of rolling when end_date / count run out", async () => {
    for (const patch of [{ end_date: "2026-05-01" }, { remaining_count: 3 }]) {
      const { db, updates } = fakeDb([{ ...base, ...patch }]);
      expect(await advanceStaleSubscriptionDates(db, "u1", TODAY)).toBe(1);
      expect(updates[0]).toContain("ended");
    }
  });

  it("non-postable with count left: rolls and decrements remaining_count", async () => {
    const { db, updates } = fakeDb([{ ...base, remaining_count: 9 }]);
    await advanceStaleSubscriptionDates(db, "u1", TODAY);
    expect(updates[0]).toContain("2026-07-10");
    expect(updates[0]).toContain("5"); // 9 - 4 skipped
  });

  it("malformed dates are left alone", async () => {
    const { db, updates } = fakeDb([{ ...base, next_date: "soon" }]);
    expect(await advanceStaleSubscriptionDates(db, "u1", TODAY)).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("the SELECT only targets active rows and computes postable from linked transactions", async () => {
    const { db, execute } = fakeDb([]);
    await advanceStaleSubscriptionDates(db, "u1", TODAY);
    const text = JSON.stringify(execute.mock.calls[0][0]);
    expect(text).toContain("s.status = 'active'");
    expect(text).toContain("t.subscription_id = s.id");
  });
});
