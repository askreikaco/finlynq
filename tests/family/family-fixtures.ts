/**
 * Family Wealth test fixtures (P1).
 *
 * Real PostgreSQL test harness for family sharing schema, triggers, and DAL.
 * - DATABASE_URL must point at a *_test database
 * - Per-test TRUNCATE of family and user tables
 * - Idempotent bootstrap
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { PostgresAdapter, setAdapter, setDialect, db } from "@/db";

let __initialized = false;
let __adapter: PostgresAdapter | null = null;

/** Bootstrap PostgresAdapter for the suite. Idempotent. */
export async function bootstrapFamilyTestDb(): Promise<void> {
  if (__initialized) return;

  const databaseUrl = process.env.DATABASE_URL || process.env.PF_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "[family-fixtures] DATABASE_URL is required. Expected " +
        "postgresql://devmanager:dev@localhost:55432/finlynq_test",
    );
  }

  if (!/\/[^/]*_test([?#]|$)/.test(databaseUrl)) {
    throw new Error(
      `[family-fixtures] DATABASE_URL must target a *_test database; got: ${databaseUrl}`,
    );
  }

  __adapter = new PostgresAdapter();
  await __adapter.initialize({
    dialect: "postgres",
    postgres: { connectionString: databaseUrl, userId: "" },
  });
  setAdapter(__adapter);
  setDialect("postgres");
  __initialized = true;
}

/** Per-test wipe: TRUNCATE family and related tables. */
export async function resetFamilyTestDb(): Promise<void> {
  await bootstrapFamilyTestDb();
  await db.execute(sql`TRUNCATE TABLE
    family_labels,
    family_key_grants,
    family_section_keys,
    user_keypairs,
    family_invites,
    family_shares,
    users
    RESTART IDENTITY CASCADE`);
}

/** Shutdown adapter at end of suite. */
export async function shutdownFamilyTestDb(): Promise<void> {
  if (__adapter) {
    await __adapter.close();
    __adapter = null;
    __initialized = false;
  }
}

/**
 * Create a test user.
 * @returns user ID (UUID string)
 */
export async function createTestUser(email: string = "test@example.com"): Promise<string> {
  const userId = randomUUID();
  await db.execute(sql`
    INSERT INTO users (
      id, email, email_verified, username, password_hash, created_at, updated_at, encryption_v
    ) VALUES (
      ${userId}, ${email}, 1, ${email.split("@")[0]}, 'hash', NOW(), NOW(), 1
    )
  `);
  return userId;
}

const toPgArr = (a: string[]) => `{${a.join(",")}}`;
/**
 * Create a test family share.
 * @returns share ID (UUID string)
 */
export async function createTestShare(
  ownerId: string,
  viewerEmailLower: string,
  sections: string[] = ["accounts"],
  mustShareBack: boolean = false,
): Promise<string> {
  const shareId = randomUUID();
  await db.execute(sql`
    INSERT INTO family_shares (
      id, owner_id, viewer_email_lower, sections, status, must_share_back, required_back_sections
    ) VALUES (
      ${shareId},
      ${ownerId},
      ${viewerEmailLower},
      ${toPgArr(sections)}::TEXT[],
      'pending',
      ${mustShareBack},
      ${mustShareBack ? toPgArr(sections) : "{}"}::TEXT[]
    )
  `);
  return shareId;
}

/**
 * Get a share by ID for assertion.
 */
export async function getTestShare(shareId: string) {
  const result = await db.execute(sql`
    SELECT * FROM family_shares WHERE id = ${shareId}
  `);
  return result.rows[0] || null;
}
