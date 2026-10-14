import { describe, it, expect } from "vitest";
import {
  canStepNext, parseRangeSelection, periodLabel, rangeToParams, resolvePeriod, stepSelection, TOOLBAR_RANGE_KEYS,
} from "@/lib/metrics/period";
import { defaultSortKey, parseSort, sortRecords, sortToParams, isDefaultSort, dirLabel } from "@/lib/toolbar/sort";
import { applyToReturnTo, buildFilterHref, countActive } from "@/lib/toolbar/filter-params";

const TODAY = "2026-10-14";

describe("range: quarter, year and the month anchor", () => {
  it("offers exactly This month, This quarter, This year, Custom, in that order", () => {
    expect([...TOOLBAR_RANGE_KEYS]).toEqual(["this_month", "this_quarter", "this_year", "custom"]);
  });
  it("resolves the quarter and the year around the anchor", () => {
    expect(resolvePeriod({ range: "this_quarter" }, TODAY)).toMatchObject({ start: "2026-10-01", end: "2026-12-31", monthAligned: true });
    expect(resolvePeriod({ range: "this_quarter", month: "2026-05" }, TODAY)).toMatchObject({ start: "2026-04-01", end: "2026-06-30" });
    expect(resolvePeriod({ range: "this_year" }, TODAY)).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
    expect(resolvePeriod({ range: "this_month", month: "2026-02" }, TODAY)).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
  });
  it("round-trips ?range=&month= and ignores a bad month", () => {
    const sel = parseRangeSelection((k) => ({ range: "this_quarter", month: "2026-05" } as Record<string, string>)[k]);
    expect(sel).toEqual({ range: "this_quarter", month: "2026-05" });
    expect(rangeToParams(sel)).toEqual({ range: "this_quarter", month: "2026-05" });
    expect(parseRangeSelection((k) => ({ month: "2026-13" } as Record<string, string>)[k])).toEqual({ range: "this_month" });
    expect(rangeToParams({ range: "this_month" })).toEqual({});
    expect(rangeToParams({ range: "this_month", month: "2026-08" })).toEqual({ month: "2026-08" });
  });
  it("old ranges (last_month, ytd ...) still parse", () => {
    expect(parseRangeSelection((k) => ({ range: "ytd" } as Record<string, string>)[k])).toEqual({ range: "ytd" });
  });
});

describe("month switcher stepping", () => {
  it("steps back by the active unit and returns to the current period without an anchor", () => {
    const back = stepSelection({ range: "this_month" }, -1, TODAY);
    expect(back).toEqual({ range: "this_month", month: "2026-09" });
    expect(periodLabel(back, TODAY)).toBe("Sep 2026");
    expect(stepSelection(back, 1, TODAY)).toEqual({ range: "this_month" });
    expect(stepSelection({ range: "this_quarter" }, -1, TODAY)).toEqual({ range: "this_quarter", month: "2026-07" });
    expect(periodLabel({ range: "this_quarter", month: "2026-07" }, TODAY)).toBe("Q3 2026");
    expect(stepSelection({ range: "this_year" }, -1, TODAY)).toEqual({ range: "this_year", month: "2025-10" });
    expect(periodLabel({ range: "this_year" }, TODAY)).toBe("2026");
  });
  it("never steps past the current period", () => {
    expect(canStepNext({ range: "this_month" }, TODAY)).toBe(false);
    expect(stepSelection({ range: "this_month" }, 1, TODAY)).toEqual({ range: "this_month" });
    expect(canStepNext({ range: "this_quarter", month: "2026-07" }, TODAY)).toBe(true);
    expect(canStepNext({ range: "this_year" }, TODAY)).toBe(false);
  });
  it("does not step a custom range", () => {
    const custom = { range: "custom", from: "2026-01-01", to: "2026-02-01" } as const;
    expect(canStepNext(custom, TODAY)).toBe(false);
    expect(stepSelection(custom, -1, TODAY)).toBe(custom);
  });
});

describe("sort model", () => {
  const dateSorts = [{ key: "date", label: "Date" }, { key: "name", label: "Name" }, { key: "amount", label: "Amount" }];
  const nameSorts = [{ key: "amount", label: "Amount" }, { key: "name", label: "Name" }];
  it("defaults to Date, or Name when the list has no date", () => {
    expect(defaultSortKey(dateSorts)).toBe("date");
    expect(defaultSortKey(nameSorts)).toBe("name");
    expect(parseSort(() => null, dateSorts)).toEqual({ sort: "date", dir: "desc" });
    expect(parseSort(() => null, nameSorts)).toEqual({ sort: "name", dir: "asc" });
  });
  it("natural directions: newest first, A-Z, biggest first; toggles flip them", () => {
    expect(parseSort((k) => ({ sort: "amount" } as Record<string, string>)[k], dateSorts)).toEqual({ sort: "amount", dir: "desc" });
    expect(parseSort((k) => ({ sort: "name", dir: "desc" } as Record<string, string>)[k], dateSorts)).toEqual({ sort: "name", dir: "desc" });
    expect(dirLabel("name", "asc")).toBe("A-Z");
    expect(dirLabel("name", "desc")).toBe("Z-A");
    expect(dirLabel("amount", "desc")).toBe("Biggest first");
  });
  it("rejects unknown sort keys and writes nothing for the default", () => {
    expect(parseSort((k) => ({ sort: "drop table" } as Record<string, string>)[k], dateSorts).sort).toBe("date");
    expect(sortToParams({ sort: "date", dir: "desc" }, dateSorts)).toEqual({});
    expect(sortToParams({ sort: "name", dir: "desc" }, dateSorts)).toEqual({ sort: "name", dir: "desc" });
    expect(isDefaultSort({ sort: "date", dir: "desc" }, dateSorts)).toBe(true);
  });
  it("sorts A-Z / Z-A, biggest first, with empty values last", () => {
    const rows = [{ n: "bravo", a: 5 }, { n: "Alpha", a: 50 }, { n: null, a: null }, { n: "charlie", a: 7 }];
    const acc = { name: (r: (typeof rows)[number]) => r.n, amount: (r: (typeof rows)[number]) => r.a };
    expect(sortRecords(rows, { sort: "name", dir: "asc" }, acc).map((r) => r.n)).toEqual(["Alpha", "bravo", "charlie", null]);
    expect(sortRecords(rows, { sort: "name", dir: "desc" }, acc).map((r) => r.n)).toEqual(["charlie", "bravo", "Alpha", null]);
    expect(sortRecords(rows, { sort: "amount", dir: "desc" }, acc).map((r) => r.a)).toEqual([50, 7, 5, null]);
  });
});

describe("filter page URL plumbing", () => {
  it("carries the list URL to the filter page and back", () => {
    const href = buildFilterHref("/filter/goals", { pathname: "/goals", search: "?range=this_year&q=car" });
    const u = new URL(href, "https://x.test");
    expect(u.pathname).toBe("/filter/goals");
    expect(u.searchParams.get("returnTo")).toBe("/goals?range=this_year&q=car");
    expect(u.searchParams.get("q")).toBe("car");
  });
  it("applies owned params onto returnTo and keeps the rest", () => {
    const out = applyToReturnTo("/goals?range=this_year&q=car&status=active", "/goals", { status: "completed", sort: "name" }, ["status", "type", "sort", "dir"]);
    const u = new URL(out, "https://x.test");
    expect(u.pathname).toBe("/goals");
    expect(u.searchParams.get("range")).toBe("this_year");
    expect(u.searchParams.get("q")).toBe("car");
    expect(u.searchParams.get("status")).toBe("completed");
    expect(u.searchParams.get("sort")).toBe("name");
  });
  it("drops cleared params and refuses a hostile returnTo", () => {
    expect(applyToReturnTo("/goals?status=active", "/goals", { status: "" }, ["status"])).toBe("/goals");
    expect(applyToReturnTo("//evil.test/x", "/goals", {}, [])).toBe("/goals");
    expect(applyToReturnTo("https://evil.test", "/goals", {}, [])).toBe("/goals");
  });
  it("counts active filters plus a non-default sort", () => {
    const sorts = [{ key: "date", label: "Date" }, { key: "name", label: "Name" }];
    const params: Record<string, string> = { status: "active", sort: "name" };
    const get = (k: string) => params[k];
    expect(countActive(get, ["status", "type"], parseSort(get, sorts), sorts)).toBe(2);
    expect(countActive(() => null, ["status"], parseSort(() => null, sorts), sorts)).toBe(0);
  });
});
