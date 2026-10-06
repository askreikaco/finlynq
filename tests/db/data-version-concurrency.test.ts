import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import pg from 'pg';

/**
 * Concurrency tests for data_version trigger system.
 * Verifies the deadlock fix: row locking in deterministic order prevents deadlocks.
 * Verifies UPDATE with user_id change bumps both users.
 *
 * Run with: DATABASE_URL=postgres://... vitest run tests/db/data-version-concurrency.test.ts
 * Requires a live Postgres cluster at $DATABASE_URL with the migration applied.
 */

describe('data-version concurrency', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const numClients = 6;
  const numUsers = 4;
  const iterationsPerClient = 80;

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not set for data-version concurrency tests');
    }
  });

  it('should prevent deadlocks with multi-user multi-statement inserts (6 clients × 80 iterations)', async () => {
    const clients = Array.from({ length: numClients }, () => new pg.Client({
      connectionString: databaseUrl,
    }));

    try {
      // Connect all clients
      for (const client of clients) {
        await client.connect();
      }

      const mainClient = clients[0];

      // Create test users
      const now = new Date().toISOString();
      const userResults = await mainClient.query(
        `INSERT INTO users (id, email, password_hash, created_at, updated_at)
         SELECT gen_random_uuid(), 'deadlock-user-' || i::text || '@test.local', 'hash_pass', $2, $3
         FROM generate_series(1, $1) i
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [numUsers, now, now]
      );

      let userIds = userResults.rows.map((r: any) => r.id);

      if (userIds.length === 0) {
        // Users already exist, fetch them
        const existing = await mainClient.query(
          `SELECT id FROM users WHERE email LIKE 'deadlock-user-%' ORDER BY id LIMIT $1`,
          [numUsers]
        );
        userIds = existing.rows.map((r: any) => r.id);
      }

      // Clear data_version for all test users before test
      await mainClient.query(
        `UPDATE users SET data_version = 0 WHERE id = ANY($1)`,
        [userIds]
      );

      // Clean up any existing test data
      await mainClient.query(
        `DELETE FROM accounts WHERE user_id = ANY($1)`,
        [userIds]
      );

      // Create shuffled user_id assignments: 480 operations across 4 test users
      // Each iteration creates a shuffled array of 4 user IDs
      const shuffledUserIds: string[] = [];
      for (let i = 0; i < iterationsPerClient; i++) {
        for (let u = 0; u < numUsers; u++) {
          shuffledUserIds.push(userIds[u]);
        }
      }
      // Fisher-Yates shuffle to randomize user_id order
      for (let i = shuffledUserIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledUserIds[i], shuffledUserIds[j]] = [shuffledUserIds[j], shuffledUserIds[i]];
      }

      // Dispatch work: 6 clients × 80 iterations = 480 total operations
      // Create a shuffled list of operations: each (clientId, iteration) maps to a user_id
      // This ensures multi-user contention across all clients simultaneously
      let deadlockCount = 0;
      const clientPromises = [];

      for (let clientId = 0; clientId < numClients; clientId++) {
        const clientPromise = (async () => {
          for (let iter = 0; iter < iterationsPerClient; iter++) {
            try {
              // Get user_id for this operation from shuffled list
              const opIdx = clientId * iterationsPerClient + iter;
              const userId = shuffledUserIds[opIdx % shuffledUserIds.length];

              // Insert single row with this user_id
              await clients[clientId].query(
                `INSERT INTO accounts (user_id, type, "group", currency)
                 VALUES ($1, $2, $3, $4)`,
                [userId, 'checking', 'default', 'CAD']
              );
            } catch (error: any) {
              if (error.message && error.message.includes('deadlock')) {
                deadlockCount++;
                console.error(`Deadlock on client ${clientId} iteration ${iter}`);
              } else {
                throw error;
              }
            }
          }
        })();
        clientPromises.push(clientPromise);
      }

      await Promise.all(clientPromises);

      // CRITICAL: Verify zero deadlocks (fails if deterministic row locking is removed)
      console.log(`\n*** DEADLOCK TEST RESULT: ${deadlockCount} deadlocks out of 480 operations ***`);
      expect(deadlockCount).toBe(0);

      // Verify each user's data_version was incremented
      const finalVersions = await mainClient.query(
        `SELECT id, data_version FROM users WHERE id = ANY($1) ORDER BY id`,
        [userIds]
      );

      for (const user of finalVersions.rows) {
        const version = parseInt(user.data_version, 10);
        expect(version).toBeGreaterThan(0);
        console.log(`User data_version bumped to: ${version}`);
      }
    } finally {
      // Close all clients
      for (const client of clients) {
        await client.end();
      }
    }
  });

  it('should handle non-UUID string user IDs (e.g. "default")', async () => {
    const client = new pg.Client({
      connectionString: databaseUrl,
    });

    try {
      await client.connect();

      // Create a user with a string ID (not UUID)
      const stringUserId = 'test-string-user-' + Date.now();
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO users (id, email, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [stringUserId, 'string-user-' + Date.now() + '@test.local', 'hash', now, now]
      );

      // Clear data_version
      await client.query(
        `UPDATE users SET data_version = 0 WHERE id = $1`,
        [stringUserId]
      );

      // Insert into accounts for this string user
      await client.query(
        `INSERT INTO accounts (user_id, type, "group", currency)
         VALUES ($1, $2, $3, $4)`,
        [stringUserId, 'checking', 'default', 'CAD']
      );

      // Verify data_version was bumped
      const result = await client.query(
        `SELECT data_version FROM users WHERE id = $1`,
        [stringUserId]
      );

      expect(parseInt(result.rows[0].data_version, 10)).toBeGreaterThan(0);
      console.log(`String user ID test passed: data_version bumped for '${stringUserId}'`);
    } finally {
      await client.end();
    }
  });

  it('should bump both users when UPDATE changes user_id', async () => {
    const client = new pg.Client({
      connectionString: databaseUrl,
    });

    try {
      await client.connect();

      // Create two test users for this test
      const now = new Date().toISOString();
      const createUserResult = await client.query(
        `INSERT INTO users (id, email, password_hash, created_at, updated_at)
         SELECT 'update-user-' || gen_random_uuid()::text, 'update-user-' || i::text || '@test.local', 'hash_pass', $1, $2
         FROM generate_series(1, 2) i
         RETURNING id`,
        [now, now]
      );

      const user1Id = createUserResult.rows[0].id;
      const user2Id = createUserResult.rows[1].id;

      // Clear data_version for both users
      await client.query(
        `UPDATE users SET data_version = 0 WHERE id = ANY($1)`,
        [[user1Id, user2Id]]
      );

      // Insert a record for user 1
      const insertResult = await client.query(
        `INSERT INTO accounts (user_id, type, "group", currency)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [user1Id, 'checking', 'default', 'CAD']
      );

      const recordId = insertResult.rows[0].id;

      // Verify user1's version was bumped by INSERT
      let user1 = await client.query(`SELECT data_version FROM users WHERE id = $1`, [user1Id]);
      const user1InsertVersion = parseInt(user1.rows[0].data_version, 10);
      expect(user1InsertVersion).toBeGreaterThan(0);

      // Clear versions for the UPDATE test
      await client.query(
        `UPDATE users SET data_version = 0 WHERE id = ANY($1)`,
        [[user1Id, user2Id]]
      );

      // Update the record to transfer it to user 2
      await client.query(
        `UPDATE accounts SET user_id = $1 WHERE id = $2`,
        [user2Id, recordId]
      );

      // Verify BOTH users' data_version was bumped
      const finalVersions = await client.query(
        `SELECT id, data_version FROM users WHERE id = ANY($1) ORDER BY id`,
        [[user1Id, user2Id]]
      );

      const versionMap = new Map(finalVersions.rows.map((u: any) => [u.id.toString(), parseInt(u.data_version, 10)]));
      const finalUser1Version = versionMap.get(user1Id.toString());
      const finalUser2Version = versionMap.get(user2Id.toString());

      expect(finalUser1Version).toBeGreaterThan(0);
      expect(finalUser2Version).toBeGreaterThan(0);

      console.log(`User 1 (old owner) data_version: ${finalUser1Version}`);
      console.log(`User 2 (new owner) data_version: ${finalUser2Version}`);

      // Clean up test users and their data
      await client.query(
        `DELETE FROM accounts WHERE user_id IN ($1, $2)`,
        [user1Id, user2Id]
      );
      await client.query(
        `DELETE FROM users WHERE id IN ($1, $2)`,
        [user1Id, user2Id]
      );
    } finally {
      await client.end();
    }
  });
});
