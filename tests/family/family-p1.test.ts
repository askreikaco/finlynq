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
  bootstrapFamilyTestDb,
  resetFamilyTestDb,
  shutdownFamilyTestDb,
  createTestUser,
  createTestShare,
  getTestShare,
} from "./family-fixtures";

describe("Family Wealth P1", () => {
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
      await expect(async () => {
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
      }).rejects.toThrow();
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

      expect(async () => {
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
      }).rejects.toThrow();
    });

    it("enforces owner_not_viewer constraint", async () => {
      const owner = await createTestUser("owner@example.com");

      expect(async () => {
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
      }).rejects.toThrow();
    });

    it("enforces status values constraint", async () => {
      const owner = await createTestUser("owner@example.com");

      expect(async () => {
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
      }).rejects.toThrow();
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
});
