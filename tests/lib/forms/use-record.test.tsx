/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

let apiState: { data?: unknown; isLoading: boolean } = { isLoading: true };
const seenKeys: unknown[] = [];
vi.mock("@/lib/data/use-api", () => ({
  useApi: (key: unknown) => {
    seenKeys.push(key);
    return { ...apiState, error: undefined, mutate: vi.fn() };
  },
}));

import { useRecord } from "@/lib/forms/use-record";

type Loan = { id: number; name: string };
const pick = (id: number) => (list: Loan[]) => list.find((l) => l.id === id);

describe("useRecord", () => {
  it("is loading with no record while data is undefined", () => {
    apiState = { isLoading: true };
    const { result } = renderHook(() => useRecord<Loan[], Loan>("/api/loans", pick(2)));
    expect(result.current.record).toBeUndefined();
    expect(result.current.notFound).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it("selects one record from a list response", () => {
    apiState = { isLoading: false, data: [{ id: 1, name: "a" }, { id: 2, name: "b" }] };
    const { result } = renderHook(() => useRecord<Loan[], Loan>("/api/loans", pick(2)));
    expect(result.current.record).toEqual({ id: 2, name: "b" });
    expect(result.current.notFound).toBe(false);
  });

  it("reports notFound when loaded but nothing matches", () => {
    apiState = { isLoading: false, data: [{ id: 1, name: "a" }] };
    const { result } = renderHook(() => useRecord<Loan[], Loan>("/api/loans", pick(9)));
    expect(result.current.record).toBeUndefined();
    expect(result.current.notFound).toBe(true);
  });

  it("passes the key through to useApi", () => {
    apiState = { isLoading: true };
    renderHook(() => useRecord<Loan[], Loan>(null, pick(1)));
    expect(seenKeys[seenKeys.length - 1]).toBeNull();
  });
});
