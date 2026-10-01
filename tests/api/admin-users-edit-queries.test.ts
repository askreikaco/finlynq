/**
 * applyAdminUserEdit — DB-layer semantics against a recording fake tx:
 * last-admin guard (locks admin rows), single UPDATE, whitelisted columns,
 * email-change token invalidation, MFA-reset device revocation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as pg from "@/db/schema-pg";

const selects: unknown[][] = [];
const updates: { table: unknown; set: Record<string, unknown> }[] = [];
const forCalls: string[] = [];

function makeTx() {
  return {
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.for = (m: string) => {
        forCalls.push(m);
        return Promise.resolve(selects.shift() ?? []);
      };
      return chain;
    },
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table, set });
          return Promise.resolve();
        },
      }),
    }),
  };
}

vi.mock("@/db", () => ({
  db: { transaction: async (fn: (tx: unknown) => unknown) => fn(makeTx()) },
  schema: {},
  getDialect: () => "postgres",
}));

import { applyAdminUserEdit } from "@/lib/auth/queries";

beforeEach(() => {
  selects.length = 0; updates.length = 0; forCalls.length = 0;
});

const userUpdate = () => updates.find((u) => u.table === pg.users)!;

describe("applyAdminUserEdit", () => {
  it("last admin demotion is refused and nothing is updated", async () => {
    selects.push([{ id: "a", role: "admin" }], [{ id: "a" }]);
    const r = await applyAdminUserEdit("a", { role: "user" });
    expect(r).toEqual({ ok: false, reason: "last_admin" });
    expect(updates).toHaveLength(0);
  });

  it("demotion with another admin present succeeds; admin rows were locked FOR UPDATE", async () => {
    selects.push([{ id: "a", role: "admin" }], [{ id: "a" }, { id: "b" }]);
    expect(await applyAdminUserEdit("a", { role: "user" })).toEqual({ ok: true });
    expect(userUpdate().set.role).toBe("user");
    expect(forCalls).toEqual(["update", "update"]);
  });

  it("promoting / editing a non-admin never trips the guard", async () => {
    selects.push([{ id: "u", role: "user" }]);
    expect(await applyAdminUserEdit("u", { role: "admin" })).toEqual({ ok: true });
  });

  it("unknown user -> not_found", async () => {
    selects.push([]);
    expect(await applyAdminUserEdit("x", { displayName: "a" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("writes ONE users UPDATE containing only whitelisted columns", async () => {
    selects.push([{ id: "u", role: "user" }]);
    await applyAdminUserEdit("u", { displayName: "N", username: "n", plan: "pro", planExpiresAt: "2027-01-01" });
    const set = userUpdate().set;
    expect(updates.filter((u) => u.table === pg.users)).toHaveLength(1);
    expect(Object.keys(set).sort()).toEqual(["displayName", "plan", "planExpiresAt", "updatedAt", "username"]);
    for (const k of ["passwordHash", "kekSalt", "dekWrapped", "dekWrappedIv", "dekWrappedTag", "mfaSecret"]) {
      expect(set).not.toHaveProperty(k);
    }
  });

  it("email change resets emailVerified, drops verify token, voids outstanding reset tokens", async () => {
    selects.push([{ id: "u", role: "user" }]);
    await applyAdminUserEdit("u", { email: "n@x.com" });
    expect(userUpdate().set).toMatchObject({ email: "n@x.com", emailVerified: 0, emailVerifyToken: null });
    expect(updates.some((u) => u.table === pg.passwordResetTokens && u.set.usedAt)).toBe(true);
  });

  it("email change with explicit emailVerified=true keeps it verified", async () => {
    selects.push([{ id: "u", role: "user" }]);
    await applyAdminUserEdit("u", { email: "n@x.com", emailVerified: true });
    expect(userUpdate().set.emailVerified).toBe(1);
  });

  it("emailVerified alone does not touch tokens", async () => {
    selects.push([{ id: "u", role: "user" }]);
    await applyAdminUserEdit("u", { emailVerified: true });
    expect(userUpdate().set.emailVerified).toBe(1);
    expect(updates.some((u) => u.table === pg.passwordResetTokens)).toBe(false);
  });

  it("disableMfa clears secret + flag and revokes trusted devices", async () => {
    selects.push([{ id: "u", role: "user" }]);
    await applyAdminUserEdit("u", { disableMfa: true, revokeSessions: true });
    expect(userUpdate().set).toMatchObject({ mfaEnabled: 0, mfaSecret: null });
    expect(userUpdate().set.sessionNotBefore).toBeInstanceOf(Date);
    expect(updates.some((u) => u.table === pg.userDevices && u.set.revokedAt)).toBe(true);
  });

  it("no revokeSessions -> session cutoff untouched", async () => {
    selects.push([{ id: "u", role: "user" }]);
    await applyAdminUserEdit("u", { disableMfa: true });
    expect(userUpdate().set).not.toHaveProperty("sessionNotBefore");
  });
});
