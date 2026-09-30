/**
 * Tests for Google OIDC implementation.
 *
 * Covers:
 * - buildAuthUrl generates correct parameters (client_id, redirect_uri, scope, state, nonce, code_challenge S256, prompt)
 * - PKCE challenge generation and verification (S256 = base64url(sha256(verifier)))
 * - exchangeCode makes correct token endpoint request
 * - verifyIdToken validates ID token with mocked JWKS
 * - verifyIdToken rejects wrong nonce, aud, iss, or expired tokens
 * - isGoogleConfigured checks for client ID and secret
 * - redirectUri constructs from APP_URL
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "https://money.reika.vn";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Track mocked discovery responses
let discoveryDocument: any = null;
let mockJwks: any = null;

vi.mock("jose", () => {
  return {
    createRemoteJWKSet: vi.fn(() => mockJwks),
    jwtVerify: vi.fn(async (token: string, _jwks: any, options: any) => {
      // Simple mock: parse token as if it were JSON.
      // In real scenario, jose would verify the signature.
      try {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid token format");

        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());

        // Check algorithms if specified (must be RS256)
        if (options.algorithms && !options.algorithms.includes("RS256")) {
          throw new Error("Unsupported algorithm");
        }
        // If token claims HS256 but we require RS256, reject
        if (options.algorithms?.includes("RS256")) {
          const header = JSON.parse(Buffer.from(parts[0], "base64").toString());
          if (header.alg === "HS256") {
            throw new Error("Unsupported algorithm");
          }
        }

        // Check issuer
        if (
          options.issuer &&
          !options.issuer.includes(payload.iss)
        ) {
          throw new Error("Invalid issuer");
        }

        // Check audience
        if (options.audience && payload.aud !== options.audience) {
          throw new Error("Invalid audience");
        }

        // Check expiration
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
          throw new Error("Token expired");
        }

        return { payload };
      } catch (err) {
        throw err;
      }
    }),
  };
});

// Helper to create properly base64url-encoded tokens
function createIdToken(payload: any, headerAlg: string = "RS256"): string {
  const header = { alg: headerAlg, typ: "JWT" };
  const headerEncoded = Buffer.from(JSON.stringify(header)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${headerEncoded}.${payloadEncoded}.signature`;
}

// Clear global caches before each test
function clearGoogleCaches() {
  const _g = globalThis as any;
  _g.__pfGoogleDiscovery = null;
  _g.__pfGoogleJwks = null;
}

describe("Google OIDC", () => {
  beforeEach(() => {
    clearGoogleCaches();
    mockFetch.mockClear();
    discoveryDocument = {
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
      jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
    };
    mockJwks = {}; // Placeholder JWKS object
  });

  afterEach(() => {
    clearGoogleCaches();
  });

  describe("isGoogleConfigured", () => {
    it("should return true when both client ID and secret are set", async () => {
      const { isGoogleConfigured } = await import("@/lib/auth/google-oidc");
      expect(isGoogleConfigured()).toBe(true);
    });

    it("should return false when client ID is missing", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      // Need to clear the module cache to re-evaluate
      vi.resetModules();
      process.env.GOOGLE_CLIENT_ID = "";
      const { isGoogleConfigured } = await import("@/lib/auth/google-oidc");
      expect(isGoogleConfigured()).toBe(false);
      process.env.GOOGLE_CLIENT_ID = "test-client-id";
    });
  });

  describe("redirectUri", () => {
    it("should construct redirect URI from APP_URL", async () => {
      const { redirectUri } = await import("@/lib/auth/google-oidc");
      expect(redirectUri()).toBe("https://money.reika.vn/api/auth/google/callback");
    });

    it("should throw if APP_URL is not set", async () => {
      delete process.env.APP_URL;
      vi.resetModules();
      const { redirectUri } = await import("@/lib/auth/google-oidc");
      expect(() => redirectUri()).toThrow("APP_URL is not set");
      process.env.APP_URL = "https://money.reika.vn";
    });
  });

  describe("generateCodeVerifier and generateCodeChallenge", () => {
    it("should generate a valid code verifier (base64url, 43-128 chars)", async () => {
      const { generateCodeVerifier } = await import("@/lib/auth/google-oidc");
      const verifier = generateCodeVerifier();
      expect(typeof verifier).toBe("string");
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
      // Should be base64url (no +, /, =)
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate consistent S256 challenge from verifier", async () => {
      const { generateCodeChallenge } = await import("@/lib/auth/google-oidc");
      const verifier = "test-verifier-string-32-bytes-long-exactly";
      const challenge = generateCodeChallenge(verifier);

      // Manually compute expected challenge
      const hash = crypto.createHash("sha256").update(verifier).digest();
      const expected = Buffer.from(hash)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

      expect(challenge).toBe(expected);
    });
  });

  describe("buildAuthUrl", () => {
    it("should generate authorization URL with correct parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      const { buildAuthUrl } = await import("@/lib/auth/google-oidc");
      const state = "test-state";
      const nonce = "test-nonce";
      const codeChallenge = "test-challenge";

      const url = await buildAuthUrl({ state, nonce, codeChallenge });

      const parsed = new URL(url);
      expect(parsed.hostname).toBe("accounts.google.com");
      expect(parsed.pathname).toBe("/o/oauth2/v2/auth");
      expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
      expect(parsed.searchParams.get("redirect_uri")).toBe("https://money.reika.vn/api/auth/google/callback");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("scope")).toBe("openid email profile");
      expect(parsed.searchParams.get("state")).toBe(state);
      expect(parsed.searchParams.get("nonce")).toBe(nonce);
      expect(parsed.searchParams.get("code_challenge")).toBe(codeChallenge);
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("prompt")).toBe("select_account");
    });

    it("should cache the discovery document", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      const { buildAuthUrl } = await import("@/lib/auth/google-oidc");
      await buildAuthUrl({
        state: "state1",
        nonce: "nonce1",
        codeChallenge: "challenge1",
      });

      mockFetch.mockClear();

      // Second call should use cache, no fetch
      await buildAuthUrl({
        state: "state2",
        nonce: "nonce2",
        codeChallenge: "challenge2",
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("exchangeCode", () => {
    it("should exchange auth code for tokens", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => discoveryDocument,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "test-access-token",
            id_token: "test-id-token",
            token_type: "Bearer",
          }),
        });

      const { exchangeCode } = await import("@/lib/auth/google-oidc");
      const result = await exchangeCode({
        code: "test-auth-code",
        codeVerifier: "test-verifier",
      });

      expect(result.access_token).toBe("test-access-token");
      expect(result.id_token).toBe("test-id-token");
      expect(result.token_type).toBe("Bearer");

      // Verify the token endpoint call
      const tokenCall = mockFetch.mock.calls[1];
      expect(tokenCall[0]).toBe(discoveryDocument.token_endpoint);
      expect(tokenCall[1].method).toBe("POST");
      expect(tokenCall[1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

      const body = new URLSearchParams(tokenCall[1].body);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("test-auth-code");
      expect(body.get("client_id")).toBe("test-client-id");
      expect(body.get("client_secret")).toBe("test-client-secret");
      expect(body.get("code_verifier")).toBe("test-verifier");
    });

    it("should throw on token endpoint failure", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => discoveryDocument,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => "invalid_grant",
        });

      const { exchangeCode } = await import("@/lib/auth/google-oidc");
      await expect(
        exchangeCode({ code: "bad-code", codeVerifier: "verifier" })
      ).rejects.toThrow(/Token exchange failed/);
    });
  });

  describe("verifyIdToken", () => {
    it("should verify a valid ID token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      // Create a mock ID token with proper claims
      const payload = {
        sub: "google-user-id-123",
        email: "user@example.com",
        email_verified: true,
        name: "Test User",
        picture: "https://example.com/photo.jpg",
        locale: "en",
        iss: "https://accounts.google.com",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        nonce: "test-nonce",
      };

      const idToken = createIdToken(payload);

      const { verifyIdToken } = await import("@/lib/auth/google-oidc");
      const result = await verifyIdToken(idToken, "test-nonce");

      expect(result).not.toBeNull();
      expect(result?.sub).toBe("google-user-id-123");
      expect(result?.email).toBe("user@example.com");
      expect(result?.email_verified).toBe(true);
      expect(result?.name).toBe("Test User");
    });

    it("should reject token with wrong nonce", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      const payload = {
        sub: "google-user-id-123",
        email: "user@example.com",
        email_verified: true,
        iss: "https://accounts.google.com",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: "wrong-nonce",
      };

      const idToken = createIdToken(payload);

      const { verifyIdToken } = await import("@/lib/auth/google-oidc");
      const result = await verifyIdToken(idToken, "expected-nonce");

      expect(result).toBeNull();
    });

    it("should reject token with wrong audience", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      const payload = {
        sub: "google-user-id-123",
        email: "user@example.com",
        email_verified: true,
        iss: "https://accounts.google.com",
        aud: "wrong-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: "test-nonce",
      };

      const idToken = `header.${Buffer.from(JSON.stringify(payload)).toString("base64")}.signature`;

      const { verifyIdToken } = await import("@/lib/auth/google-oidc");
      const result = await verifyIdToken(idToken, "test-nonce");

      expect(result).toBeNull();
    });

    it("should reject expired token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      const payload = {
        sub: "google-user-id-123",
        email: "user@example.com",
        email_verified: true,
        iss: "https://accounts.google.com",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        nonce: "test-nonce",
      };

      const idToken = `header.${Buffer.from(JSON.stringify(payload)).toString("base64")}.signature`;

      const { verifyIdToken } = await import("@/lib/auth/google-oidc");
      const result = await verifyIdToken(idToken, "test-nonce");

      expect(result).toBeNull();
    });

    it("should reject token missing email or sub", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      const payload = {
        sub: "google-user-id-123",
        // Missing email
        iss: "https://accounts.google.com",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: "test-nonce",
      };

      const idToken = `header.${Buffer.from(JSON.stringify(payload)).toString("base64")}.signature`;

      const { verifyIdToken } = await import("@/lib/auth/google-oidc");
      const result = await verifyIdToken(idToken, "test-nonce");

      expect(result).toBeNull();
    });

    it("should reject HS256-signed token (require RS256)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => discoveryDocument,
      });

      // Create a token with HS256 algorithm header
      const payload = {
        sub: "google-user-id-123",
        email: "user@example.com",
        email_verified: true,
        iss: "https://accounts.google.com",
        aud: "test-client-id",
        exp: Math.floor(Date.now() / 1000) + 3600,
        nonce: "test-nonce",
      };
      const idToken = createIdToken(payload, "HS256");

      const { verifyIdToken } = await import("@/lib/auth/google-oidc");
      const result = await verifyIdToken(idToken, "test-nonce");

      expect(result).toBeNull();
    });
  });
});
