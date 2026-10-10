/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

let query = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
}));

import { useReturnTo } from "@/lib/forms/use-return-to";

describe("useReturnTo", () => {
  it("returns a valid returnTo", () => {
    query = "returnTo=%2Ftransactions%3Fx%3D1";
    const { result } = renderHook(() => useReturnTo("/fallback"));
    expect(result.current).toBe("/transactions?x=1");
  });

  it("returns the fallback when returnTo is missing or hostile", () => {
    for (const q of ["", "returnTo=%2F%2Fevil.test", "returnTo=%2F%5Cevil.test", "returnTo=https%3A%2F%2Fevil.test"]) {
      query = q;
      const { result } = renderHook(() => useReturnTo("/fallback"));
      expect(result.current, q).toBe("/fallback");
    }
  });
});
