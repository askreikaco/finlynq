import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { createHash } from "crypto";

export async function incrementDataVersion(userId: string) {
  await db
    .update(schema.users)
    .set({ dataVersion: sql`${schema.users.dataVersion} + 1` })
    .where(eq(schema.users.id, userId));
}

export async function getDataVersion(userId: string): Promise<number> {
  const row = await db
    .select({ dataVersion: schema.users.dataVersion })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  return row?.dataVersion ?? 1;
}

export function generateETag(
  route: string,
  queryString: string,
  dataVersion: number,
  dekState: boolean
): string {
  const payload = `${route}|${queryString}|${dataVersion}|${dekState ? "locked" : "unlocked"}`;
  return `"${createHash("sha256").update(payload).digest("hex")}"`;
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import type { AuthContext } from "@/lib/auth/strategy";

export async function checkETag(request: NextRequest): Promise<{ response?: NextResponse; etag?: string; authContext?: AuthContext }> {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return { response: auth.response };

  const { userId, dek } = auth.context;
  const dataVersion = await getDataVersion(userId);
  const url = new URL(request.url);
  const route = url.pathname;
  const queryString = url.search;

  const etag = generateETag(route, queryString, dataVersion, !!dek);

  if (request.headers.get("if-none-match") === etag) {
    return { response: new NextResponse(null, { status: 304 }) };
  }

  return { etag, authContext: auth.context };
}
