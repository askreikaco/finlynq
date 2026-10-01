/**
 * Shared helpers for the Family Wealth e2e (e2e/family-wealth.spec.ts, e2e/family-perf.spec.ts).
 *
 * Everything goes through the app's own HTTP API (register, verify-email, MFA setup, login,
 * accounts/goals/loans/transactions, family manage + overview). The only out-of-band channels:
 *   - invite / verification mails: the app appends them to the JSONL file named by
 *     FINLYNQ_EMAIL_CAPTURE (test-only hook in src/lib/email.ts, inert in production);
 *   - direct SQL on the throwaway *_test database for assertions (key epochs, grants).
 * Secrets are never read from .env: playwright.family.config.ts generates throwaway values.
 */
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { request, type APIRequestContext, type APIResponse, expect } from "@playwright/test";
import { TOTP, Secret } from "otpauth";
import pg from "pg";

export const BASE_URL = process.env.BASE_URL || "http://localhost:3917";
export const CAPTURE_FILE = process.env.FINLYNQ_EMAIL_CAPTURE || "";
export const DATABASE_URL = process.env.DATABASE_URL || "";

if (!/\/[^/]*_test([?#]|$)/.test(DATABASE_URL)) {
  throw new Error("family e2e requires DATABASE_URL to point at a *_test database");
}

export const PASSWORD = "Corr3ct-Horse-Battery-Staple!";

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export function capturedMails(): Mail[] {
  if (!CAPTURE_FILE || !existsSync(CAPTURE_FILE)) return [];
  return readFileSync(CAPTURE_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Mail);
}

/**
 * Poll the capture file until a mail to `to` (index >= `after`) matching `pick` shows up
 * (mails are fire-and-forget). Newest first.
 */
export async function waitForMail<T>(
  to: string,
  pick: (m: Mail) => T | null | undefined,
  opts: { after?: number; timeoutMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  for (;;) {
    const all = capturedMails();
    for (let i = all.length - 1; i >= (opts.after ?? 0); i--) {
      if (all[i].to.toLowerCase() !== to.toLowerCase()) continue;
      const v = pick(all[i]);
      if (v) return v;
    }
    if (Date.now() > deadline) throw new Error(`no matching mail to ${to}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

export const inviteTokenFrom = (m: Mail) => (m.text ?? m.html).match(/token=([0-9a-f]{64})/)?.[1] ?? null;

let ipSeq = 0;
/** Unique client IP per call: register/login limiters are per-IP, in-process, and tests are fast. */
const nextIp = () => `10.${(process.pid % 200) + 1}.${Math.floor(ipSeq / 250) % 250}.${(ipSeq++ % 250) + 1}`;

const jsonHeaders = (ip: string) => ({ origin: BASE_URL, "x-forwarded-for": ip });

export const totp = (secret: string, offsetSteps = 0) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({
    timestamp: Date.now() + offsetSteps * 30_000,
  });

export class TestUser {
  ctx!: APIRequestContext;
  readonly ip = nextIp();
  mfaSecret: string | null = null;
  id = "";
  constructor(
    readonly name: string,
    public email: string,
    readonly username: string,
  ) {}

  static async register(prefix: string): Promise<TestUser> {
    const tag = `${prefix}${randomBytes(4).toString("hex")}`;
    const u = new TestUser(`${prefix} ${tag}`, `${tag}@fam6.test`, tag);
    u.ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await u.ctx.post("/api/auth/register", {
      headers: jsonHeaders(u.ip),
      data: { username: u.username, email: u.email, password: PASSWORD, displayName: u.name },
    });
    expect(res.status(), await res.text()).toBe(201);
    u.id = (await res.json()).userId;
    // Verify the email through the mailed link (accept requires a verified address).
    const link = await waitForMail(u.email, (m) => (m.text ?? m.html).match(/verify-email\?token=([^"&\s<]+)/)?.[1]);
    const v = await u.ctx.get(`/api/auth/verify-email?token=${link}`, { maxRedirects: 0 });
    expect([200, 302, 307], `verify-email ${v.status()}`).toContain(v.status());
    return u;
  }

  req(method: "get" | "post" | "put" | "delete", path: string, data?: unknown): Promise<APIResponse> {
    return this.ctx[method](path, { headers: jsonHeaders(this.ip), ...(data === undefined ? {} : { data }) });
  }
  get = (path: string) => this.req("get", path);
  post = (path: string, data?: unknown) => this.req("post", path, data);
  put = (path: string, data?: unknown) => this.req("put", path, data);

  async json<T = any>(res: APIResponse, expectStatus = 200): Promise<T> {
    const text = await res.text();
    expect(res.status(), `${res.url()} -> ${text.slice(0, 300)}`).toBe(expectStatus);
    return JSON.parse(text) as T;
  }

  /** Enable TOTP with the app's own setup API, then sign in again so the session carries mfa. */
  async enableTotp(): Promise<void> {
    const gen = await this.json(await this.post("/api/auth/mfa/setup", { action: "generate" }));
    this.mfaSecret = gen.secret;
    await this.json(
      await this.post("/api/auth/mfa/setup", {
        action: "enable",
        secret: gen.secret,
        code: totp(gen.secret),
        currentPassword: PASSWORD,
      }),
    );
    await this.login();
  }

  /** Fresh browser-like context, password login (+ TOTP when enabled). Triggers the login sweep. */
  async login(): Promise<void> {
    await this.ctx?.dispose();
    this.ctx = await request.newContext({ baseURL: BASE_URL });
    const res = await this.post("/api/auth/login", { identifier: this.username, password: PASSWORD, trustDevice: false });
    const body = await this.json(res);
    if (body.mfaRequired) {
      expect(this.mfaSecret).toBeTruthy();
      // Next time-step: the enable call already consumed the current code.
      await this.json(
        await this.post("/api/auth/mfa/verify", {
          mfaPendingToken: body.mfaPendingToken,
          code: totp(this.mfaSecret!, 1),
          trustDevice: false,
        }),
      );
    }
  }

  async dispose() {
    await this.ctx?.dispose();
  }

  // ---- data seeding through the public API ----
  async createAccount(name: string, opts: { type?: string; group?: string; currency?: string } = {}): Promise<number> {
    const body = await this.json(
      await this.post("/api/accounts", {
        name,
        type: opts.type ?? "A",
        group: opts.group ?? "Banking",
        currency: opts.currency ?? "USD",
      }),
      201,
    );
    return body.id;
  }

  async createCategory(name: string, type = "E", group = "Food"): Promise<number> {
    return (await this.json(await this.post("/api/categories", { name, type, group }), 201)).id;
  }

  async addTransaction(accountId: number, categoryId: number, amount: number, extra: Record<string, unknown> = {}) {
    const res = await this.post("/api/transactions", {
      date: new Date().toISOString().slice(0, 10),
      accountId,
      categoryId,
      amount,
      currency: "USD",
      ...extra,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }

  overview = (qs = "") => this.get(`/api/family/overview${qs}`);
}

// ---- direct DB access for assertions / perf seeding ----
export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Poll until `fn` returns truthy (login / edit sweeps are fire-and-forget). */
export async function eventually<T>(fn: () => Promise<T | false | null | undefined>, what: string, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

export interface Member {
  id: string;
  relation: "me" | "shared";
  name: string;
  sections: Record<string, any>;
  notShared: string[];
  unavailable: string[];
  genericLabels: boolean;
  partial: boolean;
}
export const sharedMembers = (body: { members: Member[] }) => body.members.filter((m) => m.relation === "shared");
