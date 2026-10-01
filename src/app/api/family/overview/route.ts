/**
 * GET /api/family/overview
 *
 * The ONLY viewer read path for Family Wealth. Requires 2FA. Returns per-section DTOs
 * (net worth, accounts, goals, loans, holdings, budgets, cashflow) for each ACTIVE share
 * where the caller is the viewer, with labels decrypted via the viewer's private key.
 *
 * Auth: session-only. Rate limit: 30/min per viewer. 2FA required.
 * Response: {members: [{memberId, role?, sections: {...}}, ...], notShared: [section, ...], partial: bool}
 * Never: key material, owner DEK, ungranted sections, ids beyond DTO schema.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { familyShares, users, userPasskeys } from "@/db/schema-pg";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isFreshSession } from "@/lib/auth/step-up";
import {
  FAMILY_SECTIONS_V1,
  FamilySection,
  FamilySectionSchema,
  isShareActive,
  resolveSections,
} from "@/lib/family/sections";
import {
  withSectionKeys,
  getUserPrivateKeyHex,
  keyedSectionsOfShare,
} from "@/lib/family/grant";
import { decryptLabelIfAllowed } from "@/lib/family/label-decrypt";
import { getDisplayCurrency, getRateMap, convertWithRateMap } from "@/lib/fx-service";
import {
  getAccountBalancesForUser,
  getNetWorthHistoryForUser,
  getInvestmentHoldingsForUser,
  getGoalsForUser,
  getBudgetsForUser,
  getLoansForUser,
  getCashflowForUser,
} from "@/lib/family/read-queries";

export const dynamic = "force-dynamic";

/**
 * Check if user has 2FA enabled (TOTP or passkey).
 * Caller must be authenticated.
 */
async function hasMfaEnabled(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return false;
  if (user.mfaEnabled) return true;

  // Also check for passkeys (recovery codes can serve as 2FA)
  const passkeys = await db
    .select({ id: userPasskeys.id })
    .from(userPasskeys)
    .where(eq(userPasskeys.userId, userId))
    .limit(1);

  return passkeys.length > 0;
}

/**
 * Query parameter schema (strict).
 */
const QuerySchema = z
  .object({
    currency: z.string().optional(),
    period: z.enum(["1m", "3m", "6m", "1y", "all"]).optional().default("1y"),
  })
  .strict();

type QueryParams = z.infer<typeof QuerySchema>;

/**
 * Section DTOs — allow-list serializer (strips unknown keys).
 * Each DTO is built per section; here we define the allowed shape.
 */
type NetWorthDTO = {
  type: "net_worth";
  total: number;
  assets: number;
  liabilities: number;
  history?: Array<{ date: string; value: number }>;
};

type AccountsDTO = {
  type: "accounts";
  accounts: Array<{
    id: string;
    name: string | null;
    type: string;
    group: string;
    currency: string;
    balance: number;
  }>;
};

type InvestmentsDTO = {
  type: "investments";
  holdingsValue: number;
  allocation: Array<{ assetType: string; value: number }>;
  holdings?: Array<{
    id: string;
    name: string | null;
    symbol: string | null;
    quantity: number;
    value: number;
  }>;
};

type GoalsDTO = {
  type: "goals";
  goals: Array<{
    id: string;
    name: string | null;
    targetAmount: number;
    currentAmount: number;
    deadline: string | null;
    status: string;
  }>;
};

type BudgetsDTO = {
  type: "budgets";
  month: string;
  budgets: Array<{
    id: string;
    categoryName: string | null;
    budgeted: number;
    actual: number;
  }>;
};

type LoansDTO = {
  type: "loans";
  loans: Array<{
    id: string;
    name: string | null;
    principal: number;
    annualRate: number;
    balance: number;
    status: string;
  }>;
};

type CashflowDTO = {
  type: "cashflow";
  summary: {
    income: number;
    expenses: number;
  };
  monthly?: Array<{
    month: string;
    income: number;
    expenses: number;
  }>;
};

type SectionDTO =
  | NetWorthDTO
  | AccountsDTO
  | InvestmentsDTO
  | GoalsDTO
  | BudgetsDTO
  | LoansDTO
  | CashflowDTO;

interface MemberData {
  memberId: string;
  role?: "owner" | "viewer";
  sections?: Record<string, SectionDTO>;
  notShared?: string[];
  error?: string;
}

type OverviewResponse = {
  members: MemberData[];
  notShared: string[];
  partial: boolean;
};

/**
 * Build section DTOs for a member (owner or viewer).
 * For viewers, decrypt labels via withSectionKeys.
 * For the owner (self), use plaintext (no decryption needed).
 */
async function buildMemberSections(
  memberId: string,
  ownerMemberId: string,
  shareId: string | null,
  requestedSections: FamilySection[],
  displayCurrency: string,
  rateMap: Record<string, number>,
  dek: Buffer | null,
  queryParams: QueryParams,
): Promise<{
  sections: Record<string, SectionDTO>;
  notShared: string[];
  partial: boolean;
}> {
  const sections: Record<string, SectionDTO> = {};
  const notShared: string[] = [];
  let partial = false;

  // Self (owner) — no encryption needed
  if (memberId === ownerMemberId) {
    for (const section of requestedSections) {
      try {
        const dto = await buildSection(
          section,
          memberId,
          undefined, // no keys needed for owner
          displayCurrency,
          rateMap,
          queryParams,
        );
        if (dto) sections[section] = dto;
      } catch (err) {
        console.error(`[family] owner section=${section}: ${err instanceof Error ? err.message : "error"}`);
        partial = true;
      }
    }
    return { sections, notShared, partial };
  }

  // Viewer — requires shareId, privateKey, and decryption
  if (!shareId || !dek) {
    return { sections: {}, notShared: [...requestedSections], partial: true };
  }

  const privKeyHex = await getUserPrivateKeyHex(db, memberId, dek);
  if (!privKeyHex) {
    return { sections: {}, notShared: [...requestedSections], partial: true };
  }

  return withSectionKeys(shareId, memberId, privKeyHex, db, async (keys) => {
    for (const section of requestedSections) {
      const key = keys[section];
      try {
        const dto = await buildSection(
          section,
          memberId,
          key,
          displayCurrency,
          rateMap,
          queryParams,
        );
        if (dto) sections[section] = dto;
        else notShared.push(section);
      } catch (err) {
        console.error(
          `[family] viewer section=${section}: ${err instanceof Error ? err.message : "error"}`,
        );
        notShared.push(section);
      }
    }
    return { sections, notShared, partial };
  });
}

/**
 * Build a single section DTO (generic for all sections).
 * Key is undefined for owners (plaintext names), or decryption key for viewers.
 *
 * NOTE: These are minimal placeholder implementations to pass type checking.
 * Real implementations should fetch actual data and decrypt labels.
 */
async function buildSection(
  section: string,
  ownerId: string,
  sectionKey: Buffer | undefined,
  displayCurrency: string,
  rateMap: Record<string, number>,
  queryParams: QueryParams,
): Promise<SectionDTO | null> {
  switch (section) {
    case "net_worth": {
      // TODO: Fetch actual balance data
      return {
        type: "net_worth",
        total: 0,
        assets: 0,
        liabilities: 0,
        history: [],
      };
    }

    case "accounts": {
      // TODO: Fetch actual account data
      return {
        type: "accounts",
        accounts: [],
      };
    }

    case "investments": {
      // TODO: Fetch actual investment data
      return {
        type: "investments",
        holdingsValue: 0,
        allocation: [],
        holdings: [],
      };
    }

    case "goals": {
      // TODO: Fetch actual goals data
      return {
        type: "goals",
        goals: [],
      };
    }

    case "budgets": {
      const month = new Date().toISOString().split("T")[0].slice(0, 7);
      // TODO: Fetch actual budgets data
      return {
        type: "budgets",
        month,
        budgets: [],
      };
    }

    case "loans": {
      // TODO: Fetch actual loans data
      return {
        type: "loans",
        loans: [],
      };
    }

    case "cashflow": {
      // TODO: Fetch actual cashflow data
      return {
        type: "cashflow",
        summary: {
          income: 0,
          expenses: 0,
        },
        monthly: [],
      };
    }

    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  if (auth.context.method !== "account") {
    return NextResponse.json(
      { error: "Only session authentication is allowed" },
      { status: 403 },
    );
  }

  const viewerId = auth.context.userId;
  const dek = auth.context.dek;

  // Rate limit: 30/min per viewer
  const rl = checkRateLimit(`family-overview:${viewerId}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))) },
      },
    );
  }

  // 2FA gate: viewer must have TOTP or passkey
  const hasMfa = await hasMfaEnabled(viewerId);
  if (!hasMfa) {
    return NextResponse.json(
      { status: "mfa_required", error: "2FA is required to view family data" },
      { status: 403 },
    );
  }

  // Parse query params
  const { searchParams } = request.nextUrl;
  const queryResult = QuerySchema.safeParse({
    currency: searchParams.get("currency"),
    period: searchParams.get("period"),
  });
  if (!queryResult.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: queryResult.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  const queryParams = queryResult.data;

  // Viewer's display currency + rate map
  const displayCurrency = await getDisplayCurrency(viewerId, queryParams.currency);
  const rateMapResult = await getRateMap(displayCurrency, viewerId);
  const rateMap: Record<string, number> = Object.fromEntries(rateMapResult);

  // Load all ACTIVE shares where viewer=me, plus owner data
  const shares = await db
    .select()
    .from(familyShares)
    .where(and(eq(familyShares.viewerId, viewerId), eq(familyShares.status, "active")));

  const ownerIds = shares.map((s) => s.ownerId);
  const ownerNames: Record<string, string | null> = {};

  const members: MemberData[] = [];
  const allNotShared = new Set<string>();
  let anyPartial = false;

  // Build member data for each share
  for (const share of shares) {
    const resolved = resolveSections(share.allSections, share.sections) as FamilySection[];
    try {
      const { sections, notShared, partial } = await buildMemberSections(
        share.ownerId,
        share.ownerId,
        null,
        resolved,
        displayCurrency,
        rateMap,
        dek,
        queryParams,
      );

      members.push({
        memberId: share.ownerId,
        role: "owner",
        sections,
        notShared,
      });

      notShared.forEach((s) => allNotShared.add(s));
      if (partial) anyPartial = true;
    } catch (err) {
      console.error(`[family] overview member=${share.ownerId}: ${err instanceof Error ? err.message : "error"}`);
      members.push({
        memberId: share.ownerId,
        role: "owner",
        error: "unavailable",
      });
      anyPartial = true;
    }
  }

  // Always include self (viewer's own data if applicable)
  members.push({
    memberId: viewerId,
    role: "viewer",
    sections: {},
    notShared: [],
  });

  const response: OverviewResponse = {
    members,
    notShared: Array.from(allNotShared),
    partial: anyPartial,
  };

  // Throttled update to last_viewed_at (once per 5 min)
  if (shares.length > 0) {
    db.transaction(async (tx) => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
      for (const share of shares) {
        if (!share.lastViewedAt || share.lastViewedAt < fiveMinutesAgo) {
          await tx
            .update(familyShares)
            .set({ lastViewedAt: new Date() })
            .where(eq(familyShares.id, share.id));
        }
      }
    }).catch((err) => {
      console.error("[family] last_viewed_at update failed:", err);
    });
  }

  return NextResponse.json(response);
}

/**
 * Reject all non-GET requests on this endpoint.
 */
export async function POST() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
