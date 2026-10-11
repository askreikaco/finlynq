import { describe, it, expect } from "vitest";
import { transferEnds, peersFromLoaded } from "@/lib/transactions/transfer-ends";

const out = { id: 1, accountId: 10, accountName: "Cash", amount: -500, linkId: "L1" };
const inn = { id: 2, accountId: 20, accountName: "Savings", amount: 500, linkId: "L1" };

describe("transferEnds", () => {
  it("the leg that lost money is From, the other is To (from either leg)", () => {
    expect(transferEnds(out, { accountId: 20, accountName: "Savings" })).toEqual({ from: "Cash", to: "Savings" });
    expect(transferEnds(inn, { accountId: 10, accountName: "Cash" })).toEqual({ from: "Cash", to: "Savings" });
  });
  it("is null without a link, a peer, or when both legs are on one account", () => {
    expect(transferEnds({ ...out, linkId: null }, { accountId: 20, accountName: "Savings" })).toBeNull();
    expect(transferEnds(out, null)).toBeNull();
    expect(transferEnds(out, { accountId: 10, accountName: "Cash" })).toBeNull();
  });
});

describe("peersFromLoaded", () => {
  it("pairs exactly-two-leg links on different accounts", () => {
    const m = peersFromLoaded([out, inn, { id: 3, accountId: 10, accountName: "Cash", amount: -5, linkId: null }]);
    expect(m.get(1)).toEqual({ accountId: 20, accountName: "Savings" });
    expect(m.get(2)).toEqual({ accountId: 10, accountName: "Cash" });
    expect(m.has(3)).toBe(false);
  });
  it("skips lone legs, 3+ legs and same-account pairs", () => {
    expect(peersFromLoaded([out]).size).toBe(0);
    expect(peersFromLoaded([out, inn, { ...inn, id: 9 }]).size).toBe(0);
    expect(peersFromLoaded([out, { ...inn, accountId: 10 }]).size).toBe(0);
  });
});
