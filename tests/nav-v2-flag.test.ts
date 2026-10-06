/**
 * Test suite for FINLYNQ_NAV_V2 flag helper
 */
import { describe, it, expect } from "vitest";
import { isNavV2Enabled } from "@/lib/nav-v2/flag";

describe("isNavV2Enabled", () => {
  it("returns false when env is empty object", () => {
    expect(isNavV2Enabled({})).toBe(false);
  });

  it("returns false when FINLYNQ_NAV_V2 is undefined", () => {
    expect(isNavV2Enabled({ OTHER_VAR: "1" })).toBe(false);
  });

  it("returns false when FINLYNQ_NAV_V2 is empty string", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "" })).toBe(false);
  });

  it("returns false when FINLYNQ_NAV_V2 is '0'", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "0" })).toBe(false);
  });

  it("returns false when FINLYNQ_NAV_V2 is 'false'", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "false" })).toBe(false);
  });

  it("returns false when FINLYNQ_NAV_V2 is 'FALSE' (case insensitive)", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "FALSE" })).toBe(false);
  });

  it("returns true when FINLYNQ_NAV_V2 is '1'", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "1" })).toBe(true);
  });

  it("returns true when FINLYNQ_NAV_V2 is 'true'", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "true" })).toBe(true);
  });

  it("returns true when FINLYNQ_NAV_V2 is 'TRUE' (case insensitive)", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "TRUE" })).toBe(true);
  });

  it("returns true when FINLYNQ_NAV_V2 is 'yes'", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "yes" })).toBe(true);
  });

  it("returns true when FINLYNQ_NAV_V2 is ' yes ' (with whitespace)", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: " yes " })).toBe(true);
  });

  it("returns true when FINLYNQ_NAV_V2 is 'YES' (case insensitive)", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: "YES" })).toBe(true);
  });

  it("returns true when FINLYNQ_NAV_V2 is ' 1 ' (with whitespace)", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: " 1 " })).toBe(true);
  });

  it("returns true when FINLYNQ_NAV_V2 is ' true ' (with whitespace)", () => {
    expect(isNavV2Enabled({ FINLYNQ_NAV_V2: " true " })).toBe(true);
  });
});
