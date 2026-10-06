import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

/**
 * Concurrency tests for data_version trigger system.
 * Verifies data_version increments correctly under concurrent load with ordered row locks.
 * Verifies UPDATE with user_id change bumps both users' data_version.
 *
 * Ordered row locks (FOR NO KEY UPDATE) prevent real deadlocks in single multi-user
 * statements by ensuring all transactions acquire locks in deterministic order.
 * Deadlock reproduction is state-dependent: the test forces the required table state
 * with VACUUM FULL users before each run.
 *
 * Run with: DATABASE_URL=postgres://... vitest run tests/db/data-version-concurrency.test.ts
 * Requires a live Postgres cluster at $DATABASE_URL with the migration applied.
 */

describe('data-version concurrency', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const numClients = 24;
  const numUsers = 10;
  const iterationsPerClient = 80;
  const testUserIds: string[] = [];

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not set for data-version concurrency tests');
    }

    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      // Delete leftover concurrency-user-* rows and accounts at START
      await client.query(`DELETE FROM accounts WHERE user_id LIKE 'concurrency-user-%'`);
      await client.query(`DELETE FROM users WHERE id LIKE 'concurrency-user-%'`);

      // Force table state with VACUUM FULL outside any transaction
      await client.query(`VACUUM FULL users`);

      // Create 10 test users
      const now = new Date().toISOString();
      const createUserResult = await client.query(
        `INSERT INTO users (id, email, password_hash, created_at, updated_at)
         SELECT 'concurrency-user-' || i::text, 'concurrency-user-' || i::text || '@test.local', 'hash_pass', $2, $3
         FROM generate_series(1, $1) i
         RETURNING id`,
        [numUsers, now, now]
      );

      testUserIds.push(...createUserResult.rows.map((r: { id: string }) => r.id));

      // Clear data_version for all test users
      await client.query(
        `UPDATE users SET data_version = 0 WHERE id = ANY($1)`,
        [testUserIds]
      );
    } finally {
      await client.end();
    }
  });

  afterAll(async () => {
    // Delete all test data and test users (also on failure)
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();

    try {
      await client.query(`DELETE FROM accounts WHERE user_id LIKE 'concurrency-user-%'`);
      await client.query(`DELETE FROM users WHERE id LIKE 'concurrency-user-%'`);
    } finally {
      await client.end();
    }
  });

  it('should increment data_version correctly under concurrent multi-user inserts with shuffled arrays (24 clients × 80 iterations)', async () => {
    const clients = Array.from({ length: numClients }, () => new pg.Client({
      connectionString: databaseUrl,
    }));

    try {
      // Connect all clients
      for (const client of clients) {
        await client.connect();
      }

      // Dispatch work: 24 clients × 80 iterations = 1920 total operations
      // With 10 users, each user should see 1920 / 10 = 192 increments
      let deadlockCount = 0;
      const clientPromises = [];

      for (let clientId = 0; clientId < numClients; clientId++) {
        const clientPromise = (async () => {
          for (let iter = 0; iter < iterationsPerClient; iter++) {
            try {
              // Shuffle the 10 user IDs per iteration
              const shuffledUsers = [...testUserIds].sort(() => Math.random() - 0.5);

              // Use unnest to insert with shuffled user array
              await clients[clientId].query(
                `INSERT INTO accounts (user_id, type, "group", currency)
                 SELECT u, 'c', 'g', 'USD'
                 FROM unnest($1::text[]) u`,
                [shuffledUsers]
              );
            } catch (error: unknown) {
              const err = error as { code?: string; message?: string };
              if (err.code === '40P01' || (err.message && err.message.includes('deadlock'))) {
                deadlockCount++;
                console.error(`Deadlock on client ${clientId} iteration ${iter}: ${err.message}`);
              } else {
                throw error;
              }
            }
          }
        })();
        clientPromises.push(clientPromise);
      }

      await Promise.all(clientPromises);

      // Verify that all operations completed without deadlock errors.
      // Ordered row locks prevent real deadlocks by ensuring deterministic lock acquisition.
      console.log(`\n*** DEADLOCK COUNT: ${deadlockCount} out of ${numClients * iterationsPerClient} operations ***`);
      expect(deadlockCount).toBe(0);

      // Verify each user's data_version increased by exactly clients*iterations (1920)
      const finalVersions = await clients[0].query(
        `SELECT id, data_version FROM users WHERE id = ANY($1) ORDER BY id`,
        [testUserIds]
      );

      const expectedIncrement = numClients * iterationsPerClient;
      for (const user of finalVersions.rows) {
        const version = parseInt(user.data_version, 10);
        expect(version).toBe(expectedIncrement);
        console.log(`User ${user.id} data_version: ${version} (expected ${expectedIncrement})`);
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
      const user1 = await client.query(`SELECT data_version FROM users WHERE id = $1`, [user1Id]);
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

      const versionMap = new Map(finalVersions.rows.map((u: { id: string; data_version: string }) => [u.id.toString(), parseInt(u.data_version, 10)]));
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
