import { describe, it, expect } from "vitest";
import { isLocalFirstDevEnabled } from "@/lib/local-first/flag";

describe("isLocalFirstDevEnabled", () => {
  it("is OFF when the variable is unset", () => {
    expect(isLocalFirstDevEnabled({})).toBe(false);
  });

  it("is OFF for '0' and 'false'", () => {
    expect(isLocalFirstDevEnabled({ FINLYNQ_LOCAL_FIRST_DEV: "0" })).toBe(false);
    expect(isLocalFirstDevEnabled({ FINLYNQ_LOCAL_FIRST_DEV: "false" })).toBe(false);
  });

  it("is ON for 1, true, yes and on (case and whitespace insensitive)", () => {
    for (const v of ["1", "true", "yes", "on", "TRUE", " On "]) {
      expect(isLocalFirstDevEnabled({ FINLYNQ_LOCAL_FIRST_DEV: v })).toBe(true);
    }
  });
});
