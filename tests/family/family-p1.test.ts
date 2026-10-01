/**
 * Family Wealth P1 tests — schema, triggers, and DAL.
 *
 * Tests cover:
 * 1. Schema idempotency (migrations can run multiple times safely)
 * 2. Min-section SQL trigger (reciprocal shares must satisfy required sections)
 * 3. DAL basic operations (create, read, update shares)
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  createShare, getShareById, getOwnerShares, getViewerShares, updateShareStatus,
  revokeShare, acceptShare, consumeInvite, getShareKeyGrants, updateLastViewed,
  deleteUserFamilyData,
} from "@/lib/family/share-dal";
import {
  bootstrapFamilyTestDb,
  resetFamilyTestDb,
  shutdownFamilyTestDb,
  createTestUser,
  createTestShare,
  getTestShare,
} from "./family-fixtures";

/** SQLSTATE of the error thrown by fn (drizzle wraps pg errors in .cause). */
async function pgCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn();
  } catch (e) {
    const err = e as { cause?: { code?: string }; code?: string };
    return err.cause?.code ?? err.code ?? "no-code";
  }
  return undefined;
}

const pgArr = (a: string[]) => `{${a.join(",")}}`;

async function insertShare(o: {
  id?: string;
  owner: string;
  viewer?: string | null;
  email: string;
  sections: string[];
  status?: string;
  reciprocalOf?: string | null;
  required?: string[];
}): Promise<string> {
  const r = await db.execute(sql`
    INSERT INTO family_shares (id, owner_id, viewer_id, viewer_email_lower, sections,
      status, reciprocal_of, required_back_sections, must_share_back)
    VALUES (COALESCE(${o.id ?? null}::uuid, gen_random_uuid()), ${o.owner}, ${o.viewer ?? null}, ${o.email},
      ${pgArr(o.sections)}::TEXT[], ${o.status ?? "pending"}, ${o.reciprocalOf ?? null}::uuid,
      ${pgArr(o.required ?? [])}::TEXT[], ${(o.required ?? []).length > 0})
    RETURNING id`);
  return (r.rows[0] as { id: string }).id;
}

describe.skipIf(!process.env.DATABASE_URL)("Family Wealth P1", () => {
  beforeAll(async () => {
    await bootstrapFamilyTestDb();
  });

  beforeEach(async () => {
    await resetFamilyTestDb();
  });

  afterAll(async () => {
    await shutdownFamilyTestDb();
  });

  describe("Schema idempotency", () => {
    it("family_shares table exists and is queryable", async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'family_shares'
        ) AS exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it("family_invites table exists and is queryable", async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'family_invites'
        ) AS exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it("user_keypairs table exists", async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'user_keypairs'
        ) AS exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it("family_section_keys table exists", async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'family_section_keys'
        ) AS exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it("family_key_grants table exists", async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'family_key_grants'
        ) AS exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it("family_labels table exists", async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'family_labels'
        ) AS exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    it("family_shares_min_scope_guard trigger exists", async () => {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.triggers
          WHERE trigger_name = 'family_shares_min_scope_guard'
        ) AS exists
      `);
      expect(result.rows[0].exists).toBe(true);
    });
  });

  describe("Min-section SQL trigger (family_shares_min_scope_guard)", () => {
    it("allows insert when no reciprocal share exists", async () => {
      const owner = await createTestUser("owner@example.com");
      const shareId = await createTestShare(owner, "viewer@example.com", ["accounts"]);
      expect(shareId).toBeDefined();

      const share = await getTestShare(shareId);
      expect(share.sections).toEqual(["accounts"]);
    });

    it("allows update when reciprocal_of is NULL", async () => {
      const owner = await createTestUser("owner@example.com");
      const shareId = await createTestShare(owner, "viewer@example.com", ["accounts", "goals"]);

      await db.execute(sql`
        UPDATE family_shares
        SET sections = ARRAY['budgets'::TEXT]
        WHERE id = ${shareId}
      `);

      const updated = await getTestShare(shareId);
      expect(updated.sections).toEqual(["budgets"]);
    });

    it("enforces trigger: reciprocal share must include required sections", async () => {
      const owner = await createTestUser("owner@example.com");
      const viewer = await createTestUser("viewer@example.com");

      // Parent share: owner -> viewer, requires back ["accounts", "budgets"]
      const parentId = await createTestShare(
        owner,
        "viewer@example.com",
        ["accounts", "budgets"],
        true, // must_share_back
      );

      // Update parent to active state first
      await db.execute(sql`
        UPDATE family_shares SET status = 'active' WHERE id = ${parentId}
      `);

      // Try to insert reciprocal with insufficient sections — should fail
      expect(await pgCode(async () => {
        await db.execute(sql`
          INSERT INTO family_shares (
            id, owner_id, viewer_email_lower, sections, status, reciprocal_of, must_share_back
          ) VALUES (
            gen_random_uuid(),
            ${viewer},
            'owner@example.com',
            ARRAY['accounts'::TEXT],
            'pending',
            ${parentId},
            false
          )
        `);
      })).toBe("23514");
    });

    it("allows reciprocal share with sufficient sections", async () => {
      const owner = await createTestUser("owner@example.com");
      const viewer = await createTestUser("viewer@example.com");

      // Parent share: owner -> viewer, requires back ["accounts", "budgets"]
      const parentId = await createTestShare(
        owner,
        "viewer@example.com",
        ["accounts", "budgets"],
        true,
      );

      // Update parent to active
      await db.execute(sql`
        UPDATE family_shares SET status = 'active' WHERE id = ${parentId}
      `);

      // Reciprocal share: viewer -> owner, with ["accounts", "budgets", "goals"]
      // This should succeed (includes required sections)
      const result = await db.execute(sql`
        INSERT INTO family_shares (
          id, owner_id, viewer_email_lower, sections, status, reciprocal_of, must_share_back
        ) VALUES (
          gen_random_uuid(),
          ${viewer},
          'owner@example.com',
          ARRAY['accounts'::TEXT, 'budgets'::TEXT, 'goals'::TEXT],
          'pending',
          ${parentId},
          false
        )
        RETURNING id
      `);
      const reciprocalId = (result.rows[0] as Record<string, unknown>)?.id;

      const reciprocal = await getTestShare(reciprocalId as string);
      expect(reciprocal.sections).toContain("accounts");
      expect(reciprocal.sections).toContain("budgets");
    });
  });

  describe("Family Shares DAL", () => {
    it("creates a share with correct initial state", async () => {
      const owner = await createTestUser("owner@example.com");
      const shareId = await createTestShare(owner, "viewer@example.com", [
        "accounts",
        "investments",
      ]);

      const share = await getTestShare(shareId);
      expect(share).toBeDefined();
      if (!share) return;
      expect((share as Record<string, unknown>).owner_id).toBe(owner);
      expect((share as Record<string, unknown>).viewer_email_lower).toBe(
        "viewer@example.com",
      );
      expect((share as Record<string, unknown>).sections).toEqual([
        "accounts",
        "investments",
      ]);
      expect((share as Record<string, unknown>).status).toBe("pending");
      expect((share as Record<string, unknown>).all_sections).toBe(false);
      expect((share as Record<string, unknown>).must_share_back).toBe(false);
    });

    it("creates a must_share_back share with required_back_sections", async () => {
      const owner = await createTestUser("owner@example.com");
      const shareId = await createTestShare(
        owner,
        "viewer@example.com",
        ["accounts", "budgets"],
        true,
      );

      const share = await getTestShare(shareId);
      expect(share.must_share_back).toBe(true);
      expect(share.required_back_sections).toEqual(["accounts", "budgets"]);
    });

    it("updates share status", async () => {
      const owner = await createTestUser("owner@example.com");
      const shareId = await createTestShare(owner, "viewer@example.com");

      await db.execute(sql`
        UPDATE family_shares SET status = 'active' WHERE id = ${shareId}
      `);

      const updated = await getTestShare(shareId);
      expect(updated.status).toBe("active");
    });

    it("enforces sections not empty constraint", async () => {
      const owner = await createTestUser("owner@example.com");

      expect(await pgCode(async () => {
        await db.execute(sql`
          INSERT INTO family_shares (
            id, owner_id, viewer_email_lower, sections, status
          ) VALUES (
            gen_random_uuid(),
            ${owner},
            'viewer@example.com',
            ARRAY[]::TEXT[],
            'pending'
          )
        `);
      })).toBe("23514");
    });

    it("enforces owner_not_viewer constraint", async () => {
      const owner = await createTestUser("owner@example.com");

      expect(await pgCode(async () => {
        await db.execute(sql`
          INSERT INTO family_shares (
            id, owner_id, viewer_id, viewer_email_lower, sections, status
          ) VALUES (
            gen_random_uuid(),
            ${owner},
            ${owner},
            'viewer@example.com',
            ARRAY['accounts'::TEXT],
            'pending'
          )
        `);
      })).toBe("23514");
    });

    it("enforces status values constraint", async () => {
      const owner = await createTestUser("owner@example.com");

      expect(await pgCode(async () => {
        await db.execute(sql`
          INSERT INTO family_shares (
            id, owner_id, viewer_email_lower, sections, status
          ) VALUES (
            gen_random_uuid(),
            ${owner},
            'viewer@example.com',
            ARRAY['accounts'::TEXT],
            'invalid_status'
          )
        `);
      })).toBe("23514");
    });
  });

  describe("Cascading deletes", () => {
    it("deletes invites when share is deleted", async () => {
      const owner = await createTestUser("owner@example.com");
      const shareId = await createTestShare(owner, "viewer@example.com");

      // Insert an invite for this share
      await db.execute(sql`
        INSERT INTO family_invites (
          id, share_id, email_lower, token_hash, expires_at
        ) VALUES (
          gen_random_uuid(),
          ${shareId},
          'viewer@example.com',
          'hash',
          NOW() + INTERVAL '7 days'
        )
      `);

      // Verify invite exists
      let invites = await db.execute(sql`
        SELECT * FROM family_invites WHERE share_id = ${shareId}
      `);
      expect(invites.rows.length).toBe(1);

      // Delete the share
      await db.execute(sql`DELETE FROM family_shares WHERE id = ${shareId}`);

      // Verify invite was cascaded deleted
      invites = await db.execute(sql`
        SELECT * FROM family_invites WHERE share_id = ${shareId}
      `);
      expect(invites.rows.length).toBe(0);
    });

    it("deletes key grants when share is deleted", async () => {
      const owner = await createTestUser("owner@example.com");
      const shareId = await createTestShare(owner, "viewer@example.com", ["accounts"]);

      // Insert a key grant for this share
      await db.execute(sql`
        INSERT INTO family_key_grants (
          share_id, section, epoch, key_sealed, status
        ) VALUES (
          ${shareId},
          'accounts',
          1,
          'sealed_key_data',
          'ready'
        )
      `);

      // Verify grant exists
      let grants = await db.execute(sql`
        SELECT * FROM family_key_grants WHERE share_id = ${shareId}
      `);
      expect(grants.rows.length).toBe(1);

      // Delete the share
      await db.execute(sql`DELETE FROM family_shares WHERE id = ${shareId}`);

      // Verify grant was cascaded deleted
      grants = await db.execute(sql`
        SELECT * FROM family_key_grants WHERE share_id = ${shareId}
      `);
      expect(grants.rows.length).toBe(0);
    });

    it("deletes section keys when user is deleted", async () => {
      const owner = await createTestUser("owner@example.com");

      // Insert a section key for this user
      await db.execute(sql`
        INSERT INTO family_section_keys (
          owner_id, section, epoch, key_wrapped
        ) VALUES (
          ${owner},
          'accounts',
          1,
          'wrapped_key_data'
        )
      `);

      // Verify key exists
      let keys = await db.execute(sql`
        SELECT * FROM family_section_keys WHERE owner_id = ${owner}
      `);
      expect(keys.rows.length).toBe(1);

      // Delete the user
      await db.execute(sql`DELETE FROM users WHERE id = ${owner}`);

      // Verify key was cascaded deleted
      keys = await db.execute(sql`
        SELECT * FROM family_section_keys WHERE owner_id = ${owner}
      `);
      expect(keys.rows.length).toBe(0);
    });
  });
  describe("Min-section trigger semantics (DB)", () => {
    async function pair(parentStatus = "active") {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      const parent = await insertShare({
        owner: a, viewer: b, email: "b@example.com",
        sections: ["accounts", "loans"], required: ["accounts", "loans"], status: parentStatus,
      });
      return { a, b, parent };
    }

    it("rejects a strict subset (check_violation) and a partial overlap", async () => {
      const { a, b, parent } = await pair();
      for (const sections of [["accounts"], ["accounts", "goals"]]) {
        expect(
          await pgCode(() =>
            insertShare({ owner: b, viewer: a, email: "a@example.com", sections, reciprocalOf: parent }),
          ),
        ).toBe("23514");
      }
    });

    it("accepts exact and superset; widening after creation is allowed", async () => {
      const { a, b, parent } = await pair();
      const child = await insertShare({
        owner: b, viewer: a, email: "a@example.com",
        sections: ["accounts", "loans"], reciprocalOf: parent,
      });
      await db.execute(sql`UPDATE family_shares SET sections = ${pgArr(["accounts", "loans", "goals"])}::TEXT[] WHERE id = ${child}`);
      expect((await getTestShare(child)).sections).toEqual(["accounts", "loans", "goals"]);
    });

    it("rejects shrinking the reciprocal below required while parent is live", async () => {
      const { a, b, parent } = await pair();
      const child = await insertShare({
        owner: b, viewer: a, email: "a@example.com",
        sections: ["accounts", "loans"], reciprocalOf: parent,
      });
      expect(
        await pgCode(() => db.execute(sql`UPDATE family_shares SET sections = ${pgArr(["accounts"])}::TEXT[] WHERE id = ${child}`)),
      ).toBe("23514");
    });

    it("revoking the parent lifts the constraint", async () => {
      const { a, b, parent } = await pair();
      const child = await insertShare({
        owner: b, viewer: a, email: "a@example.com",
        sections: ["accounts", "loans"], reciprocalOf: parent,
      });
      await db.execute(sql`UPDATE family_shares SET status = 'revoked' WHERE id = ${parent}`);
      await db.execute(sql`UPDATE family_shares SET sections = ${pgArr(["accounts"])}::TEXT[] WHERE id = ${child}`);
      expect((await getTestShare(child)).sections).toEqual(["accounts"]);
    });

    it("one live share per owner->viewer pair; a revoked one does not block", async () => {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      await insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["accounts"], status: "active" });
      expect(
        await pgCode(() => insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["goals"] })),
      ).toBe("23505");
      await insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["goals"], status: "revoked" });
    });

    it("reciprocal_of cascades: deleting a parent removes the child", async () => {
      const { a, b, parent } = await pair();
      const child = await insertShare({
        owner: b, viewer: a, email: "a@example.com",
        sections: ["accounts", "loans"], reciprocalOf: parent,
      });
      await db.execute(sql`DELETE FROM family_shares WHERE id = ${parent}`);
      expect(await getTestShare(child)).toBeNull();
    });
  });

  describe("Share DAL (DB, actor scoped)", () => {
    it("getOwnerShares / getViewerShares never return other users' shares", async () => {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      const c = await createTestUser("c@example.com");
      const ab = await insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["accounts"], status: "active" });
      const cb = await insertShare({ owner: c, viewer: b, email: "b@example.com", sections: ["goals"], status: "active" });
      expect((await getOwnerShares(db, a)).map((s) => s.id)).toEqual([ab]);
      expect((await getOwnerShares(db, c)).map((s) => s.id)).toEqual([cb]);
      expect((await getViewerShares(db, b)).map((s) => s.id).sort()).toEqual([ab, cb].sort());
      expect(await getViewerShares(db, a)).toEqual([]);
    });

    it("by-id functions refuse a third party", async () => {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      const x = await createTestUser("x@example.com");
      const id = await insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["accounts"], status: "active" });
      expect(await getShareById(db, id, x)).toBeNull();
      expect(await getShareById(db, id, a)).not.toBeNull();
      expect(await getShareById(db, id, b)).not.toBeNull();
      await expect(updateShareStatus(db, id, "suspended", x)).rejects.toThrow(/not found/);
      await expect(revokeShare(db, id, x)).rejects.toThrow(/not found/);
      expect(await getShareKeyGrants(db, id, x)).toEqual([]);
      await updateLastViewed(db, id, x);
      expect((await getTestShare(id)).last_viewed_at).toBeNull();
      await updateLastViewed(db, id, b);
      expect((await getTestShare(id)).last_viewed_at).not.toBeNull();
      expect((await getTestShare(id)).status).toBe("active");
    });

    it("status guard: illegal transitions throw and leave the row unchanged", async () => {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      const id = await insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["accounts"], status: "active" });
      await expect(updateShareStatus(db, id, "pending", a)).rejects.toThrow(/Invalid transition/);
      await revokeShare(db, id, a);
      const row = await getTestShare(id);
      expect(row.status).toBe("revoked");
      expect(row.revoked_by).toBe(a);
      await expect(updateShareStatus(db, id, "active", a)).rejects.toThrow(/Invalid transition/);
      await expect(revokeShare(db, id, a)).rejects.toThrow(/Invalid transition/);
      expect((await getTestShare(id)).status).toBe("revoked");
    });

    it("revoke deletes key grants", async () => {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      const id = await insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["accounts"], status: "active" });
      await db.execute(sql`INSERT INTO family_key_grants (share_id, section) VALUES (${id}, 'accounts')`);
      expect((await getShareKeyGrants(db, id, a)).length).toBe(1);
      await revokeShare(db, id, b);
      expect(await getShareKeyGrants(db, id, a)).toEqual([]);
    });

    it("acceptShare: pending + matching email only; cannot revive terminal shares", async () => {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      const x = await createTestUser("x@example.com");
      const id = await createShare(db, a, "b@example.com", ["accounts"]);
      await expect(acceptShare(db, id, x, "x@example.com")).rejects.toThrow(/cannot be accepted/);
      await expect(acceptShare(db, id, a, "b@example.com")).rejects.toThrow(/cannot be accepted/);
      await acceptShare(db, id, b, "b@example.com");
      expect((await getTestShare(id)).status).toBe("awaiting_owner_unlock");
      expect((await getTestShare(id)).viewer_id).toBe(b);
      await expect(acceptShare(db, id, b, "b@example.com")).rejects.toThrow(/cannot be accepted/);
      await revokeShare(db, id, a);
      await expect(acceptShare(db, id, b, "b@example.com")).rejects.toThrow(/cannot be accepted/);
      expect((await getTestShare(id)).status).toBe("revoked");
    });

    it("createShare validates sections against the allow-list", async () => {
      const a = await createTestUser("a@example.com");
      await expect(createShare(db, a, "b@example.com", ["payee"])).rejects.toThrow();
      await expect(createShare(db, a, "b@example.com", [])).rejects.toThrow();
      const id = await createShare(db, a, "b@example.com", ["accounts", "accounts"], true);
      const row = await getTestShare(id);
      expect(row.sections).toEqual(["accounts"]);
      expect(row.required_back_sections).toEqual(["accounts"]);
    });

    it("consumeInvite: single-use, email-bound, unexpired", async () => {
      const a = await createTestUser("a@example.com");
      const id = await createShare(db, a, "b@example.com", ["accounts"]);
      const r = await db.execute(sql`INSERT INTO family_invites (share_id, email_lower, token_hash, expires_at)
        VALUES (${id}, 'b@example.com', 'h1', NOW() + interval '1 day'),
               (${id}, 'b@example.com', 'h2', NOW() - interval '1 day') RETURNING id, token_hash`);
      const rows = r.rows as { id: string; token_hash: string }[];
      const live = rows.find((x) => x.token_hash === "h1")!.id;
      const old = rows.find((x) => x.token_hash === "h2")!.id;
      expect(await consumeInvite(db, live, "x@example.com")).toBe(false);
      expect(await consumeInvite(db, old, "b@example.com")).toBe(false);
      expect(await consumeInvite(db, live, "b@example.com")).toBe(true);
      expect(await consumeInvite(db, live, "b@example.com")).toBe(false);
    });

    it("deleteUserFamilyData removes owner+viewer shares, reciprocal pairs, keys, labels", async () => {
      const a = await createTestUser("a@example.com");
      const b = await createTestUser("b@example.com");
      const parent = await insertShare({ owner: a, viewer: b, email: "b@example.com", sections: ["accounts"], status: "active" });
      await insertShare({ owner: b, viewer: a, email: "a@example.com", sections: ["accounts"], reciprocalOf: parent });
      await db.execute(sql`INSERT INTO family_section_keys (owner_id, section, key_wrapped) VALUES (${a}, 'accounts', 'k')`);
      await db.execute(sql`INSERT INTO family_labels (owner_id, section, entity_type, entity_id, label_ct) VALUES (${a}, 'accounts', 'accounts', 1, 'x')`);
      await db.execute(sql`INSERT INTO user_keypairs (user_id, x25519_pub, priv_wrapped) VALUES (${a}, 'p', 'w')`);
      await deleteUserFamilyData(db, a);
      for (const t of ["family_shares", "family_section_keys", "family_labels", "user_keypairs"]) {
        const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`));
        expect((r.rows[0] as { n: number }).n).toBe(0);
      }
    });
  });
});
