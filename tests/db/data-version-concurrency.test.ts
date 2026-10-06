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
  const numUsers = 6;
  const iterationsPerClient = 60;

  beforeAll(() => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not set for data-version concurrency tests');
    }
  });

  it('should handle 6 concurrent clients with 6 users without deadlocks (60 iterations)', async () => {
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
         SELECT gen_random_uuid(), 'concurrent-user-' || i::text || '@test.local', 'hash_pass', $2, $3
         FROM generate_series(1, $1) i
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [numUsers, now, now]
      );

      let userIds = userResults.rows.map((r: any) => r.id);

      if (userIds.length === 0) {
        // Users already exist, fetch them
        const existing = await mainClient.query(
          `SELECT id FROM users WHERE email LIKE 'concurrent-user-%' ORDER BY id LIMIT $1`,
          [numUsers]
        );
        userIds = existing.rows.map((r: any) => r.id);
      }

      // Create shuffled order of (clientId, userId, iteration) tuples
      const operations: Array<[number, string, number]> = [];
      for (let clientId = 0; clientId < numClients; clientId++) {
        for (let iteration = 0; iteration < iterationsPerClient; iteration++) {
          const userIdx = (clientId + iteration) % userIds.length;
          operations.push([clientId, userIds[userIdx], iteration]);
        }
      }

      // Fisher-Yates shuffle
      for (let i = operations.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [operations[i], operations[j]] = [operations[j], operations[i]];
      }

      // Clear data_version for all test users before test
      await mainClient.query(
        `UPDATE users SET data_version = 0 WHERE id = ANY($1)`,
        [userIds]
      );

      // Use the accounts table which already has triggers
      // (Clean up any existing test data)
      await mainClient.query(
        `DELETE FROM accounts WHERE user_id = ANY($1)`,
        [userIds]
      );

      // Execute all operations concurrently from different clients
      let deadlockCount = 0;
      const insertPromises = operations.map(async ([clientId, userId, iteration]) => {
        try {
          await clients[clientId].query(
            `INSERT INTO accounts (user_id, type, "group", currency)
             VALUES ($1, $2, $3, $4)`,
            [userId, 'checking', 'default', 'CAD']
          );
        } catch (error: any) {
          if (error.message && error.message.includes('deadlock')) {
            deadlockCount++;
            console.error(`Deadlock detected on client ${clientId} iteration ${iteration}`);
          } else {
            throw error;
          }
        }
      });

      await Promise.all(insertPromises);

      // Verify zero deadlocks
      expect(deadlockCount).toBe(0);

      // Verify each user's data_version was incremented
      const finalVersions = await mainClient.query(
        `SELECT id, data_version FROM users WHERE id = ANY($1)
         ORDER BY id`,
        [userIds]
      );

      for (const user of finalVersions.rows) {
        const version = parseInt(user.data_version, 10);
        expect(version).toBeGreaterThan(0);
        console.log(`User ${user.id.toString().slice(0, 8)}... final data_version: ${version}`);
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
         VALUES ($1, $2, $3, $4, $5)`,
        [stringUserId, 'string-user@test.local', 'hash', now, now]
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

      // Get or create two test users
      const users = await client.query(
        `SELECT id FROM users WHERE email LIKE 'concurrent-user-%' ORDER BY id LIMIT 2`
      );

      if (users.rows.length < 2) {
        throw new Error('Need at least 2 test users');
      }

      const user1Id = users.rows[0].id;
      const user2Id = users.rows[1].id;

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
    } finally {
      await client.end();
    }
  });
});
