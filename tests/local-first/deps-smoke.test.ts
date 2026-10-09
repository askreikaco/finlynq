import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { argon2id } from "@noble/hashes/argon2.js";

// Argon2id vector: RFC 9106 section 5.3 ("Argon2id Test Vectors", version 19).
// Bytes parsed from https://www.rfc-editor.org/rfc/rfc9106.txt by a script, not typed by hand.
// Noble has no "ad" option: the RFC associated data is passed as `personalization`,
// which noble writes into the same H_0 X slot the RFC uses for associated data.
const PASSWORD_HEX = "0101010101010101010101010101010101010101010101010101010101010101"; // 32 bytes
const SALT_HEX = "02020202020202020202020202020202"; // 16 bytes
const SECRET_HEX = "0303030303030303"; // 8 bytes (noble `key`)
const AD_HEX = "040404040404040404040404"; // 12 bytes (noble `personalization`)
const TAG_HEX = "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659"; // 32 bytes

function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(u: Uint8Array): string {
  return Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("dependency smoke", () => {
  it("PGlite memory:// runs SELECT 1", async () => {
    const client = new PGlite("memory://");
    try {
      const res = await client.query<{ x: number }>("SELECT 1 AS x");
      expect(res.rows).toEqual([{ x: 1 }]);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("drizzle-orm/pglite drives PGlite", async () => {
    const client = new PGlite("memory://");
    try {
      const db = drizzle(client);
      const res = await db.execute(sql`SELECT 1 AS x`);
      expect(res.rows).toEqual([{ x: 1 }]);
    } finally {
      await client.close();
    }
  }, 60_000);

  it("Argon2id matches RFC 9106 section 5.3 tag (t=3, m=32 KiB, p=4, v=0x13)", () => {
    const tag = argon2id(fromHex(PASSWORD_HEX), fromHex(SALT_HEX), {
      t: 3,
      m: 32,
      p: 4,
      dkLen: 32,
      version: 0x13,
      key: fromHex(SECRET_HEX),
      personalization: fromHex(AD_HEX),
    });
    expect(toHex(tag)).toBe(TAG_HEX);
  });
});
