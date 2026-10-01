/**
 * Admin user management API (Phase 6: NS-36)
 *
 * GET  /api/admin/users â€” list all users (paginated)
 * PATCH /api/admin/users â€” update a user's role, plan, profile, email, 2FA
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDialect } from "@/db";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  listUsersPage,
  isUserSortKey,
  getUserById,
  applyAdminUserEdit,
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
import { isPgErrorCode, pgErrorConstraint } from "@/lib/db-utils";

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

// .strict(): unknown keys (password, kekSalt, dekWrapped, ...) are a 400, never
// silently dropped and never able to reach an UPDATE.
const updateSchema = z
  .object({
    userId: z.string().min(1),
    role: z.enum(["user", "admin"]).optional(),
    plan: z.enum(["free", "pro", "premium"]).optional(),
    planExpiresAt: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid planExpiresAt.")
      .nullable()
      .optional(),
    displayName: z.string().trim().max(100).optional(),
    username: z.string().min(3).max(32).regex(/^[a-z0-9._-]+$/).optional(),
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    emailVerified: z.boolean().optional(),
    disableMfa: z.boolean().optional(),
    // Fresh TOTP of the ACTING admin (step-up): required for role change,
    // email change and disableMfa when that admin has MFA enabled.
    mfaCode: z.string().regex(/^\d{6}$/, "MFA code must be 6 digits.").optional(),
  })
  .strict();

export async function PATCH(request: NextRequest) {
  if (getDialect() !== "postgres") {
    return NextResponse.json(
      { error: "Admin features are only available in managed mode." },
      { status: 403 }
    );
  }

  const auth = await requireAdmin(request);
  if (!auth.authenticated) return auth.response;
  const { userId: adminUserId, sessionId, method } = auth.context;

  // API keys are scoped permission tokens and must never edit accounts
  // (same rule as delete-account / wipe-account). Interactive session only.
  if (method !== "account") {
    return NextResponse.json(
      { error: "API keys are not allowed to edit users. Sign in via the web app." },
      { status: 403 }
    );
  }

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
      mfaCode,
    } = parsed.data;

    const adminUser = await getUserById(adminUserId);
    if (!adminUser) {
      return NextResponse.json({ error: "Admin user not found." }, { status: 404 });
    }
    const target = await getUserById(userId);
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    const isSelf = userId === adminUserId;

    const roleChanging = role !== undefined && role !== target.role;
    const emailChanging =
      email !== undefined && email.toLowerCase() !== (target.email ?? "").toLowerCase();
    // Step-up covers privilege changes and the account-takeover levers
    // (email -> password reset, 2FA removal). Applies to self too.
    const requiresStepUp = roleChanging || emailChanging || disableMfa === true;

    if (adminUser.mfaEnabled) {
      if (requiresStepUp && !mfaCode) {
        return NextResponse.json(
          { error: "MFA code required for this change.", code: "MFA_REQUIRED" },
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
        let mfaSecret: string | null = null;
        try {
          mfaSecret = adminUser.mfaSecret ? decryptField(dek, adminUser.mfaSecret) : null;
        } catch {
          mfaSecret = null;
        }
        // Fail closed: MFA flag on but no usable secret must not skip the check.
        if (!mfaSecret || !verifyMfaCode(mfaSecret, mfaCode)) {
          return NextResponse.json({ error: "Invalid MFA code." }, { status: 401 });
        }
      }
    }

    const mfaBeingRemoved = disableMfa === true && !!target.mfaEnabled;

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

    let result;
    try {
      result = await applyAdminUserEdit(userId, {
        role,
        plan,
        planExpiresAt,
        displayName,
        username,
        email,
        emailVerified,
        disableMfa: mfaBeingRemoved,
        // Kill the target's live sessions on 2FA reset. Not for self: that
        // would sign the acting admin out mid-request.
        revokeSessions: mfaBeingRemoved && !isSelf,
      });
    } catch (err) {
      // Uniqueness is enforced by the case-insensitive unique indexes; a
      // concurrent writer that wins the race lands here.
      if (isPgErrorCode(err, "23505")) {
        const constraint = pgErrorConstraint(err) ?? "";
        const what = constraint.includes("username") ? "Username" : "Email";
        return NextResponse.json({ error: `${what} already taken.` }, { status: 409 });
      }
      throw err;
    }
    if (!result.ok) {
      if (result.reason === "last_admin") {
        return NextResponse.json({ error: "Cannot demote the last admin." }, { status: 409 });
      }
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const after = {
      role: role ?? target.role,
      plan: plan ?? target.plan,
      planExpiresAt: planExpiresAt !== undefined ? planExpiresAt : plan ? null : target.planExpiresAt,
      displayName: displayName !== undefined ? displayName : target.displayName,
      username: username !== undefined ? username : target.username,
      email: email !== undefined ? email : target.email,
      emailVerified:
        emailVerified !== undefined ? (emailVerified ? 1 : 0) : emailChanging ? 0 : target.emailVerified,
      mfaEnabled: mfaBeingRemoved ? 0 : target.mfaEnabled,
    };

    const ip = clientIp(request);
    // Audit: role/plan values are not PII; profile/email/MFA entries carry
    // FIELD NAMES ONLY (no username/email/displayName values).
    if (roleChanging) {
      await logAdminAction({
        adminUserId, targetUserId: userId, action: "role_change",
        before: { role: target.role }, after: { role }, ip,
      });
    }
    if (plan && plan !== target.plan) {
      await logAdminAction({
        adminUserId, targetUserId: userId, action: "plan_change",
        before: { plan: target.plan, planExpiresAt: target.planExpiresAt },
        after: { plan, planExpiresAt: planExpiresAt ?? null }, ip,
      });
    }
    const profileFields: string[] = [];
    if (displayName !== undefined && displayName !== (target.displayName ?? "")) profileFields.push("displayName");
    if (username !== undefined && username !== target.username) profileFields.push("username");
    if (emailChanging) profileFields.push("email");
    if (after.emailVerified !== target.emailVerified) profileFields.push("emailVerified");
    if (mfaBeingRemoved) profileFields.push("mfaDisabled");
    if (profileFields.length > 0) {
      await logAdminAction({
        adminUserId, targetUserId: userId, action: "user_profile_change",
        before: null, after: { fields: profileFields }, ip,
      });
    }

    return NextResponse.json({
      success: true,
      before,
      after,
      selfDemoted: isSelf && roleChanging && role === "user",
    });
  } catch (err) {
    console.error("[admin/users] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update user." }, { status: 500 });
  }
}
