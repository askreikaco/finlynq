/**
 * GET /api/family/manage/list
 *
 * List all shares visible to the user (outgoing if owner, incoming if viewer).
 * Returns shares with status, sections, and timestamps — no key material or secrets.
 *
 * Auth: Session-only (method==="account"); API key returns 403.
 *
 * On success: 200 with { outgoing: [...], incoming: [...] }.
 * Errors: 401 (auth), 403 (API key), 500 (error).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db";
import { getOwnerShares, getViewerShares } from "@/lib/family/share-dal";

export const dynamic = "force-dynamic";

interface ShareDTO {
  id: string;
  status: string;
  sections: string[];
  allSections: boolean;
  mustShareBack: boolean;
  requiredBackSections: string[];
  otherPartyEmail?: string;
  otherPartyName?: string;
  createdAt: string;
  acceptedAt?: string;
  lastViewedAt?: string;
}

export async function GET(request: NextRequest) {
  // Step 1: Authenticate — session-only
  const auth = await requireAuth(request);
  if (!auth.authenticated) {
    return auth.response;
  }

  if (auth.context.method !== "account") {
    return NextResponse.json(
      { error: "Only session authentication is allowed" },
      { status: 403 }
    );
  }

  const { userId } = auth.context;

  // Step 2: Fetch outgoing and incoming shares
  try {
    const outgoing = await getOwnerShares(db, userId);
    const incoming = await getViewerShares(db, userId);

    // Convert to DTOs (no key material, no secrets)
    const outgoingDtos: ShareDTO[] = outgoing.map((share) => ({
      id: share.id,
      status: share.status,
      sections: share.sections,
      allSections: share.allSections,
      mustShareBack: share.mustShareBack,
      requiredBackSections: share.requiredBackSections || [],
      otherPartyEmail: share.viewerEmailLower,
      createdAt: share.createdAt.toISOString(),
      ...(share.acceptedAt ? { acceptedAt: share.acceptedAt.toISOString() } : {}),
      ...(share.lastViewedAt ? { lastViewedAt: share.lastViewedAt.toISOString() } : {}),
    }));

    const incomingDtos: ShareDTO[] = incoming.map((share) => ({
      id: share.id,
      status: share.status,
      sections: share.sections,
      allSections: share.allSections,
      mustShareBack: share.mustShareBack,
      requiredBackSections: share.requiredBackSections || [],
      otherPartyEmail: share.ownerId, // ownerId is stored as owner_id; we use email for display
      createdAt: share.createdAt.toISOString(),
      ...(share.acceptedAt ? { acceptedAt: share.acceptedAt.toISOString() } : {}),
      ...(share.lastViewedAt ? { lastViewedAt: share.lastViewedAt.toISOString() } : {}),
    }));

    return NextResponse.json(
      { outgoing: outgoingDtos, incoming: incomingDtos },
      { status: 200 }
    );
  } catch (err) {
    console.error("[family] list failed:", err);
    return NextResponse.json(
      { error: "Could not list shares" },
      { status: 500 }
    );
  }
}
