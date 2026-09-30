/**
 * Google OIDC (OpenID Connect) utilities for OAuth 2.0 + PKCE flow.
 *
 * Uses `jose` for ID token verification with remote JWKS caching.
 * No external dependencies beyond what's already in package.json.
 *
 * Flow:
 * 1. buildAuthUrl generates the authorization URL with PKCE and nonce.
 * 2. exchangeCode exchanges the auth code for tokens.
 * 3. verifyIdToken verifies and decodes the ID token.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import crypto from "crypto";

const GOOGLE_OIDC_ISSUER = "https://accounts.google.com";
const GOOGLE_DISCOVERY_URL =
  "https://accounts.google.com/.well-known/openid-configuration";

interface GoogleDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

// Cached discovery document and JWKS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (!_g.__pfGoogleDiscovery) {
  _g.__pfGoogleDiscovery = null;
  _g.__pfGoogleJwks = null;
}

/**
 * Fetch and cache the Google OIDC discovery document.
 * Called once per process; subsequent calls return the cached copy.
 */
async function getGoogleDiscovery(): Promise<GoogleDiscovery> {
  if (_g.__pfGoogleDiscovery) {
    return _g.__pfGoogleDiscovery;
  }

  const resp = await fetch(GOOGLE_DISCOVERY_URL);
  if (!resp.ok) {
    throw new Error(`Google discovery fetch failed: ${resp.status}`);
  }

  const discovery: GoogleDiscovery = await resp.json();
  _g.__pfGoogleDiscovery = discovery;
  return discovery;
}

/**
 * Create/cache the JWKS key set for verifying Google ID tokens.
 * `jose` calls this lazily on the first ID token verification.
 */
async function getGoogleJwks() {
  if (_g.__pfGoogleJwks) {
    return _g.__pfGoogleJwks;
  }

  const discovery = await getGoogleDiscovery();
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  _g.__pfGoogleJwks = jwks;
  return jwks;
}

/**
 * Return true if Google OAuth is configured (both client ID and secret present).
 */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Derive the OAuth redirect URI from APP_URL.
 * Example: https://money.reika.vn/api/auth/google/callback
 */
export function redirectUri(): string {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    throw new Error("APP_URL is not set");
  }
  return `${appUrl}/api/auth/google/callback`;
}

/**
 * PKCE code challenge helper: S256 SHA256 challenge from a code_verifier.
 * code_verifier is a 43-128 character string (usually base64url random).
 * code_challenge = base64url(sha256(code_verifier))
 */
function pkceChallenge(verifier: string): string {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Base64url encode (RFC 4648 §5) without padding.
 */
function base64UrlEncode(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Base64url decode without padding.
 */
function base64UrlDecode(str: string): Buffer {
  // Add padding if needed
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Generate a random base64url string of the given byte length.
 */
function randomBase64Url(bytes: number): string {
  return base64UrlEncode(crypto.randomBytes(bytes));
}

/**
 * Build the Google authorization URL with PKCE and nonce.
 *
 * Returns the URL and also the generated state, nonce, and code_verifier
 * which should be stored in a signed cookie for verification in the callback.
 *
 * @param state - Random state parameter (typically 32 bytes base64url)
 * @param nonce - Random nonce (typically 32 bytes base64url)
 * @param codeChallenge - SHA256 PKCE challenge (base64url)
 */
export async function buildAuthUrl(params: {
  state: string;
  nonce: string;
  codeChallenge: string;
}): Promise<string> {
  const discovery = await getGoogleDiscovery();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set");
  }

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  return url.toString();
}

/**
 * Exchange an auth code for tokens via the token endpoint.
 * Returns { access_token, id_token, ... }
 */
export async function exchangeCode(params: {
  code: string;
  codeVerifier: string;
}): Promise<{ access_token: string; id_token: string; token_type: string }> {
  const discovery = await getGoogleDiscovery();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google client ID or secret is not configured");
  }

  const resp = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      code_verifier: params.codeVerifier,
    }).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed: ${resp.status} ${text}`);
  }

  return resp.json();
}

/**
 * Google ID token claims (subset of standard JWT claims).
 */
export interface GoogleIdTokenClaims {
  sub: string; // Google subject ID (immutable)
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  locale?: string;
}

/**
 * Verify and decode a Google ID token.
 * Checks issuer, audience, signature, expiration, and nonce.
 *
 * @param idToken - The ID token from the token endpoint
 * @param nonce - The nonce that was sent in the authorization request
 * @returns The decoded claims or null if verification fails
 */
export async function verifyIdToken(
  idToken: string,
  nonce: string
): Promise<GoogleIdTokenClaims | null> {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID is not set");
    }

    const jwks = await getGoogleJwks();

    // jose requires two common issuer formats for Google
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: [GOOGLE_OIDC_ISSUER, "accounts.google.com"],
      audience: clientId,
      algorithms: ["RS256"],
    });

    // Verify nonce claim with timing-safe comparison
    const payloadNonce = payload.nonce as string | undefined;
    if (!payloadNonce || payloadNonce.length !== nonce.length) {
      console.warn("ID token nonce mismatch");
      return null;
    }
    if (!crypto.timingSafeEqual(
      Buffer.from(payloadNonce),
      Buffer.from(nonce)
    )) {
      console.warn("ID token nonce mismatch");
      return null;
    }

    // Extract and validate the claims we care about
    const claims: GoogleIdTokenClaims = {
      sub: payload.sub as string,
      email: payload.email as string,
      email_verified: payload.email_verified === true,
      name: payload.name as string | undefined,
      picture: payload.picture as string | undefined,
      locale: payload.locale as string | undefined,
    };

    if (!claims.sub || !claims.email) {
      console.warn("ID token missing sub or email");
      return null;
    }

    return claims;
  } catch (error) {
    console.warn("ID token verification failed:", error);
    return null;
  }
}

/**
 * Generate a code_verifier for PKCE.
 * Must be 43-128 characters; we generate 64 bytes base64url (~86 chars).
 */
export function generateCodeVerifier(): string {
  return randomBase64Url(64);
}

/**
 * Export the PKCE challenge helper for tests and for building auth URLs.
 */
export function generateCodeChallenge(verifier: string): string {
  return pkceChallenge(verifier);
}
