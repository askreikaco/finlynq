import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

/**
 * Concurrency tests for data_version trigger system.
 * Verifies the deadlock fix: row locking (FOR NO KEY UPDATE) in deterministic order prevents deadlocks.
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
  const testUserIds: string[] = [];

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not set for data-version concurrency tests');
    }

    // Create 4 test users in beforeAll
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      const now = new Date().toISOString();
      const createUserResult = await client.query(
        `INSERT INTO users (id, email, password_hash, created_at, updated_at)
         SELECT 'concurrency-user-' || i::text, 'concurrency-user-' || i::text || '@test.local', 'hash_pass', $2, $3
         FROM generate_series(1, $1) i
         RETURNING id`,
        [numUsers, now, now]
      );

      testUserIds.push(...createUserResult.rows.map((r: any) => r.id));

      // Clear data_version for all test users
      await client.query(
        `UPDATE users SET data_version = 0 WHERE id = ANY($1)`,
        [testUserIds]
      );

      // Clean up any existing test data
      await client.query(
        `DELETE FROM accounts WHERE user_id = ANY($1)`,
        [testUserIds]
      );
    } finally {
      await client.end();
    }
  });

  afterAll(async () => {
    // Delete all test data and test users
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      await client.query(
        `DELETE FROM accounts WHERE user_id = ANY($1)`,
        [testUserIds]
      );
      await client.query(
        `DELETE FROM users WHERE id = ANY($1)`,
        [testUserIds]
      );
    } finally {
      await client.end();
    }
  });

  it('should prevent deadlocks with multi-user concurrent inserts using unnest + shuffled array (6 clients × 80 iterations)', async () => {
    const clients = Array.from({ length: numClients }, () => new pg.Client({
      connectionString: databaseUrl,
    }));

    try {
      // Connect all clients
      for (const client of clients) {
        await client.connect();
      }

      // Dispatch work: 6 clients × 80 iterations = 480 total operations
      let deadlockCount = 0;
      const clientPromises = [];

      for (let clientId = 0; clientId < numClients; clientId++) {
        const clientPromise = (async () => {
          for (let iter = 0; iter < iterationsPerClient; iter++) {
            try {
              // Shuffle the 4 user IDs per iteration
              const shuffledUsers = [...testUserIds].sort(() => Math.random() - 0.5);

              // Use unnest to insert with shuffled user array
              await clients[clientId].query(
                `INSERT INTO accounts (user_id, type, "group", currency)
                 SELECT u, 'c', 'g', 'USD'
                 FROM unnest($1::text[]) u`,
                [shuffledUsers]
              );
            } catch (error: any) {
              if (error.code === '40P01' || (error.message && error.message.includes('deadlock'))) {
                deadlockCount++;
                console.error(`Deadlock on client ${clientId} iteration ${iter}: ${error.message}`);
              } else {
                throw error;
              }
            }
          }
        })();
        clientPromises.push(clientPromise);
      }

      await Promise.all(clientPromises);

      // CRITICAL: Verify zero deadlocks (fails if FOR NO KEY UPDATE is removed)
      console.log(`\n*** DEADLOCK TEST RESULT: ${deadlockCount} deadlocks out of 480 operations ***`);
      expect(deadlockCount).toBe(0);

      // Verify each user's data_version was incremented (480 operations / 4 users = 120 per user)
      const finalVersions = await clients[0].query(
        `SELECT id, data_version FROM users WHERE id = ANY($1) ORDER BY id`,
        [testUserIds]
      );

      for (const user of finalVersions.rows) {
        const version = parseInt(user.data_version, 10);
        expect(version).toBeGreaterThan(0);
        console.log(`User ${user.id} data_version: ${version} (expected ~120)`);
      }
    } finally {
      // Close all clients
      for (const client of clients) {
        await client.end();
      }
    }
  });

  it('should bump both users when UPDATE changes user_id', async () => {
    const client = new pg.Client({
      connectionString: databaseUrl,
    });

    try {
      await client.connect();

      // Use first two test users
      const user1Id = testUserIds[0];
      const user2Id = testUserIds[1];

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

      console.log(`\nUSER_ID TRANSFER TEST:`);
      console.log(`  User 1 (old owner) data_version: ${finalUser1Version}`);
      console.log(`  User 2 (new owner) data_version: ${finalUser2Version}`);
    } finally {
      await client.end();
    }
  });
});
