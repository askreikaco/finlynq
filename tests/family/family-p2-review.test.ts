/**
 * Family P2 security-review tests (adversarial crypto + sweep + rotation).
 * Real Postgres (see family-fixtures.ts). Named tests here are the mutation oracles.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID, createHmac } from "crypto";
import { eq, and } from "drizzle-orm";

import {
  resetFamilyTestDb,
  shutdownFamilyTestDb,
  createTestUser,
  createTestShare,
} from "./family-fixtures";
import {
  sealKey,
  unsealKey,
  generateKeypair,
  generateSectionKey,
  encryptLabel,
  decryptLabel,
  hashLabel,
  buildGrantAAD,
  buildLabelAAD,
} from "@/lib/crypto/family-crypto";
import {
  withSectionKeys,
  withOwnerLock,
  createUserKeypairIfNeeded,
  getUserPrivateKeyHex,
  getAndUnwrapSectionKey,
  provisionGrants,
  rotateEpoch,
} from "@/lib/family/grant";
import { syncFamilyLabels, enqueueFamilySweep } from "@/lib/family/sweep";
import { finalizeGrants, markShareKeyReset } from "@/lib/family/share-dal";
import { generateDEK, encryptField } from "@/lib/crypto/envelope";
import { db } from "@/db";
import {
  familyShares,
  familyKeyGrants,
  familySectionKeys,
  familyLabels,
  userKeypairs,
  accounts,
  goals,
} from "@/db/schema-pg";

afterAll(async () => {
  await shutdownFamilyTestDb();
});

async function addAccount(ownerId: string, dek: Buffer, name: string) {
  const [row] = await db
    .insert(accounts)
    .values({ userId: ownerId, type: "A", currency: "USD", nameCt: encryptField(dek, name) })
    .returning({ id: accounts.id });
  return row.id;
}

async function setup(sections: string[] = ["accounts"]) {
  const ownerId = await createTestUser(`o${randomUUID().slice(0, 6)}@x.com`);
  const viewerEmail = `v${randomUUID().slice(0, 6)}@x.com`;
  const viewerId = await createTestUser(viewerEmail);
  const ownerDek = generateDEK();
  const viewerDek = generateDEK();
  const kp = await createUserKeypairIfNeeded(db, viewerId, viewerDek);
  const shareId = await createTestShare(ownerId, viewerEmail, sections);
  await db.update(familyShares).set({ viewerId, status: "active" }).where(eq(familyShares.id, shareId));
  return { ownerId, viewerId, ownerDek, viewerDek, kp, shareId };
}

async function labelsOf(ownerId: string, section?: string) {
  const rows = await db.select().from(familyLabels).where(eq(familyLabels.ownerId, ownerId));
  return rows.filter((r) => !section || r.section === section);
}

describe("P2 review: crypto primitives", () => {
  it("seal uses a fresh ephemeral key and a fresh random IV every time", () => {
    const { publicKey } = generateKeypair();
    const k = generateSectionKey();
    const aad = buildGrantAAD("s", "o", "v", "accounts", 1);
    const a = Buffer.from(sealKey(k, publicKey, aad), "base64");
    const b = Buffer.from(sealKey(k, publicKey, aad), "base64");
    expect(a.length).toBe(1 + 32 + 12 + 32 + 16);
    expect(a.subarray(1, 33).equals(b.subarray(1, 33))).toBe(false); // ephemeral pub
    expect(a.subarray(33, 45).equals(b.subarray(33, 45))).toBe(false); // IV
    expect(a.subarray(45).equals(b.subarray(45))).toBe(false);
  });

  it("label encryption uses a fresh random IV every time", () => {
    const k = generateSectionKey();
    const aad = buildLabelAAD("o", "accounts", "accounts", 1, 1);
    const a = Buffer.from(encryptLabel(k, "Checking", aad), "base64");
    const b = Buffer.from(encryptLabel(k, "Checking", aad), "base64");
    expect(a.subarray(0, 12).equals(b.subarray(0, 12))).toBe(false);
    expect(a.equals(b)).toBe(false);
  });

  it("AAD is unambiguous when components contain the old '|' delimiter", () => {
    expect(buildGrantAAD("a|b", "c", "v", "s", 1)).not.toBe(buildGrantAAD("a", "b|c", "v", "s", 1));
    expect(buildGrantAAD("s", "o", "v", "accounts", 1)).not.toBe(buildGrantAAD("s", "o", "v", "accounts", 2));
    const { publicKey, privateKey } = generateKeypair();
    const k = generateSectionKey();
    const sealed = sealKey(k, publicKey, buildGrantAAD("a|b", "c", "v", "s", 1));
    expect(() => unsealKey(sealed, privateKey, buildGrantAAD("a", "b|c", "v", "s", 1))).toThrow();
  });

  it("each AAD component is bound (share, owner, viewer, section, epoch)", () => {
    const { publicKey, privateKey } = generateKeypair();
    const k = generateSectionKey();
    const base = ["s", "o", "v", "accounts", 1] as const;
    const sealed = sealKey(k, publicKey, buildGrantAAD(...base));
    expect(unsealKey(sealed, privateKey, buildGrantAAD(...base)).equals(k)).toBe(true);
    const variants: Array<[string, string, string, string, number]> = [
      ["x", "o", "v", "accounts", 1],
      ["s", "x", "v", "accounts", 1],
      ["s", "o", "x", "accounts", 1],
      ["s", "o", "v", "goals", 1],
      ["s", "o", "v", "accounts", 2],
    ];
    for (const v of variants) expect(() => unsealKey(sealed, privateKey, buildGrantAAD(...v))).toThrow();
  });

  it("empty AAD is refused (AAD can never be silently dropped)", () => {
    const { publicKey, privateKey } = generateKeypair();
    const k = generateSectionKey();
    expect(() => sealKey(k, publicKey, "")).toThrow();
    const sealed = sealKey(k, publicKey, "x");
    expect(() => unsealKey(sealed, privateKey, "")).toThrow();
  });

  it("malformed / truncated / wrong-version sealed input is rejected", () => {
    const { publicKey, privateKey } = generateKeypair();
    const sealed = Buffer.from(sealKey(generateSectionKey(), publicKey, "aad"), "base64");
    expect(() => unsealKey(sealed.subarray(0, sealed.length - 1).toString("base64"), privateKey, "aad")).toThrow();
    const v2 = Buffer.from(sealed);
    v2[0] = 2;
    expect(() => unsealKey(v2.toString("base64"), privateKey, "aad")).toThrow();
    expect(() => unsealKey("", privateKey, "aad")).toThrow();
  });

  it("bit flips anywhere in the sealed blob are rejected", () => {
    const { publicKey, privateKey } = generateKeypair();
    const sealed = Buffer.from(sealKey(generateSectionKey(), publicKey, "aad"), "base64");
    for (const i of [1, 20, 33, 44, 60, sealed.length - 1]) {
      const t = Buffer.from(sealed);
      t[i] ^= 1;
      expect(() => unsealKey(t.toString("base64"), privateKey, "aad")).toThrow();
    }
  });

  it("src_hash is not the raw section-key HMAC (key separation)", () => {
    const k = generateSectionKey();
    expect(hashLabel(k, "ct")).not.toBe(createHmac("sha256", k).update("ct").digest("base64"));
    expect(hashLabel(k, "ct")).toBe(hashLabel(k, "ct"));
  });

  it("label decrypt rejects short and wrong-key input", () => {
    const k = generateSectionKey();
    const aad = buildLabelAAD("o", "accounts", "accounts", 1, 1);
    expect(() => decryptLabel(k, "AAAA", aad)).toThrow();
    const ct = encryptLabel(k, "x", aad);
    expect(() => decryptLabel(generateSectionKey(), ct, aad)).toThrow();
    expect(decryptLabel(k, ct, aad)).toBe("x");
  });
});

describe("P2 review: grants, keys, withSectionKeys", () => {
  beforeEach(async () => {
    await resetFamilyTestDb();
  });

  it("provisioned grant is sealed to the VIEWER key: viewer unseals, owner key cannot", async () => {
    const t = await setup();
    const ownerKp = await createUserKeypairIfNeeded(db, t.ownerId, t.ownerDek);
    expect(ownerKp.x25519Pub).not.toBe(t.kp.x25519Pub);
    await provisionGrants(db, t.ownerId, t.ownerDek);

    const viewerPriv = (await getUserPrivateKeyHex(db, t.viewerId, t.viewerDek))!;
    const ownerPriv = (await getUserPrivateKeyHex(db, t.ownerId, t.ownerDek))!;
    const [grant] = await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, t.shareId));
    expect(grant.status).toBe("ready");
    const aad = buildGrantAAD(t.shareId, t.ownerId, t.viewerId, "accounts", grant.epoch);
    const k = unsealKey(grant.keySealed!, viewerPriv, aad);
    const stored = await getAndUnwrapSectionKey(db, t.ownerId, "accounts", t.ownerDek, grant.epoch);
    expect(k.equals(stored!)).toBe(true);
    expect(() => unsealKey(grant.keySealed!, ownerPriv, aad)).toThrow();
  });

  it("withSectionKeys yields real keys with the viewer private key and zeroes them after", async () => {
    const t = await setup();
    await provisionGrants(db, t.ownerId, t.ownerDek);
    const viewerPriv = (await getUserPrivateKeyHex(db, t.viewerId, t.viewerDek))!;
    let leaked: Buffer | undefined;
    const sections = await withSectionKeys(t.shareId, t.viewerId, viewerPriv, db, async (keys) => {
      leaked = keys.accounts;
      expect(keys.accounts.length).toBe(32);
      expect(keys.accounts.some((b) => b !== 0)).toBe(true);
      return Object.keys(keys);
    });
    expect(sections).toEqual(["accounts"]);
    expect(leaked!.every((b) => b === 0)).toBe(true);
  });

  it("withSectionKeys refuses non-active shares, other viewers, and ungranted sections", async () => {
    const t = await setup(["accounts"]);
    await provisionGrants(db, t.ownerId, t.ownerDek);
    const viewerPriv = (await getUserPrivateKeyHex(db, t.viewerId, t.viewerDek))!;
    // other user
    await expect(withSectionKeys(t.shareId, t.ownerId, viewerPriv, db, async () => 1)).rejects.toThrow();
    // wrong private key => no keys (generic labels), not an exception
    const other = generateKeypair();
    expect(await withSectionKeys(t.shareId, t.viewerId, other.privateKey, db, async (k) => Object.keys(k))).toEqual([]);
    // widen row in DB for a section the share does not cover: still not yielded
    await db.insert(familyKeyGrants).values({ shareId: t.shareId, section: "goals", epoch: 1, keySealed: "x", status: "ready" });
    expect(await withSectionKeys(t.shareId, t.viewerId, viewerPriv, db, async (k) => Object.keys(k))).toEqual(["accounts"]);
    // revoked / awaiting / suspended
    for (const status of ["revoked", "awaiting_owner_unlock", "suspended", "expired", "key_reset", "declined"] as const) {
      await db.update(familyShares).set({ status }).where(eq(familyShares.id, t.shareId));
      await expect(withSectionKeys(t.shareId, t.viewerId, viewerPriv, db, async () => 1)).rejects.toThrow();
    }
  });

  it("private key and section keys are wrapped with row-bound AAD (no swapping)", async () => {
    const t = await setup(["accounts", "goals"]);
    await provisionGrants(db, t.ownerId, t.ownerDek);
    // private key wrapped under viewer DEK cannot be unwrapped for a different user id
    const [kp] = await db.select().from(userKeypairs).where(eq(userKeypairs.userId, t.viewerId));
    await db.update(userKeypairs).set({ privWrapped: kp.privWrapped }).where(eq(userKeypairs.userId, t.viewerId));
    expect(await getUserPrivateKeyHex(db, t.viewerId, t.viewerDek)).not.toBeNull();
    const ownerKp = await createUserKeypairIfNeeded(db, t.ownerId, t.viewerDek);
    await db.update(userKeypairs).set({ privWrapped: kp.privWrapped }).where(eq(userKeypairs.userId, t.ownerId));
    expect(await getUserPrivateKeyHex(db, t.ownerId, t.viewerDek)).toBeNull();
    expect(ownerKp).toBeTruthy();
    // section key swap between sections is detected
    const keys = await db.select().from(familySectionKeys).where(eq(familySectionKeys.ownerId, t.ownerId));
    const acc = keys.find((k) => k.section === "accounts")!;
    const gl = keys.find((k) => k.section === "goals")!;
    await db.update(familySectionKeys).set({ keyWrapped: gl.keyWrapped })
      .where(and(eq(familySectionKeys.ownerId, t.ownerId), eq(familySectionKeys.section, "accounts")));
    expect(await getAndUnwrapSectionKey(db, t.ownerId, "accounts", t.ownerDek, acc.epoch)).toBeNull();
  });

  it("viewer without a keypair gets an awaiting_keys placeholder with no key material", async () => {
    const ownerId = await createTestUser("o1@x.com");
    const viewerId = await createTestUser("v1@x.com");
    const shareId = await createTestShare(ownerId, "v1@x.com", ["accounts"]);
    await db.update(familyShares).set({ viewerId, status: "active" }).where(eq(familyShares.id, shareId));
    await provisionGrants(db, ownerId, generateDEK());
    const [g] = await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, shareId));
    expect(g.status).toBe("awaiting_keys");
    expect(g.keySealed).toBeNull();
  });

  it("awaiting_owner_unlock viewers receive no sealed key", async () => {
    const t = await setup();
    await db.update(familyShares).set({ status: "awaiting_owner_unlock" }).where(eq(familyShares.id, t.shareId));
    await provisionGrants(db, t.ownerId, t.ownerDek);
    const [g] = await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, t.shareId));
    expect(g.keySealed).toBeNull();
  });

  it("finalizeGrants only finalizes live shares (revoked/declined/expired/pending/key_reset/suspended get 0)", async () => {
    for (const status of ["revoked", "declined", "expired", "pending", "key_reset", "suspended"] as const) {
      const t = await setup();
      await db.update(familyShares).set({ status }).where(eq(familyShares.id, t.shareId));
      await db.insert(familyKeyGrants).values({ shareId: t.shareId, section: "accounts", epoch: 1, status: "awaiting_keys" });
      expect(await finalizeGrants(db, t.shareId)).toBe(0);
      const [g] = await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, t.shareId));
      expect(g.status).toBe("awaiting_keys");
    }
    const live = await setup();
    await db.insert(familyKeyGrants).values({ shareId: live.shareId, section: "accounts", epoch: 1, status: "awaiting_keys" });
    expect(await finalizeGrants(db, live.shareId)).toBe(1);
  });

  it("markShareKeyReset refuses revoked shares and deletes grants for live ones", async () => {
    const t = await setup();
    await provisionGrants(db, t.ownerId, t.ownerDek);
    await db.update(familyShares).set({ status: "revoked" }).where(eq(familyShares.id, t.shareId));
    await expect(markShareKeyReset(db, t.shareId, t.ownerId)).rejects.toThrow();
    await db.update(familyShares).set({ status: "active" }).where(eq(familyShares.id, t.shareId));
    await markShareKeyReset(db, t.shareId, t.viewerId);
    expect((await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, t.shareId))).length).toBe(0);
  });
});

describe("P2 review: sweep", () => {
  beforeEach(async () => {
    await resetFamilyTestDb();
  });

  it("writes only registered-section labels; second sweep writes 0; plaintext never stored", async () => {
    const t = await setup(["accounts"]);
    const id = await addAccount(t.ownerId, t.ownerDek, "Secret Savings");
    await db.insert(goals).values({ userId: t.ownerId, type: "g", targetAmount: 1, nameCt: encryptField(t.ownerDek, "Goal Canary") });

    const r1 = await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    expect(r1.written).toBe(1);
    const r2 = await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    expect(r2.written).toBe(0);

    const rows = await labelsOf(t.ownerId);
    expect(rows.length).toBe(1); // goals section NOT shared -> no goal label
    expect(rows[0].entityId).toBe(id);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain("Secret Savings");
    expect(dump).not.toContain("Goal Canary");

    const k = (await getAndUnwrapSectionKey(db, t.ownerId, "accounts", t.ownerDek, rows[0].epoch))!;
    expect(decryptLabel(k, rows[0].labelCt, buildLabelAAD(t.ownerId, "accounts", "accounts", id, rows[0].epoch))).toBe("Secret Savings");
    // labels of other sections / rows / owners never decrypt under this AAD
    expect(() => decryptLabel(k, rows[0].labelCt, buildLabelAAD(t.ownerId, "goals", "accounts", id, rows[0].epoch))).toThrow();
    expect(() => decryptLabel(generateSectionKey(), rows[0].labelCt, buildLabelAAD(t.ownerId, "accounts", "accounts", id, rows[0].epoch))).toThrow();
  });

  it("rename propagates, deleted entities are pruned", async () => {
    const t = await setup();
    const id = await addAccount(t.ownerId, t.ownerDek, "Old Name");
    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    await db.update(accounts).set({ nameCt: encryptField(t.ownerDek, "New Name") }).where(eq(accounts.id, id));
    expect((await syncFamilyLabels(db, t.ownerId, t.ownerDek)).written).toBe(1);
    const [row] = await labelsOf(t.ownerId);
    const k = (await getAndUnwrapSectionKey(db, t.ownerId, "accounts", t.ownerDek, row.epoch))!;
    expect(decryptLabel(k, row.labelCt, buildLabelAAD(t.ownerId, "accounts", "accounts", id, row.epoch))).toBe("New Name");
    await db.delete(accounts).where(eq(accounts.id, id));
    const r = await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    expect(r.deleted).toBe(1);
    expect((await labelsOf(t.ownerId)).length).toBe(0);
  });

  it("concurrent sweeps produce exactly the rows of a single sweep (advisory lock)", async () => {
    const t = await setup();
    for (let i = 0; i < 40; i++) await addAccount(t.ownerId, t.ownerDek, `Acct ${i}`);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => syncFamilyLabels(db, t.ownerId, t.ownerDek)),
    );
    // serialized: exactly one of them did the work, the rest saw it already done
    expect(results.reduce((n, r) => n + r.written, 0)).toBe(40);
    const rows = await labelsOf(t.ownerId);
    expect(rows.length).toBe(40);
    const keys = await db.select().from(familySectionKeys).where(eq(familySectionKeys.ownerId, t.ownerId));
    expect(keys.length).toBe(1); // no duplicate/orphan section keys
    // every label decrypts under the single stored key
    const k = (await getAndUnwrapSectionKey(db, t.ownerId, "accounts", t.ownerDek, keys[0].epoch))!;
    for (const r of rows) {
      expect(() => decryptLabel(k, r.labelCt, buildLabelAAD(t.ownerId, "accounts", "accounts", r.entityId, r.epoch))).not.toThrow();
    }
  });

  it("owner advisory lock serializes same-owner work and does not block other owners", async () => {
    const events: string[] = [];
    const hold = (name: string, owner: string, ms: number) =>
      withOwnerLock(db, owner, async () => {
        events.push(`${name}:in`);
        await new Promise((r) => setTimeout(r, ms));
        events.push(`${name}:out`);
      });
    const a = randomUUID();
    const b = randomUUID();
    const p1 = hold("a1", a, 300);
    while (!events.includes("a1:in")) await new Promise((r) => setTimeout(r, 5));
    await Promise.all([p1, hold("a2", a, 10), hold("b1", b, 10)]);
    // a2 never starts before a1 finished (same owner)
    expect(events.indexOf("a2:in")).toBeGreaterThan(events.indexOf("a1:out"));
    // a different owner is not blocked by a1
    expect(events.indexOf("b1:in")).toBeLessThan(events.indexOf("a1:out"));
  });

  it("no live shares: sweep purges section keys and sidecar", async () => {
    const t = await setup();
    await addAccount(t.ownerId, t.ownerDek, "A");
    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    expect((await labelsOf(t.ownerId)).length).toBe(1);
    await db.update(familyShares).set({ status: "revoked" }).where(eq(familyShares.id, t.shareId));
    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    expect((await labelsOf(t.ownerId)).length).toBe(0);
    expect((await db.select().from(familySectionKeys).where(eq(familySectionKeys.ownerId, t.ownerId))).length).toBe(0);
    expect((await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, t.shareId))).length).toBe(0);
  });

  it("undecryptable source names are skipped, never written as plaintext or crash", async () => {
    const t = await setup();
    await addAccount(t.ownerId, generateDEK(), "Encrypted under another DEK");
    const r = await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    expect(r.written).toBe(0);
  });

  it("enqueueFamilySweep never throws into callers (bad args, missing adapter)", () => {
    expect(() => enqueueFamilySweep("", Buffer.alloc(0))).not.toThrow();
    // @ts-expect-error deliberately wrong type
    expect(() => enqueueFamilySweep("u", null)).not.toThrow();
    expect(() => enqueueFamilySweep("u", generateDEK())).not.toThrow();
  });
});

describe("P2 review: rotation", () => {
  beforeEach(async () => {
    await resetFamilyTestDb();
  });

  async function addViewer(ownerId: string, sections: string[]) {
    const email = `w${randomUUID().slice(0, 6)}@x.com`;
    const viewerId = await createTestUser(email);
    const viewerDek = generateDEK();
    await createUserKeypairIfNeeded(db, viewerId, viewerDek);
    const shareId = await createTestShare(ownerId, email, sections);
    await db.update(familyShares).set({ viewerId, status: "active" }).where(eq(familyShares.id, shareId));
    return { viewerId, viewerDek, shareId };
  }

  async function viewerKey(shareId: string, viewerId: string, viewerDek: Buffer) {
    const priv = (await getUserPrivateKeyHex(db, viewerId, viewerDek))!;
    let key: Buffer | undefined;
    await withSectionKeys(shareId, viewerId, priv, db, async (k) => {
      key = k.accounts ? Buffer.from(k.accounts) : undefined;
    });
    return key;
  }

  it("rotation bumps epoch, re-keys sidecar, re-seals only ACTIVE viewers; revoked old key is useless", async () => {
    const t = await setup();
    const b = await addViewer(t.ownerId, ["accounts"]);
    const id = await addAccount(t.ownerId, t.ownerDek, "Joint");
    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    const oldA = (await viewerKey(t.shareId, t.viewerId, t.viewerDek))!;
    expect(oldA).toBeDefined();
    const [before] = await labelsOf(t.ownerId);
    expect(before.epoch).toBe(1);

    // revoke A, rotate (owner session)
    await db.update(familyShares).set({ status: "revoked" }).where(eq(familyShares.id, t.shareId));
    const newEpoch = await rotateEpoch(db, t.ownerId, "accounts", t.ownerDek);
    expect(newEpoch).toBe(2);

    const [after] = await labelsOf(t.ownerId);
    expect(after.epoch).toBe(2);
    const aad = buildLabelAAD(t.ownerId, "accounts", "accounts", id, 2);
    // revoked viewer's old key fails on the re-encrypted row
    expect(() => decryptLabel(oldA, after.labelCt, aad)).toThrow();
    // revoked grants deleted; remaining viewer re-sealed at epoch 2 and decrypts
    expect((await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, t.shareId))).length).toBe(0);
    const [gb] = await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, b.shareId));
    expect(gb.epoch).toBe(2);
    const newB = (await viewerKey(b.shareId, b.viewerId, b.viewerDek))!;
    expect(decryptLabel(newB, after.labelCt, aad)).toBe("Joint");
    // old epoch key row gone
    const keys = await db.select().from(familySectionKeys).where(eq(familySectionKeys.ownerId, t.ownerId));
    expect(keys.map((k) => k.epoch)).toEqual([2]);
    // revoked viewer is not re-sealed even if their keypair exists
    expect(await viewerKey(t.shareId, t.viewerId, t.viewerDek).catch(() => undefined)).toBeUndefined();
  });

  it("viewer-initiated leave (suspended share still holding grants): next sweep rotates", async () => {
    const t = await setup();
    const b = await addViewer(t.ownerId, ["accounts"]);
    await addAccount(t.ownerId, t.ownerDek, "Joint");
    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    const leaverKey = (await viewerKey(t.shareId, t.viewerId, t.viewerDek))!;
    await db.update(familyShares).set({ status: "suspended" }).where(eq(familyShares.id, t.shareId));

    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    const [row] = await labelsOf(t.ownerId);
    expect(row.epoch).toBe(2);
    expect(() => decryptLabel(leaverKey, row.labelCt, buildLabelAAD(t.ownerId, "accounts", "accounts", row.entityId, 2))).toThrow();
    expect((await db.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, t.shareId))).length).toBe(0);
    expect(await viewerKey(b.shareId, b.viewerId, b.viewerDek)).toBeDefined();
  });

  it("rotation with no remaining viewers deletes section key and sidecar", async () => {
    const t = await setup();
    await addAccount(t.ownerId, t.ownerDek, "Solo");
    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    await db.update(familyShares).set({ status: "revoked" }).where(eq(familyShares.id, t.shareId));
    await rotateEpoch(db, t.ownerId, "accounts", t.ownerDek);
    expect((await labelsOf(t.ownerId)).length).toBe(0);
    expect((await db.select().from(familySectionKeys).where(eq(familySectionKeys.ownerId, t.ownerId))).length).toBe(0);
  });

  it("rotation of a section does not touch other sections' keys", async () => {
    const t = await setup(["accounts", "goals"]);
    await syncFamilyLabels(db, t.ownerId, t.ownerDek);
    const goalKeyBefore = await getAndUnwrapSectionKey(db, t.ownerId, "goals", t.ownerDek, 1);
    await rotateEpoch(db, t.ownerId, "accounts", t.ownerDek);
    const goalKeyAfter = await getAndUnwrapSectionKey(db, t.ownerId, "goals", t.ownerDek, 1);
    expect(goalKeyAfter!.equals(goalKeyBefore!)).toBe(true);
  });
});
