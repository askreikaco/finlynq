/**
 * Language display preference ("auto" | "en" | "vi"). Stored as a plain
 * key-value row in `settings` (key `language`, per user) — no migration.
 * Value is a non-sensitive enum, so `requireAuth` suffices (no encryption).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "@/lib/auth/require-auth";
import { db, schema } from "@/db";
import { logApiError, safeErrorMessage, validateBody } from "@/lib/validate";
import {
  DEFAULT_LANGUAGE_PREF,
  LANGUAGE_SETTING_KEY as KEY,
  LANGUAGE_PREFS,
  isLanguagePref,
  type LanguagePref,
} from "@/lib/locale";

const putSchema = z.object({ pref: z.enum(LANGUAGE_PREFS as [LanguagePref, ...LanguagePref[]]) });

async function readPref(userId: string): Promise<LanguagePref> {
  const row = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.key, KEY), eq(schema.settings.userId, userId)))
    .limit(1);
  const v = row[0]?.value;
  return isLanguagePref(v) ? v : DEFAULT_LANGUAGE_PREF;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  return NextResponse.json({ pref: await readPref(auth.context.userId) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = validateBody(body, putSchema);
  if (parsed.error) return parsed.error;

  try {
    await db
      .insert(schema.settings)
      .values({ key: KEY, userId, value: parsed.data.pref })
      .onConflictDoUpdate({
        target: [schema.settings.key, schema.settings.userId],
        set: { value: parsed.data.pref },
      });
    return NextResponse.json({ pref: parsed.data.pref });
  } catch (error: unknown) {
    await logApiError("PUT", "/api/settings/language", error, userId);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to save language") },
      { status: 500 },
    );
  }
}
