/**
 * GET /api/family/manage/list
 *
 * Shares the caller owns (outgoing) and shares where the caller is the viewer (incoming).
 * Allow-list DTOs only: no user ids, no key material, no token data, no other users' emails
 * (outgoing shows the address the caller typed; incoming shows the owner's display name).
 *
 * Auth: session-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/auth/queries";
import { db } from "@/db";
import { getOwnerShares, getViewerShares } from "@/lib/family/share-dal";
import { manageLimit, requireFamilySession, toShareDto } from "@/lib/family/manage-guard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireFamilySession(request);
  if (!guard.ok) return guard.response;
  const { userId } = guard.ctx;

  const limited = manageLimit(userId);
  if (limited) return limited;

  try {
    const [outgoing, incoming] = await Promise.all([getOwnerShares(db, userId), getViewerShares(db, userId)]);

    const names = new Map<string, string | null>();
    const nameOf = async (id: string | null) => {
      if (!id) return null;
      if (!names.has(id)) names.set(id, (await getUserById(id))?.displayName ?? null);
      return names.get(id) ?? null;
    };

    return NextResponse.json(
      {
        outgoing: await Promise.all(outgoing.map(async (s) => toShareDto(s, "owner", await nameOf(s.viewerId)))),
        incoming: await Promise.all(incoming.map(async (s) => toShareDto(s, "viewer", await nameOf(s.ownerId)))),
      },
      { status: 200 },
    );
  } catch {
    console.error("[family] list failed");
    return NextResponse.json({ error: "Could not list shares" }, { status: 500 });
  }
}
