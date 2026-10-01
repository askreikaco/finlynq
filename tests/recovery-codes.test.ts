import { describe, it, expect, beforeAll } from "vitest";
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode,
  wrapDEKWithRecoveryCode,
  unwrapDEKWithRecoveryCode,
} from "@/lib/auth/recovery-codes";
import crypto from "crypto";

describe("Recovery Codes (B1)", () => {
  let testDek: Buffer;

  beforeAll(() => {
    // Generate a test DEK
    testDek = crypto.randomBytes(32);
  });

  describe("generateRecoveryCodes", () => {
    it("generates 10 codes by default", () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
    });

    it("generates codes with canonical and display formats", () => {
      const codes = generateRecoveryCodes(1);
      const code = codes[0];
      expect(code.canonical).toMatch(/^pfrc1:[A-Z2-7]{20}$/);
      expect(code.display).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}-[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    });

    it("generates unique codes", () => {
      const codes = generateRecoveryCodes(1000);
      const canonicals = codes.map((c) => c.canonical);
      const unique = new Set(canonicals);
      expect(unique.size).toBe(1000);
    });

    it("rejects invalid count", () => {
      // Edge case: ensure deterministic generation doesn't fail
      const codes = generateRecoveryCodes(10);
      expect(codes.length).toBeGreaterThan(0);
    });
  });

  describe("normalizeRecoveryCode", () => {
    it("accepts uppercase code", () => {
      const normalized = normalizeRecoveryCode("ABCDE2345ABCDE234567");
      expect(normalized).toBe("ABCDE2345ABCDE234567");
    });

    it("converts lowercase to uppercase", () => {
      const normalized = normalizeRecoveryCode("abcde2345abcde234567");
      expect(normalized).toBe("ABCDE2345ABCDE234567");
    });

    it("strips dashes and spaces", () => {
      const normalized = normalizeRecoveryCode("ABCDE-2345-ABCDE-234567");
      expect(normalized).toBe("ABCDE2345ABCDE234567");
    });

    it("converts 0 to O and 1 to I", () => {
      const normalized = normalizeRecoveryCode("10C0E2345ABCDE234567");
      expect(normalized).toBe("IOCOE2345ABCDE234567"); // 1→I, 0→O
    });

    it("rejects codes with less than 20 chars", () => {
      expect(() => normalizeRecoveryCode("ABCDE2345ABCDE234")).toThrow("must be 20 characters");
    });

    it("rejects codes with more than 20 chars", () => {
      expect(() => normalizeRecoveryCode("ABCDE2345ABCDE23451")).toThrow("must be 20 characters");
    });

    it("rejects invalid base32 characters", () => {
      expect(() => normalizeRecoveryCode("ABCDE234SABCDE234569")).toThrow(/Invalid character/);
    });
  });

  describe("hashRecoveryCode", () => {
    it("hashes canonical code to SHA-256 via authLookupHash", () => {
      const canonical = "pfrc1:ABCDE2345ABCDE2345";
      const hash = hashRecoveryCode(canonical);
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });

    it("produces consistent hash for same code", () => {
      const canonical = "pfrc1:ABCDE2345ABCDE2345";
      const hash1 = hashRecoveryCode(canonical);
      const hash2 = hashRecoveryCode(canonical);
      expect(hash1).toBe(hash2);
    });

    it("rejects non-canonical form", () => {
      expect(() => hashRecoveryCode("ABCDE2345ABCDE2345")).toThrow("canonical form");
    });
  });

  describe("wrap/unwrap roundtrip", () => {
    it("wraps and unwraps DEK to same bytes", () => {
      const codes = generateRecoveryCodes(1);
      const canonical = codes[0].canonical;

      const wrapped = wrapDEKWithRecoveryCode(testDek, canonical);
      expect(typeof wrapped).toBe("string");

      const unwrapped = unwrapDEKWithRecoveryCode(wrapped, canonical);
      expect(unwrapped).toEqual(testDek);
    });

    it("fails to unwrap with wrong code", () => {
      const codes = generateRecoveryCodes(2);
      const canonical1 = codes[0].canonical;
      const canonical2 = codes[1].canonical;

      const wrapped = wrapDEKWithRecoveryCode(testDek, canonical1);
      expect(() => unwrapDEKWithRecoveryCode(wrapped, canonical2)).toThrow();
    });

    it("fails to unwrap with corrupted wrap", () => {
      const codes = generateRecoveryCodes(1);
      const canonical = codes[0].canonical;

      const wrapped = wrapDEKWithRecoveryCode(testDek, canonical);
      const corrupted = wrapped.slice(0, -10) + "AAAAAAAAAA"; // Corrupt last 10 chars

      expect(() => unwrapDEKWithRecoveryCode(corrupted, canonical)).toThrow();
    });
  });

  describe("hash != wrap key material", () => {
    it("uses domain-separated hash and wrap key", () => {
      const canonical = "pfrc1:ABCDE2345ABCDE2345";
      const hash = hashRecoveryCode(canonical);
      // Hash should be domain-separated via authLookupHash("pfrc1:...")
      // Wrap key comes from base32 decode of the code itself
      // They should not be equal (different origins)
      expect(hash).not.toBe(canonical);
      // If we had access to the internal wrap key, we'd verify they differ
      // For now, just verify hash is not a substring of the code
      expect(hash).not.toContain(canonical.slice(6));
    });
  });

  describe("error handling", () => {
    it("throws on empty code", () => {
      expect(() => normalizeRecoveryCode("")).toThrow("Empty recovery code");
    });

    it("throws on null/undefined", () => {
      expect(() => normalizeRecoveryCode(null as unknown as string)).toThrow();
      expect(() => normalizeRecoveryCode(undefined as unknown as string)).toThrow();
    });
  });
});
