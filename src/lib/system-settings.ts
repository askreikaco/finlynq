/**
 * DB-backed admin settings (email transport). Rows live in `system_settings`
 * (migration 20261004_reika_system_settings.sql), values are `ss1:` ciphertext
 * (crypto/system-settings-envelope.ts). Resolution order is applied in email.ts:
 * DB value overrides env; an empty table changes nothing.
 *
 * Read path is fail-open to env: any DB or decrypt failure warns (key NAME only,
 * never a value) and the field falls back to env. Reads are cached 60s and the
 * cache is dropped on every write.
 */

import { eq, inArray, like } from "drizzle-orm";
import { db, getAdapter, getDialect, schema } from "@/db";
import {
  encryptSystemSetting,
  decryptSystemSetting,
} from "@/lib/crypto/system-settings-envelope";

export const EMAIL_FIELDS = [
  "provider",
  "from",
  "brevoApiKey",
  "resendApiKey",
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPass",
] as const;
export type EmailField = (typeof EMAIL_FIELDS)[number];
/** Fields whose value must never leave the server. */
export const EMAIL_SECRET_FIELDS: readonly EmailField[] = [
  "brevoApiKey",
  "resendApiKey",
  "smtpUser",
  "smtpPass",
];

export type EmailOverrides = Partial<Record<EmailField, string>>;
/** Per-field change: string = replace, null = clear, absent = keep. */
export type EmailChanges = Partial<Record<EmailField, string | null>>;

const CACHE_TTL_MS = 60_000;
const BACKUP_KEY = "email._backup";
const dbKey = (f: EmailField) => `email.${f}`;
const FIELD_BY_KEY = new Map<string, EmailField>(EMAIL_FIELDS.map((f) => [dbKey(f), f]));

let cache: { at: number; value: EmailOverrides } | null = null;

export function invalidateEmailOverrides(): void {
  cache = null;
}

function dbAvailable(): boolean {
  return getDialect() === "postgres" && getAdapter() != null;
}

/** DB overrides for the email transport (cached 60s). Never throws. */
export async function loadEmailOverrides(): Promise<EmailOverrides> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  const value: EmailOverrides = {};
  if (dbAvailable()) {
    try {
      const rows = await db
        .select()
        .from(schema.systemSettings)
        .where(like(schema.systemSettings.key, "email.%"));
      for (const row of rows as { key: string; valueCt: string }[]) {
        const field = FIELD_BY_KEY.get(row.key);
        if (!field) continue; // backup row or unknown key
        try {
          value[field] = decryptSystemSetting(row.key, row.valueCt);
        } catch {
          console.warn(`[system-settings] cannot decrypt ${row.key}; falling back to env`);
        }
      }
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "unknown";
      console.warn(`[system-settings] email overrides unavailable (${code}); using env`);
    }
  }
  cache = { at: now, value };
  return value;
}

type Snapshot = Record<string, string>; // key -> stored ciphertext

async function snapshotRows(tx: typeof db): Promise<Snapshot> {
  const rows = await tx
    .select()
    .from(schema.systemSettings)
    .where(inArray(schema.systemSettings.key, [...FIELD_BY_KEY.keys()]));
  const snap: Snapshot = {};
  for (const r of rows as { key: string; valueCt: string }[]) snap[r.key] = r.valueCt;
  return snap;
}

async function upsert(tx: typeof db, key: string, valueCt: string, by: string) {
  await tx
    .insert(schema.systemSettings)
    .values({ key, valueCt, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.systemSettings.key,
      set: { valueCt, updatedBy: by, updatedAt: new Date() },
    });
}

/**
 * Apply changes atomically. The pre-change state is saved as the single
 * one-step backup (replacing any older one). Throws if encryption is
 * unavailable — a secret is never stored in the clear.
 */
export async function applyEmailChanges(adminUserId: string, changes: EmailChanges): Promise<void> {
  // Encrypt first: fail before touching the DB if the server key is missing.
  const encrypted: Record<string, string | null> = {};
  for (const f of EMAIL_FIELDS) {
    const v = changes[f];
    if (v === undefined) continue;
    encrypted[dbKey(f)] = v === null ? null : encryptSystemSetting(dbKey(f), v);
  }
  await db.transaction(async (tx) => {
    const before = await snapshotRows(tx as unknown as typeof db);
    await upsert(
      tx as unknown as typeof db,
      BACKUP_KEY,
      encryptSystemSetting(BACKUP_KEY, JSON.stringify(before)),
      adminUserId,
    );
    for (const [key, ct] of Object.entries(encrypted)) {
      if (ct === null) {
        await tx.delete(schema.systemSettings).where(eq(schema.systemSettings.key, key));
      } else {
        await upsert(tx as unknown as typeof db, key, ct, adminUserId);
      }
    }
  });
  invalidateEmailOverrides();
}

export async function hasEmailBackup(): Promise<boolean> {
  if (!dbAvailable()) return false;
  const rows = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, BACKUP_KEY));
  return rows.length > 0;
}

/** Restore the one-step backup and consume it. Returns false when none exists. */
export async function revertEmailChanges(adminUserId: string): Promise<boolean> {
  const rows = (await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, BACKUP_KEY))) as { valueCt: string }[];
  if (rows.length === 0) return false;
  const snap = JSON.parse(decryptSystemSetting(BACKUP_KEY, rows[0].valueCt)) as Snapshot;
  await db.transaction(async (tx) => {
    const t = tx as unknown as typeof db;
    for (const key of FIELD_BY_KEY.keys()) {
      const ct = snap[key];
      if (ct === undefined) await t.delete(schema.systemSettings).where(eq(schema.systemSettings.key, key));
      else await upsert(t, key, ct, adminUserId);
    }
    await t.delete(schema.systemSettings).where(eq(schema.systemSettings.key, BACKUP_KEY));
  });
  invalidateEmailOverrides();
  return true;
}
