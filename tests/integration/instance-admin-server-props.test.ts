/**
 * Real integration tests for instanceAdminEnabled server-prop wiring (WP9a)
 *
 * These tests verify that the instanceAdminEnabled flag is correctly read
 * server-side from process.env and passed as a prop to client components.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isInstanceAdminEnabled } from "@/lib/admin/instance-flag";

describe("Server-side prop wiring for instanceAdminEnabled (WP9a)", () => {
  beforeEach(() => {
    delete process.env.FINLYNQ_INSTANCE_ADMIN;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("isInstanceAdminEnabled() returns false when flag is unset", () => {
    const result = isInstanceAdminEnabled();
    expect(result).toBe(false);
  });

  it("isInstanceAdminEnabled() returns true when flag is set to '1'", () => {
    vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", "1");
    const result = isInstanceAdminEnabled();
    expect(result).toBe(true);
  });

  it("isInstanceAdminEnabled() accepts environment object parameter", () => {
    const env = { FINLYNQ_INSTANCE_ADMIN: "true" };
    const result = isInstanceAdminEnabled(env);
    expect(result).toBe(true);
  });

  it("isInstanceAdminEnabled() accepts various truthy values", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "1" })).toBe(true);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "true" })).toBe(true);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "yes" })).toBe(true);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "on" })).toBe(true);
  });

  it("isInstanceAdminEnabled() rejects falsy values", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "0" })).toBe(false);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "false" })).toBe(false);
    expect(isInstanceAdminEnabled({})).toBe(false);
  });
});
