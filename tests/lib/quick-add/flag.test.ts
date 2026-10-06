import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isQuickAddEnabled } from "@/lib/quick-add/flag";

describe("isQuickAddEnabled", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.FINLYNQ_QUICK_ADD;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FINLYNQ_QUICK_ADD;
    } else {
      process.env.FINLYNQ_QUICK_ADD = originalEnv;
    }
  });

  it("should return false when no argument (process.env) and env var unset", () => {
    delete process.env.FINLYNQ_QUICK_ADD;
    expect(isQuickAddEnabled()).toBe(false);
  });

  it("should return true when no argument (process.env) and env var is '1'", () => {
    process.env.FINLYNQ_QUICK_ADD = "1";
    expect(isQuickAddEnabled()).toBe(true);
  });

  it("should return false by default when env is empty", () => {
    expect(isQuickAddEnabled({})).toBe(false);
  });

  it("should return true when FINLYNQ_QUICK_ADD is '1'", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "1" })).toBe(true);
  });

  it("should return true when FINLYNQ_QUICK_ADD is 'true'", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "true" })).toBe(true);
  });

  it("should return true when FINLYNQ_QUICK_ADD is 'yes'", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "yes" })).toBe(true);
  });

  it("should return true when FINLYNQ_QUICK_ADD is 'on'", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "on" })).toBe(true);
  });

  it("should return true with uppercase values", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "TRUE" })).toBe(true);
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "YES" })).toBe(true);
  });

  it("should return false when FINLYNQ_QUICK_ADD is '0'", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "0" })).toBe(false);
  });

  it("should return false when FINLYNQ_QUICK_ADD is 'false'", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "false" })).toBe(false);
  });

  it("should return false for any other value", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "random" })).toBe(false);
  });

  it("should handle whitespace in values", () => {
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "  1  " })).toBe(true);
    expect(isQuickAddEnabled({ FINLYNQ_QUICK_ADD: "  true  " })).toBe(true);
  });
});
