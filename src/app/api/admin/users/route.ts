/**
 * Admin user management API (Phase 6: NS-36)
 *
 * GET  /api/admin/users â€” list all users (paginated)
 * PATCH /api/admin/users â€” update a user's role or plan
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  listUsersPage,
  isUserSortKey,
  getUserById,
  updateUserRole,
  updateUserPlan,
} from "@/lib/auth/queries";
import { parseTableFilters, type TableColFilter } from "@/lib/table-filters";

/**
 * Server-side re-validation of the per-column filters. `parseTableFilters` only
 * proves the payload is JSON — this proves it is a filter. Mirrors the union in
 * @/lib/table-filters; keep the two in step.
 */
const colFiltersSchema: z.ZodType<TableColFilter[]> = z.array(
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("date"),
      columnId: z.string().min(1),
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    z.object({
      type: z.literal("text"),
      columnId: z.string().min(1),
      value: z.string(),
    }),
    z.object({
      type: z.literal("numeric"),
      columnId: z.string().min(1),
      op: z.enum(["eq", "gt", "lt", "between"]),
      value: z.number().finite(),
      value2: z.number().finite().optional(),
    }),
    z.object({
      type: z.literal("enum"),
      columnId: z.string().min(1),
      // A zero-length enum would mean "match none" and blank the table; the
      // client drops those before serializing, and this rejects any that slip.
      values: z.array(z.string()).min(1),
    }),
  ])
);
import { validateBody } from "@/lib/validate";
import { logAdminAction, clientIp } from "@/lib/admin-audit";
import { getDEK } from "@/lib/crypto/dek-cache";
import { decryptField } from "@/lib/crypto/envelope";
import { verifyMfaCode } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Admin features are only available in managed mode." },
      { status: 403 }
    );
  }

  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  // Sort / filter are validated STRICTLY: an unrecognized value is a 400, never
  // a silent fallback to the default. Quietly serving a differently-ordered or
  // unfiltered list that the UI then labels as sorted/filtered is the same
  // class of lie as the old unfiltered COUNT.
  const sortParam = url.searchParams.get("sort");
  if (sortParam !== null && !isUserSortKey(sortParam)) {
    return NextResponse.json(
      { error: `Unknown sort column: ${sortParam}` },
      { status: 400 }
    );
  }

  const sortDirParam = url.searchParams.get("sortDir");
  if (sortDirParam !== null && sortDirParam !== "asc" && sortDirParam !== "desc") {
    return NextResponse.json(
      { error: `Invalid sortDir: ${sortDirParam}` },
      { status: 400 }
    );
  }

  // Per-column filters arrive as a JSON array (see @/lib/table-filters). A
  // present-but-unparseable payload is a 400: serving an UNFILTERED page that
  // the UI still renders as filtered is the same lie as an unfiltered count.
  const rawFilters = url.searchParams.get("filters");
  const parsedFilters = parseTableFilters(rawFilters);
  if (parsedFilters === null) {
    return NextResponse.json(
      { error: "Malformed filters parameter." },
      { status: 400 }
    );
  }

  const filtersResult = colFiltersSchema.safeParse(parsedFilters);
  if (!filtersResult.success) {
    return NextResponse.json(
      { error: "Invalid filter shape." },
      { status: 400 }
    );
  }

  // One code path yields both the page and its matching total — see
  // listUsersPage. The transaction count is part of the query now (it has to be,
  // for `sort=txns` to order across the whole set rather than one page).
  const { rows, total } = await listUsersPage({
    limit,
    offset,
    sort: sortParam,
    sortDir: sortDirParam,
    filters: filtersResult.data,
  });

  return NextResponse.json({
    users: rows,
    total,
    limit,
    offset,
    sort: sortParam,
    sortDir: sortDirParam,
    filters: filtersResult.data,
  });
}

const updateSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["user", "admin"]).optional(),
  plan: z.enum(["free", "pro", "premium"]).optional(),
  planExpiresAt: z.string().optional(),
  displayName: z.string().max(100).optional(),
  username: z.string().min(3).max(32).regex(/^[a-z0-9._-]+$/).optional(),
  email: z.string().email().optional(),
  emailVerified: z.boolean().optional(),
  disableMfa: z.boolean().optional(),
  // Required if the acting admin has MFA enabled — Finding Admin-MFA-step-up.
  // A stale session cookie alone can no longer silently mutate other users.
  // Also required for disableMfa and role changes.
  mfaCode: z.string().length(6).optional(),
});

export async function PATCH(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Admin features are only available in managed mode." },
      { status: 403 }
    );
  }

  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;
  const { userId: adminUserId, sessionId } = auth.context;

  try {
    const body = await request.json();
    const parsed = validateBody(body, updateSchema);
    if (parsed.error) return parsed.error;

    const { 
      userId, 
      role, 
      plan, 
      planExpiresAt, 
      displayName,
      username,
      email,
      emailVerified,
      disableMfa,
      mfaCode 
    } = parsed.data;

    const adminUser = await getUserById(adminUserId);
    if (!adminUser) {
      return NextResponse.json({ error: "Admin user not found." }, { status: 404 });
    }

    // Determine if step-up is required: role change, disableMfa
    const requiresStepUp = (role !== undefined && role !== undefined) || disableMfa;

    // MFA step-up: if the admin has MFA enabled, require a fresh TOTP on the
    // request. Decrypt the stored secret with the admin's session DEK.
    if (adminUser.mfaEnabled && adminUser.mfaSecret) {
      if (requiresStepUp && !mfaCode) {
        return NextResponse.json(
          { error: "MFA code required for admin mutations.", code: "MFA_REQUIRED" },
          { status: 403 }
        );
      }
      if (mfaCode) {
        // SESSION-DEK-REQUIRED: deliberately NOT auth.context.dek. This decrypts the ADMIN's
        // TOTP secret for a step-up check before an admin mutation; the live-session
        // requirement is a factor, not an accident.
        const dek = sessionId ? getDEK(sessionId, adminUserId) : null;
        if (!dek) {
          return NextResponse.json(
            { error: "Session expired. Please sign in again." },
            { status: 423 }
          );
        }
        let mfaSecret: string | null;
        try {
          mfaSecret = decryptField(dek, adminUser.mfaSecret);
        } catch {
          return NextResponse.json(
            { error: "MFA secret could not be decrypted." },
            { status: 500 }
          );
        }
        if (!mfaSecret || !verifyMfaCode(mfaSecret, mfaCode)) {
          return NextResponse.json(
            { error: "Invalid MFA code." },
            { status: 401 }
          );
        }
      }
    }

    const target = await getUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Validate role change: check if demoting the last admin
    if (role && role === "user" && target.role === "admin") {
      const adminCount = await (await import("@/lib/auth/queries")).countAdminUsers();
      if (adminCount === 1) {
        return NextResponse.json(
          { error: "Cannot demote the last admin." },
          { status: 409 }
        );
      }
    }

    // Validate username uniqueness (case-insensitive)
    if (username && username.toLowerCase() !== (target.username?.toLowerCase() ?? "")) {
      const existing = await (await import("@/lib/auth/queries")).getUserByUsername(username);
      if (existing && existing.id !== userId) {
        return NextResponse.json(
          { error: "Username already taken." },
          { status: 409 }
        );
      }
    }

    // Validate email uniqueness (case-insensitive)
    if (email && email.toLowerCase() !== (target.email?.toLowerCase() ?? "")) {
      const existing = await (await import("@/lib/auth/queries")).getUserByEmail(email);
      if (existing && existing.id !== userId) {
        return NextResponse.json(
          { error: "Email already taken." },
          { status: 409 }
        );
      }
    }

    const before = {
      role: target.role,
      plan: target.plan,
      planExpiresAt: target.planExpiresAt,
      displayName: target.displayName,
      username: target.username,
      email: target.email,
      emailVerified: target.emailVerified,
      mfaEnabled: target.mfaEnabled,
    };

    // Perform updates
    if (displayName !== undefined) {
      await (await import("@/lib/auth/queries")).updateUserDisplayName(userId, displayName);
    }
    if (username !== undefined) {
      await (await import("@/lib/auth/queries")).updateUserUsername(userId, username);
    }
    if (email !== undefined) {
      await (await import("@/lib/auth/queries")).updateUserEmailAdmin(userId, email, emailVerified);
    }
    if (role) await updateUserRole(userId, role);
    if (plan) await updateUserPlan(userId, plan, planExpiresAt);
    if (disableMfa) {
      await (await import("@/lib/auth/queries")).disableUserMfaForced(userId);
    }

    const after = {
      role: role ?? target.role,
      plan: plan ?? target.plan,
      planExpiresAt: planExpiresAt ?? target.planExpiresAt,
      displayName: displayName !== undefined ? displayName : target.displayName,
      username: username !== undefined ? username : target.username,
      email: email !== undefined ? email : target.email,
      emailVerified: emailVerified !== undefined ? (emailVerified ? 1 : 0) : target.emailVerified,
      mfaEnabled: disableMfa ? 0 : target.mfaEnabled,
    };

    // Finding #16 – audit-log the mutation. Fire-and-forget so a failed audit
    // write doesn't block a legitimate admin op (but it is logged to server log).
    if (role && role !== target.role) {
      await logAdminAction({
        adminUserId,
        targetUserId: userId,
        action: "role_change",
        before: { role: target.role },
        after: { role },
        ip: clientIp(request),
      });
    }
    if (plan && plan !== target.plan) {
      await logAdminAction({
        adminUserId,
        targetUserId: userId,
        action: "plan_change",
        before: { plan: target.plan, planExpiresAt: target.planExpiresAt },
        after: { plan, planExpiresAt: planExpiresAt ?? null },
        ip: clientIp(request),
      });
    }
    if (displayName !== undefined && displayName !== target.displayName) {
      await logAdminAction({
        adminUserId,
        targetUserId: userId,
        action: "user_profile_change",
        before: { displayName: target.displayName },
        after: { displayName },
        ip: clientIp(request),
      });
    }
    if (username !== undefined && username !== target.username) {
      await logAdminAction({
        adminUserId,
        targetUserId: userId,
        action: "user_profile_change",
        before: { username: target.username },
        after: { username },
        ip: clientIp(request),
      });
    }
    if (email !== undefined && email !== target.email) {
      await logAdminAction({
        adminUserId,
        targetUserId: userId,
        action: "user_profile_change",
        before: { email: target.email },
        after: { email },
        ip: clientIp(request),
      });
    }
    if (disableMfa && target.mfaEnabled) {
      await logAdminAction({
        adminUserId,
        targetUserId: userId,
        action: "user_profile_change",
        before: { mfaEnabled: 1 },
        after: { mfaEnabled: 0 },
        ip: clientIp(request),
      });
    }

    return NextResponse.json({ success: true, before, after });
  } catch (err) {
    console.error("[admin/users] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update user." },
      { status: 500 }
    );
  }
}

