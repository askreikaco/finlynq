import { describe, it, expect, vi } from "vitest";
import { isInstanceAdminEnabled, isInstanceAdminPath } from "@/lib/admin/instance-flag";

describe("isInstanceAdminEnabled", () => {
  it("returns false by default when env is empty", () => {
    expect(isInstanceAdminEnabled({})).toBe(false);
  });

  it("returns true when FINLYNQ_INSTANCE_ADMIN is '1'", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "1" })).toBe(true);
  });

  it("returns true when FINLYNQ_INSTANCE_ADMIN is 'true'", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "true" })).toBe(true);
  });

  it("returns true when FINLYNQ_INSTANCE_ADMIN is 'yes'", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "yes" })).toBe(true);
  });

  it("returns true when FINLYNQ_INSTANCE_ADMIN is 'on'", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "on" })).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "TRUE" })).toBe(true);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "Yes" })).toBe(true);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "ON" })).toBe(true);
  });

  it("handles whitespace around the value", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "  true  " })).toBe(true);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "\n1\n" })).toBe(true);
  });

  it("returns false for other values", () => {
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "0" })).toBe(false);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "false" })).toBe(false);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "no" })).toBe(false);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "off" })).toBe(false);
    expect(isInstanceAdminEnabled({ FINLYNQ_INSTANCE_ADMIN: "random" })).toBe(false);
  });

  it.each(["0", "false", "no", "off", "enabled", "", "2"])(
    "returns false when FINLYNQ_INSTANCE_ADMIN is %s",
    (token) => {
      vi.stubEnv("FINLYNQ_INSTANCE_ADMIN", token);
      expect(isInstanceAdminEnabled()).toBe(false);
    }
  );
});

describe("isInstanceAdminPath", () => {
  it("returns true for /admin/instance", () => {
    expect(isInstanceAdminPath("/admin/instance")).toBe(true);
  });

  it("returns true for /admin/instance/ subpaths", () => {
    expect(isInstanceAdminPath("/admin/instance/foo")).toBe(true);
    expect(isInstanceAdminPath("/admin/instance/foo/bar")).toBe(true);
  });

  it("returns false for other admin paths", () => {
    expect(isInstanceAdminPath("/admin")).toBe(false);
    expect(isInstanceAdminPath("/admin/system")).toBe(false);
    expect(isInstanceAdminPath("/admin/feedback")).toBe(false);
  });

  it("returns false for non-admin paths", () => {
    expect(isInstanceAdminPath("/dashboard")).toBe(false);
    expect(isInstanceAdminPath("/settings")).toBe(false);
    expect(isInstanceAdminPath("/admin-instance")).toBe(false);
  });
});
