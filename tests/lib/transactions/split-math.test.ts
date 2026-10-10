import { describe, it, expect } from "vitest";
import {
  parseCount,
  ensureRows,
  visibleRows,
  computeRemainder,
  resolveCategories,
  toAccountCurrencySplits,
  rowsFromSavedSplits,
  toMinor,
  fromMinor,
  minorToText,
  parseAmountMinor,
  type SplitRowModel,
} from "@/lib/transactions/split-math";

const row = (id: string, amount: string, categoryId = ""): SplitRowModel => ({
  id,
  categoryId,
  amount,
  note: "",
});

describe("parseCount", () => {
  it.each([
    ["", { n: 0, capped: false, hint: null }],
    ["0", { n: 0, capped: false, hint: null }],
    ["1", { n: 0, capped: false, hint: "enter-two-or-more" }],
    ["2", { n: 2, capped: false, hint: null }],
    ["20", { n: 20, capped: false, hint: null }],
    ["21", { n: 20, capped: true, hint: "up-to-20" }],
    ["abc", { n: 0, capped: false, hint: null }],
    [" 3 ", { n: 3, capped: false, hint: null }],
    ["3.5", { n: 0, capped: false, hint: null }],
    ["-2", { n: 0, capped: false, hint: null }],
    ["99999", { n: 20, capped: true, hint: "up-to-20" }],
  ])("parses %j", (raw, expected) => {
    expect(parseCount(raw)).toEqual(expected);
  });
});

describe("ensureRows", () => {
  let seq = 0;
  const newId = () => `new-${++seq}`;

  it("grows from empty to n rows with fresh ids", () => {
    seq = 0;
    const rows = ensureRows<SplitRowModel>([], 3, newId);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(["new-1", "new-2", "new-3"]);
    expect(rows.every((r) => r.categoryId === "" && r.amount === "" && r.note === "")).toBe(true);
  });

  it("keeps existing rows and only appends the missing ones", () => {
    seq = 0;
    const rows = ensureRows([row("a", "10"), row("b", "20")], 4, newId);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "new-1", "new-2"]);
    expect(rows[0].amount).toBe("10");
    expect(rows[1].amount).toBe("20");
  });

  it("keeps hidden tail rows with their data when n decreases", () => {
    seq = 0;
    const full = [row("a", "10"), row("b", "20"), row("c", "30", "7"), row("d", "40")];
    const shrunk = ensureRows(full, 2, newId);
    expect(shrunk).toHaveLength(4);
    expect(shrunk).toEqual(full);
    expect(visibleRows(shrunk, 2).map((r) => r.id)).toEqual(["a", "b"]);
    expect(seq).toBe(0);
  });

  it("restores hidden rows with their data when n increases again", () => {
    seq = 0;
    const full = [row("a", "10"), row("b", "20"), row("c", "30", "7"), row("d", "40")];
    const shrunk = ensureRows(full, 2, newId);
    const restored = ensureRows(shrunk, 4, newId);
    expect(restored).toEqual(full);
    expect(visibleRows(restored, 4)[2]).toEqual(row("c", "30", "7"));
    expect(seq).toBe(0);
  });

  it("does not change rows for n below 2", () => {
    const rows = [row("a", "10"), row("b", "20")];
    expect(ensureRows(rows, 0, newId)).toEqual(rows);
    expect(ensureRows(rows, 1, newId)).toEqual(rows);
  });

  it("caps growth at 20 rows", () => {
    seq = 0;
    expect(ensureRows([], 25, newId)).toHaveLength(20);
  });
});

describe("visibleRows", () => {
  const rows = [row("a", "1"), row("b", "2"), row("c", "3")];
  it("is empty for no split (0 or 1)", () => {
    expect(visibleRows(rows, 0)).toEqual([]);
    expect(visibleRows(rows, 1)).toEqual([]);
  });
  it("returns the first n rows", () => {
    expect(visibleRows(rows, 2).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("never returns more rows than exist", () => {
    expect(visibleRows(rows, 5)).toHaveLength(3);
  });
});

describe("minor-unit helpers", () => {
  it("converts with currency decimals", () => {
    expect(toMinor(0.3, "USD")).toBe(30);
    expect(toMinor(1234, "VND")).toBe(1234);
    expect(toMinor(1234.4, "JPY")).toBe(1234);
    expect(fromMinor(30, "USD")).toBe(0.3);
    expect(minorToText(2000, "USD")).toBe("20.00");
    expect(minorToText(2000, "VND")).toBe("2000");
  });
  it("parses typed text, rounding to currency decimals", () => {
    expect(parseAmountMinor("", "USD")).toBeNull();
    expect(parseAmountMinor("abc", "USD")).toBeNull();
    expect(parseAmountMinor(" 12.5 ", "USD")).toBe(1250);
    expect(parseAmountMinor("333.33", "VND")).toBe(333);
    expect(parseAmountMinor("-7", "USD")).toBe(-700);
  });
});

describe("computeRemainder", () => {
  it("USD: last row is parent minus the other visible rows", () => {
    const r = computeRemainder([row("a", "20"), row("b", "15"), row("c", "")], 50, "USD");
    expect(r).toEqual({ minor: 1500, amount: 15, text: "15.00", flag: "ok" });
  });

  it("USD: 0.1 + 0.2 style inputs stay exact", () => {
    const r = computeRemainder([row("a", "0.1"), row("b", "")], 0.3, "USD");
    expect(r.minor).toBe(20);
    expect(r.text).toBe("0.20");
    expect(r.flag).toBe("ok");
  });

  it("USD: three rows 0.1 + 0.2 + remainder is exactly zero, not a float residue", () => {
    const r = computeRemainder([row("a", "0.1"), row("b", "0.2"), row("c", "")], 0.3, "USD");
    expect(r.minor).toBe(0);
    expect(r.flag).toBe("zero");
  });

  it("VND: integer minor units, typed decimals round to 0dp", () => {
    const r = computeRemainder([row("a", "333333"), row("b", "")], 1000000, "VND");
    expect(r).toEqual({ minor: 666667, amount: 666667, text: "666667", flag: "ok" });
    const rounded = computeRemainder([row("a", "333.33"), row("b", "")], 1000, "VND");
    expect(rounded.minor).toBe(667);
  });

  it("JPY: 0dp remainder", () => {
    const r = computeRemainder([row("a", "1234"), row("b", "")], 5000, "JPY");
    expect(r.amount).toBe(3766);
    expect(r.text).toBe("3766");
    expect(r.flag).toBe("ok");
  });

  it("flags a negative remainder when the other rows exceed the total", () => {
    const r = computeRemainder([row("a", "60"), row("b", "50"), row("c", "")], 100, "USD");
    expect(r.minor).toBe(-1000);
    expect(r.text).toBe("-10.00");
    expect(r.flag).toBe("negative");
  });

  it("flags a zero remainder", () => {
    const r = computeRemainder([row("a", "60"), row("b", "40"), row("c", "")], 100, "USD");
    expect(r.minor).toBe(0);
    expect(r.flag).toBe("zero");
  });

  it("counts empty and non-numeric editable amounts as 0", () => {
    expect(computeRemainder([row("a", ""), row("b", "x"), row("c", "")], 100, "USD").minor).toBe(10000);
  });

  it("ignores the last visible row's own typed amount", () => {
    const r = computeRemainder([row("a", "10"), row("b", ""), row("c", "999")], 100, "USD");
    expect(r.minor).toBe(9000);
  });

  it("uses the absolute parent amount (expense totals are negative)", () => {
    const r = computeRemainder([row("a", "30"), row("b", "")], -50, "USD");
    expect(r.amount).toBe(20);
  });
});

describe("resolveCategories (inheritance)", () => {
  it("row 0 inherits the parent category", () => {
    expect(resolveCategories([row("a", "1", "")], "3")).toEqual([{ id: "3", inherited: true }]);
  });

  it("chains inheritance through empty rows", () => {
    const visible = [row("a", "1", ""), row("b", "1", ""), row("c", "1", "7"), row("d", "1", "")];
    expect(resolveCategories(visible, "3")).toEqual([
      { id: "3", inherited: true },
      { id: "3", inherited: true },
      { id: "7", inherited: false },
      { id: "7", inherited: true },
    ]);
  });

  it("an explicit pick applies to that row and the rows below that inherit", () => {
    const visible = [row("a", "1", "5"), row("b", "1", ""), row("c", "1", "")];
    expect(resolveCategories(visible, "3").map((r) => r.id)).toEqual(["5", "5", "5"]);
  });

  it("unresolvable when no parent category and no explicit pick", () => {
    expect(resolveCategories([row("a", "1"), row("b", "1")], "")).toEqual([
      { id: "", inherited: false },
      { id: "", inherited: false },
    ]);
  });

  it("a later explicit pick resolves rows after an unresolvable start", () => {
    expect(resolveCategories([row("a", "1"), row("b", "1", "9")], "")).toEqual([
      { id: "", inherited: false },
      { id: "9", inherited: false },
    ]);
  });
});

describe("toAccountCurrencySplits", () => {
  const sumMinor = (values: number[], ccy: string) =>
    values.reduce((s, v) => s + toMinor(v, ccy), 0);

  it("last leg makes the account-currency sum equal the converted total (VND -> USD)", () => {
    const legs = toAccountCurrencySplits([333333, 333333, 333334], {
      amount: 40,
      enteredAmount: 1000000,
      currency: "USD",
    });
    expect(legs).toEqual([13.33, 13.33, 13.34]);
    expect(sumMinor(legs, "USD")).toBe(toMinor(40, "USD"));
  });

  it("rounds non-last legs and keeps the last leg exact (EUR -> account ratio 1.1)", () => {
    const legs = toAccountCurrencySplits([3.33, 3.33, 3.34], {
      amount: 11,
      enteredAmount: 10,
      currency: "USD",
    });
    expect(legs).toEqual([3.66, 3.66, 3.68]);
    expect(sumMinor(legs, "USD")).toBe(1100);
  });

  it("ratio 1 returns the entered amounts unchanged", () => {
    expect(
      toAccountCurrencySplits([10, 20], { amount: 30, enteredAmount: 30, currency: "USD" }),
    ).toEqual([10, 20]);
  });

  it("empty input returns empty output", () => {
    expect(toAccountCurrencySplits([], { amount: 1, enteredAmount: 1, currency: "USD" })).toEqual([]);
  });

  it("throws for a zero entered total instead of dividing by zero", () => {
    expect(() =>
      toAccountCurrencySplits([1, 2], { amount: 3, enteredAmount: 0, currency: "USD" }),
    ).toThrow(RangeError);
  });
});

describe("rowsFromSavedSplits", () => {
  it("takes absolute amounts and keeps the sum when it already matches", () => {
    const result = rowsFromSavedSplits(
      [
        { amount: -30, categoryId: 1 },
        { amount: -20, categoryId: 2 },
      ],
      50,
      "USD",
    );
    expect(result.rows).toEqual([
      { amount: "30.00", categoryId: 1 },
      { amount: "20.00", categoryId: 2 },
    ]);
    expect(result.adjusted).toBe(false);
    expect(result.adjustment).toBeNull();
  });

  it("adjusts the last row to the remainder and returns a notice", () => {
    const result = rowsFromSavedSplits(
      [
        { amount: -30, categoryId: 1 },
        { amount: -15, categoryId: 2 },
      ],
      50,
      "USD",
    );
    expect(result.rows.map((r) => r.amount)).toEqual(["30.00", "20.00"]);
    expect(result.rows[1].categoryId).toBe(2);
    expect(result.adjusted).toBe(true);
    expect(result.adjustment).toEqual({ index: 1, from: 15, to: 20 });
  });

  it("a single saved row is set to the full total", () => {
    const result = rowsFromSavedSplits([{ amount: -40 }], 50, "USD");
    expect(result.rows).toEqual([{ amount: "50.00" }]);
    expect(result.adjustment).toEqual({ index: 0, from: 40, to: 50 });
  });

  it("VND has 0 decimals in the adjusted amount", () => {
    const result = rowsFromSavedSplits([{ amount: -100000 }, { amount: -200000 }], 350000, "VND");
    expect(result.rows.map((r) => r.amount)).toEqual(["100000", "250000"]);
    expect(result.adjustment).toEqual({ index: 1, from: 200000, to: 250000 });
  });

  it("USD 0.1 + 0.1 against 0.3 adjusts to exactly 0.20", () => {
    const result = rowsFromSavedSplits([{ amount: -0.1 }, { amount: -0.1 }], 0.3, "USD");
    expect(result.rows.map((r) => r.amount)).toEqual(["0.10", "0.20"]);
    expect(result.adjusted).toBe(true);
  });

  it("empty input gives no rows and no notice", () => {
    expect(rowsFromSavedSplits([], 50, "USD")).toEqual({ rows: [], adjusted: false, adjustment: null });
  });
});

describe("visibleRows is the only input to validation", () => {
  it("hidden tail rows do not affect the remainder or the categories", () => {
    const rows = [
      row("a", "10", "1"),
      row("b", "", ""),
      row("c", "9999", "8"),
      row("d", "9999", "9"),
    ];
    const visible = visibleRows(rows, 2);
    expect(computeRemainder(visible, 100, "USD").minor).toBe(9000);
    expect(resolveCategories(visible, "3").map((r) => r.id)).toEqual(["1", "1"]);
    // Same answer when the hidden rows are cleared, proving they are not read.
    const cleared = [row("a", "10", "1"), row("b", ""), row("c", ""), row("d", "")];
    expect(computeRemainder(visibleRows(cleared, 2), 100, "USD")).toEqual(
      computeRemainder(visible, 100, "USD"),
    );
  });
});
