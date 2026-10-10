import { NextRequest, NextResponse } from "next/server";
import { getTransactions, getTransactionCount, getTransactionsPage, createTransaction, updateTransaction, type TxSortFilter } from "@/lib/queries";
import { decodeCursor, InvalidCursorError, type TxCursor } from "@/lib/transactions/cursor";
import { resolveTextFilterIds, resolveAccountTextIds, resolveHoldingTextIds } from "@/lib/transactions/text-filter";
import { requireAuth } from "@/lib/auth/require-auth";
import { requireEncryption } from "@/lib/auth/require-encryption";
import { encryptTxWrite, decryptTxRows, redactTxCiphertext, nameLookup, decryptName } from "@/lib/crypto/encrypted-columns";
import { decryptField } from "@/lib/crypto/envelope";
import { invalidateUser as invalidateUserTxCache } from "@/lib/mcp/user-tx-cache";
import { buildHoldingResolver } from "@/lib/external-import/portfolio-holding-resolver";
import { isPgErrorCode, pgErrorConstraint } from "@/lib/db-utils";
import { InvestmentHoldingRequiredError } from "@/lib/investment-account";
import { validateSignVsCategoryById } from "@/lib/transactions/sign-category-invariant";
import {
  applyLotEffectsForTx,
  buildLotContext,
  reverseLotsForDeleteHook,
  replanLotsAfterMutation,
} from "@/lib/portfolio/lots/write-hooks";
import { canEditPortfolioRow } from "@/lib/portfolio/operations";
import type { TxRowForLots } from "@/lib/portfolio/lots/types";
import { db, schema } from "@/db";
import { and, eq, gte, or } from "drizzle-orm";
import { markSnapshotsDirty } from "@/lib/portfolio/snapshots/dirty";
import { markCashSnapshotsDirty } from "@/lib/portfolio/snapshots/cash-dirty";
import { resolveTxAmounts } from "@/lib/transactions/resolve-amounts";
import { createOrLinkRepeatSubscription, planRepeat, repeatSchema, RepeatError } from "@/lib/transactions/repeat-subscription";
import { z } from "zod";
import { validateBody, safeErrorMessage, logApiError } from "@/lib/validate";
import { isSortableColumnId } from "@/lib/transactions/columns";
import { deleteTransactionsCascade } from "@/lib/transactions/delete-cascade";
import { isTransactionSource, type TransactionSource } from "@/lib/tx-source";
import { verifyOwnership, OwnershipError } from "@/lib/verify-ownership";
import { securitiesReadEnabledForUser } from "@/lib/securities/flag";

const postSchema = z.object({
  date: z.string(),
  amount: z.number().optional(),       // account-currency amount; computed by server when entered* is provided
  accountId: z.number().int().positive({ message: "Please pick an account" }),
  // Reject 0 (the UI's "no selection" sentinel) up front — letting it through
  // to the INSERT raises a Postgres FK violation 23503 which surfaces as a
  // confusing 500. Real category ids are positive serial values.
  categoryId: z.number().int().positive({ message: "Please pick a category" }),
  currency: z.string().optional(),     // account currency; defaults to the account's currency
  // Phase 2 of the currency rework — the user-typed values. When provided,
  // the server triangulates to the account's currency and locks the rate.
  // When omitted, falls back to (amount, currency) being the entered side too.
  enteredAmount: z.number().optional(),
  enteredCurrency: z.string().optional(),
  payee: z.string().optional(),
  quantity: z.number().optional(),
  portfolioHolding: z.string().optional(),
  portfolioHoldingId: z.number().int().optional(),
  note: z.string().optional(),
  tags: z.string().optional(),
  isBusiness: z.number().optional(),
  splitPerson: z.string().optional(),
  splitRatio: z.number().optional(),
  // Repeat + Installment phase 1 — create/link a Subscription schedule next
  // to the booked row (same DB transaction). Unknown keys are stripped, so a
  // client cannot set installment_group_id / subscription_id directly.
  repeat: repeatSchema.optional(),
}).refine(
  (data) => data.amount != null || data.enteredAmount != null,
  { message: "Either amount or enteredAmount is required" }
);

const putSchema = z.object({
  id: z.number(),
  date: z.string().optional(),
  amount: z.number().optional(),
  accountId: z.number().int().positive({ message: "Please pick an account" }).optional(),
  categoryId: z.number().int().positive({ message: "Please pick a category" }).optional(),
  currency: z.string().optional(),
  enteredAmount: z.number().optional(),
  enteredCurrency: z.string().optional(),
  payee: z.string().optional(),
  quantity: z.number().optional(),
  portfolioHolding: z.string().optional(),
  portfolioHoldingId: z.number().int().nullable().optional(),
  note: z.string().optional(),
  tags: z.string().optional(),
  isBusiness: z.number().optional(),
  splitPerson: z.string().optional(),
  splitRatio: z.number().optional(),
  // FINLYNQ-176 — when true, a lot-locked edit (canEditPortfolioRow → not
  // allowed) reallocates the dependent closures instead of returning 409.
  // Stripped from `data` before the row is updated.
  confirmReallocation: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  // GET must stay accessible even when the session has no cached DEK
  // (e.g. first request after a server restart). Without a DEK the
  // encrypted payee/note/tags are blanked (redactTxCiphertext) so the page
  // shows "—" rather than `v1:...` ciphertext; unlocking repopulates the DEK
  // cache. 423-ing the whole transactions page would block the user entirely.
  //
  // Take the DEK from `auth.context`, which every strategy populates: the
  // session cache for cookie auth (account.ts), and the api_key_dek unwrap
  // for Bearer `pf_...` callers (api-key.ts). Re-deriving it from `sessionId`
  // here dropped the DEK for API-key and OAuth clients -- which have no
  // session -- so every row came back as `v1:` ciphertext for them.
  const { checkETag, withEtagHeaders } = await import("@/lib/data-version");
  const etagCheck = await checkETag(request);
  if (etagCheck.response) return etagCheck.response;
  const { userId, dek } = etagCheck.authContext!;
  const { etag } = etagCheck;

  const params = request.nextUrl.searchParams;
  const search = params.get("search") ?? undefined;
  // `portfolioHolding` (name) is resolved server-side to a holding id and
  // applied as a SQL `WHERE portfolio_holding_id = ?` filter. Phase 5
  // (2026-04-29) eliminated the in-memory ciphertext scan — the FK is the
  // source of truth and the legacy text column is NULL on every row.
  const portfolioHoldingNameParam = params.get("portfolioHolding") ?? undefined;
  const portfolioHoldingIdParam = params.get("portfolioHoldingId");
  const portfolioHoldingId = portfolioHoldingIdParam
    ? parseInt(portfolioHoldingIdParam)
    : undefined;
  // Resolve `portfolioHolding` → holding-id set via the user's lookup HMAC.
  // Drill-through "View transactions" links from /portfolio pass the holding's
  // DISPLAY value, which is the NAME for cash/custom rows but the SYMBOL for
  // metals/securities (e.g. gold shows "XAU" though it's named "Gold"). Match
  // name_lookup OR symbol_lookup so the symbol-display case isn't a silent miss,
  // and collect EVERY matching position (a holding spread across accounts)
  // rather than limit(1) so the aggregate drill shows all accounts. The HMAC is
  // the same function for both columns (`symbol_lookup = nameLookup(dek, symbol)`),
  // so one `lookup` value compares against both. An empty result → match nothing
  // (combined below), never a silent drop to the full list.
  let portfolioHoldingNameIds: number[] | undefined;
  if (
    portfolioHoldingNameParam &&
    (portfolioHoldingId == null || !Number.isFinite(portfolioHoldingId))
  ) {
    if (dek) {
      const lookup = nameLookup(dek, portfolioHoldingNameParam);
      const matched = await db
        .select({ id: schema.portfolioHoldings.id })
        .from(schema.portfolioHoldings)
        .where(and(
          eq(schema.portfolioHoldings.userId, userId),
          or(
            eq(schema.portfolioHoldings.nameLookup, lookup),
            eq(schema.portfolioHoldings.symbolLookup, lookup),
          ),
        ));
      portfolioHoldingNameIds = matched.map((m) => m.id);
    } else {
      portfolioHoldingNameIds = [];
    }
  }
  const tag = params.get("tag") ?? undefined;

  // Issue #59 — parse the new sort + per-column filter query params.
  const sortColumnIdRaw = params.get("sort") ?? undefined;
  const sortDirRaw = params.get("sortDir") ?? undefined;
  const sortColumnId = sortColumnIdRaw && isSortableColumnId(sortColumnIdRaw)
    ? sortColumnIdRaw
    : undefined;
  const sortDirection: "asc" | "desc" | undefined =
    sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : undefined;

  const parseNum = (key: string): number | undefined => {
    const v = params.get(key);
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const parseIdList = (key: string): number[] | undefined => {
    const v = params.get(key);
    if (!v) return undefined;
    const ids = v.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n > 0);
    return ids.length > 0 ? ids : undefined;
  };
  const parseSourcesList = (): TransactionSource[] | undefined => {
    const v = params.get("sources");
    if (!v) return undefined;
    const out = v.split(",").map((s) => s.trim()).filter(isTransactionSource);
    return out.length > 0 ? out : undefined;
  };

  // Cursor mode: a `cursor` param switches the response to opaque paging.
  // An empty value is the first page (the only page that carries `total`).
  // Legacy mode (no `cursor` param) keeps the {data,total} shape.
  const cursorParam = params.get("cursor");
  const cursorMode = cursorParam !== null;
  const cursorFirstPage = cursorMode && cursorParam === "";
  const expectedSort = sortColumnId ?? "date";
  const expectedDirection: "asc" | "desc" = sortDirection === "asc" ? "asc" : "desc";
  let cursor: TxCursor | undefined;
  if (cursorMode && cursorParam !== "") {
    try {
      cursor = decodeCursor(cursorParam, { sort: expectedSort, direction: expectedDirection });
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      throw err;
    }
  }

  // Empty-or-whitespace text params are "no filter" (same as the client).
  const nonEmpty = (v: string | null | undefined): string | undefined =>
    v && v.trim() !== "" ? v : undefined;
  const intersectIdSets = (sets: number[][]): number[] | undefined =>
    sets.length === 0 ? undefined : sets.reduce((acc, s) => acc.filter((id) => s.includes(id)));
  const definedSets = (sets: Array<number[] | undefined>): number[][] =>
    sets.filter((s): s is number[] => s !== undefined);

  // Encrypted-text filters. search / tag / filter_payee / filter_note /
  // filter_tags are resolved by resolveTextFilterIds (server decrypt of three
  // narrow columns, then id pushdown). Account and holding name filters
  // resolve to id sets. filter_kind is plaintext, so it is SQL ILIKE.
  const filterPayee = params.get("filter_payee") ?? undefined;
  const filterNote = params.get("filter_note") ?? undefined;
  const filterAccountName = params.get("filter_accountName") ?? undefined;
  const filterAccountAlias = params.get("filter_accountAlias") ?? undefined;
  const filterAccount = params.get("filter_account") ?? undefined;
  const filterPortfolio = params.get("filter_portfolio") ?? undefined;
  const filterPortfolioTicker = params.get("filter_portfolioTicker") ?? undefined;
  const filterTags = params.get("filter_tags") ?? undefined;
  const filterKind = params.get("filter_kind") ?? undefined;

  // Resolve the ticker substring against the user's (small) holdings/securities
  // symbol set. Symbols are Stream-D encrypted, so SQL can't LIKE on them. When
  // the filter is present we ALWAYS bind a result set (possibly empty = "no
  // holding matched") so the filter is never silently dropped, including the
  // no-DEK case, which can't decrypt any symbol.
  let portfolioTickerHoldingIds: number[] | undefined;
  if (filterPortfolioTicker) {
    if (dek) {
      const needle = filterPortfolioTicker.toLowerCase();
      const holdingRows = await db
        .select({
          id: schema.portfolioHoldings.id,
          symbolCt: schema.portfolioHoldings.symbolCt,
          securitySymbolCt: schema.securities.symbolCt,
        })
        .from(schema.portfolioHoldings)
        .leftJoin(schema.securities, eq(schema.portfolioHoldings.securityId, schema.securities.id))
        .where(eq(schema.portfolioHoldings.userId, userId));
      const ids: number[] = [];
      for (const h of holdingRows) {
        const sym = decryptName(h.symbolCt, dek, null);
        const secSym = decryptName(h.securitySymbolCt, dek, null);
        if (
          (sym && sym.toLowerCase().includes(needle)) ||
          (secSym && secSym.toLowerCase().includes(needle))
        ) {
          ids.push(h.id);
        }
      }
      portfolioTickerHoldingIds = ids;
    } else {
      portfolioTickerHoldingIds = [];
    }
  }

  // Holding-id constraints (ticker column filter, name/symbol drill, holding
  // name text filter) are ANDed into one id set. An empty set means "matched no
  // holding", which is handled below as match-nothing.
  const holdingTextNeedle = nonEmpty(filterPortfolio);
  const holdingTextIds = holdingTextNeedle
    ? await resolveHoldingTextIds({ userId, dek, needle: holdingTextNeedle })
    : undefined;
  const portfolioHoldingIds = intersectIdSets(
    definedSets([portfolioTickerHoldingIds, portfolioHoldingNameIds, holdingTextIds]),
  );

  // Account-id constraints: explicit accountIds, a comma-list accountId (2.5 d),
  // and the account name / alias text filters (2.5 h). Each text filter is a
  // separate resolved id set, ANDed together.
  const accountIdRaw = params.get("accountId");
  const categoryIdRaw = params.get("categoryId");
  const commaAccountIds = accountIdRaw?.includes(",") ? parseIdList("accountId") : undefined;
  const commaCategoryIds = categoryIdRaw?.includes(",") ? parseIdList("categoryId") : undefined;
  const accountIdSingle = accountIdRaw && !accountIdRaw.includes(",") ? parseInt(accountIdRaw) : undefined;
  const categoryIdSingle = categoryIdRaw && !categoryIdRaw.includes(",") ? parseInt(categoryIdRaw) : undefined;

  const accountTextSets: number[][] = [];
  const accountTextSpecs: Array<[string | undefined, Array<"name" | "alias">]> = [
    [nonEmpty(filterAccountName), ["name"]],
    [nonEmpty(filterAccountAlias), ["alias"]],
    [nonEmpty(filterAccount), ["name", "alias"]],
  ];
  for (const [needle, fields] of accountTextSpecs) {
    if (needle) {
      accountTextSets.push(await resolveAccountTextIds({ userId, dek, needle, fields }));
    }
  }
  const accountIdSet = intersectIdSets(
    definedSets([parseIdList("accountIds"), commaAccountIds, ...accountTextSets]),
  );
  const categoryIdSet = intersectIdSets(definedSets([parseIdList("categoryIds"), commaCategoryIds]));

  // A set that resolved to nothing means the whole result is empty. The query
  // then runs with `ids: []` (1 = 0), never with an empty accountIds or
  // portfolioHoldingIds array.
  const matchNothing =
    accountIdSet?.length === 0 ||
    categoryIdSet?.length === 0 ||
    portfolioHoldingIds?.length === 0;

  // FINLYNQ-177 — single-transaction id deep link. A present but non-positive
  // / non-numeric `id` param can never match a real serial id, so
  // short-circuit to the empty state rather than dropping the filter.
  const idParamRaw = params.get("id");
  let idFilter: number | undefined;
  const emptyResponse = () =>
    cursorMode
      ? NextResponse.json({
          data: [],
          ...(cursorFirstPage ? { total: 0 } : {}),
          nextCursor: null,
          hasMore: false,
        })
      : NextResponse.json({ data: [], total: 0 });
  if (idParamRaw != null && idParamRaw !== "") {
    const parsed = parseInt(idParamRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      idFilter = parsed;
    } else {
      return emptyResponse();
    }
  }

  // Direction filter validation: only accept "in" or "out"
  const directionRaw = params.get("direction");
  const direction: "in" | "out" | undefined = (directionRaw === "in" || directionRaw === "out") ? directionRaw : undefined;

  // Kind: plaintext column, case-insensitive substring via ILIKE. Escape LIKE
  // metacharacters so the needle is literal.
  const kindNeedle = nonEmpty(filterKind);
  const kindLike = kindNeedle
    ? `%${kindNeedle.trim().replace(/[\\%_]/g, "\\$&")}%`
    : undefined;

  // SQL-side filters (no sort, no paging, no text ids). Also the memo key for
  // resolveTextFilterIds, so sort or paging changes do not re-decrypt.
  const sqlFilters: TxSortFilter = {
    id: idFilter,
    startDate: params.get("startDate") ?? undefined,
    endDate: params.get("endDate") ?? undefined,
    createdAtFrom: params.get("createdAtFrom") ?? undefined,
    createdAtTo: params.get("createdAtTo") ?? undefined,
    updatedAtFrom: params.get("updatedAtFrom") ?? undefined,
    updatedAtTo: params.get("updatedAtTo") ?? undefined,
    accountId: accountIdSingle,
    categoryId: categoryIdSingle,
    portfolioHoldingId: Number.isFinite(portfolioHoldingId) ? portfolioHoldingId : undefined,
    portfolioHoldingIds: portfolioHoldingIds?.length ? portfolioHoldingIds : undefined,
    accountIds: accountIdSet?.length ? accountIdSet : undefined,
    categoryIds: categoryIdSet?.length ? categoryIdSet : undefined,
    amountMin: parseNum("amountMin"),
    amountMax: parseNum("amountMax"),
    amountEq: parseNum("amountEq"),
    quantityMin: parseNum("quantityMin"),
    quantityMax: parseNum("quantityMax"),
    quantityEq: parseNum("quantityEq"),
    direction,
    minAmount: parseNum("minAmount"),
    maxAmount: parseNum("maxAmount"),
    sources: parseSourcesList(),
    kindLike,
  };

  const textNeedles = {
    search: nonEmpty(search),
    tag: nonEmpty(tag),
    payee: nonEmpty(filterPayee),
    note: nonEmpty(filterNote),
    tags: nonEmpty(filterTags),
  };
  const hasTextNeedle = Object.values(textNeedles).some((v) => v !== undefined);

  let textIds: number[] | undefined;
  if (matchNothing) {
    textIds = [];
  } else if (hasTextNeedle) {
    textIds = await resolveTextFilterIds({
      userId,
      dek,
      sqlFilters,
      needles: textNeedles,
      dataVersion: etagCheck.dataVersion,
    });
  }

  const filters: TxSortFilter = {
    ...sqlFilters,
    sortColumnId,
    sortDirection,
    ids: textIds,
  };

  const securitiesRead = await securitiesReadEnabledForUser(userId);
  // Decrypt + redact + resolve display names for the rows actually returned.
  const shapeRows = (raw: unknown[]) => {
    let decrypted = decryptTxRows(dek, raw as Array<Parameters<typeof decryptTxRows>[1][number]>);
    // Locked session: never ship ciphertext to the client (display-only rows).
    if (!dek) decrypted = redactTxCiphertext(decrypted);
    // Resolve every Stream-D-encrypted display name and strip the *_ct
    // companion fields before serializing. Falls back to plaintext (legacy
    // rows + DEK-mismatch users) via decryptName's ladder.
    // Securities master read-flip: when on, the displayed holding identity comes
    // from the centralized `securities` row. Off / unlinked → the holding's own name.
    return decrypted.map((r) => {
      const row = r as typeof r & {
        accountName?: string | null;
        accountNameCt?: string | null;
        accountAlias?: string | null;
        accountAliasCt?: string | null;
        categoryName?: string | null;
        categoryNameCt?: string | null;
        portfolioHoldingName?: string | null;
        portfolioHoldingNameCt?: string | null;
        portfolioHoldingSymbol?: string | null;
        portfolioHoldingSymbolCt?: string | null;
        securityNameCt?: string | null;
        securitySymbolCt?: string | null;
        portfolioHolding?: string | null;
      };
      row.accountName = decryptName(row.accountNameCt, dek, row.accountName);
      row.accountAlias = decryptName(row.accountAliasCt, dek, row.accountAlias);
      row.categoryName = decryptName(row.categoryNameCt, dek, row.categoryName);
      // Holding name — prefer the security's name when the read-flip is on.
      let resolvedHolding: string | null = null;
      if (securitiesRead && row.securityNameCt && dek) {
        try {
          resolvedHolding = decryptField(dek, row.securityNameCt);
        } catch {
          resolvedHolding = null;
        }
      }
      if (!resolvedHolding) {
        resolvedHolding = row.portfolioHoldingName ?? null;
        if (!resolvedHolding && row.portfolioHoldingNameCt && dek) {
          try {
            resolvedHolding = decryptField(dek, row.portfolioHoldingNameCt);
          } catch {
            resolvedHolding = null;
          }
        }
      }
      row.portfolioHolding = resolvedHolding;
      // Symbol — same preference. The security's symbol equals the holding's for
      // tickered rows; null for cash → falls back to the holding's.
      let resolvedSymbol: string | null = null;
      if (securitiesRead && row.securitySymbolCt) {
        resolvedSymbol = decryptName(row.securitySymbolCt, dek, null);
      }
      if (resolvedSymbol == null) {
        resolvedSymbol = decryptName(row.portfolioHoldingSymbolCt, dek, row.portfolioHoldingSymbol);
      }
      row.portfolioHoldingSymbol = resolvedSymbol;
      delete row.accountNameCt;
      delete row.accountAliasCt;
      delete row.categoryNameCt;
      delete row.portfolioHoldingName;
      delete row.portfolioHoldingNameCt;
      delete row.portfolioHoldingSymbolCt;
      delete row.securityNameCt;
      delete row.securitySymbolCt;
      return row;
    });
  };

  let response: NextResponse;
  if (cursorMode) {
    const pageLimitRaw = params.get("limit") ? parseInt(params.get("limit")!, 10) : NaN;
    const pageLimit = Number.isFinite(pageLimitRaw) ? Math.min(200, Math.max(1, pageLimitRaw)) : 50;
    let page: Awaited<ReturnType<typeof getTransactionsPage>>;
    try {
      page = await getTransactionsPage(userId, { ...filters, cursor }, pageLimit);
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      throw err;
    }
    const total = cursorFirstPage
      ? (textIds ? textIds.length : await getTransactionCount(userId, sqlFilters))
      : undefined;
    response = NextResponse.json({
      data: shapeRows(page.rows),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      ...(total !== undefined ? { total } : {}),
    });
  } else {
    // Legacy: byte-identical {data,total} shape with limit/offset, total on every call.
    const rawRows = await getTransactions(userId, {
      ...filters,
      limit: params.get("limit") ? parseInt(params.get("limit")!) : 100,
      offset: params.get("offset") ? parseInt(params.get("offset")!) : 0,
    });
    const total = textIds ? textIds.length : await getTransactionCount(userId, sqlFilters);
    response = NextResponse.json({ data: shapeRows(rawRows), total });
  }
  if (etag) return withEtagHeaders(response, etag);
  return response;
}

export async function POST(request: NextRequest) {
  const auth = await requireEncryption(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const parsed = validateBody(body, postSchema);
    if (parsed.error) return parsed.error;
    const { repeat, ...rest } = parsed.data;
    const data = { ...rest };
    if (
      repeat &&
      (data.portfolioHolding || data.portfolioHoldingId != null || (data.quantity != null && data.quantity !== 0))
    ) {
      return NextResponse.json(
        { error: "Repeat is not supported for portfolio holding rows", code: "repeat_not_supported" },
        { status: 400 },
      );
    }

    const resolved = await resolveTxAmounts(data, auth.userId, false);
    if (!resolved.ok) return resolved.response;
    Object.assign(data, resolved.fields);

    // Validate the repeat (payee present, end vs first repeat date) before any
    // write; the subscription itself is created inside the DB transaction below.
    if (repeat) {
      planRepeat(repeat, {
        date: data.date,
        payee: data.payee,
        amount: Number(data.amount),
        currency: String(data.currency),
        accountId: data.accountId,
        categoryId: data.categoryId,
      });
    }

    // Cross-tenant FK guard (H-1) — verify the caller owns every FK id
    // supplied in the body BEFORE the resolver auto-creates anything or the
    // INSERT fires. `portfolioHoldingId` is checked when present; the name
    // resolver below scopes by `auth.userId` so the resolved-from-name path
    // can't cross tenants.
    await verifyOwnership(auth.userId, {
      accountIds: [data.accountId],
      categoryIds: [data.categoryId],
      holdingIds: data.portfolioHoldingId != null ? [data.portfolioHoldingId] : undefined,
    });

    // Resolve portfolioHolding name → portfolio_holdings.id when the caller
    // didn't supply the FK directly. Auto-creates a holding scoped to the
    // tx's account when missing — matches the import-pipeline behavior so
    // ad-hoc tx creation and bulk imports converge on the same FK.
    if (
      data.portfolioHoldingId == null &&
      data.portfolioHolding &&
      data.accountId != null
    ) {
      const resolver = await buildHoldingResolver(auth.userId, auth.dek);
      data.portfolioHoldingId =
        (await resolver.resolve(data.accountId, data.portfolioHolding)) ?? undefined;
    }
    // Phase 5: never persist the legacy text column. The FK is the source
    // of truth and the column is being dropped in a follow-up release.
    delete data.portfolioHolding;
    // FINLYNQ-97 — sign-vs-category check is advisory. Compute the message
    // BEFORE encryption / INSERT so it sees the post-resolve amount; row
    // lands regardless. A returned non-null error surfaces as `warning`
    // on the 201 body.
    const signWarn =
      data.amount != null
        ? await validateSignVsCategoryById(
            auth.userId,
            auth.dek,
            data.categoryId,
            Number(data.amount),
          )
        : null;
    const plainPayee = data.payee;
    const encrypted = encryptTxWrite(auth.dek, data);
    const { withDbTransaction } = await import("@/db");
    const { incrementDataVersion } = await import("@/lib/data-version");
    const { tx, repeatSub } = await withDbTransaction(async () => {
      // Repeat: the subscription and the booked row commit or roll back together.
      let sub: { id: number; created: boolean } | null = null;
      if (repeat) {
        sub = await createOrLinkRepeatSubscription(auth.userId, auth.dek, repeat, {
          date: data.date,
          payee: plainPayee,
          amount: Number(data.amount),
          currency: String(data.currency),
          accountId: data.accountId,
          categoryId: data.categoryId,
        });
      }
      const inserted = await createTransaction(
        auth.userId,
        { ...encrypted, source: "manual", ...(sub ? { subscriptionId: sub.id } : {}) },
        auth.dek,
      );
      await incrementDataVersion(auth.userId);
      return { tx: inserted, repeatSub: sub };
    });
    invalidateUserTxCache(auth.userId);
    // Portfolio lot tracking — open/close a lot when the row touches a
    // portfolio holding. Soft-fails internally; never blocks the REST
    // response on lot-side errors.
    if (tx && tx.portfolioHoldingId != null && tx.quantity != null && tx.quantity !== 0) {
      const ctx = await buildLotContext(auth.userId, auth.dek);
      await applyLotEffectsForTx(tx as TxRowForLots, ctx);
    }
    // Snapshot history is stale from this date forward. Investment rows stamp
    // the per-user investment marker; cash rows stamp the per-account cash
    // marker so the chart-load cash self-heal rebuilds ONLY this account from
    // this date forward (not full history across every cash account).
    if (tx && tx.portfolioHoldingId != null) {
      await markSnapshotsDirty(auth.userId, tx.date);
    } else if (tx && tx.accountId != null) {
      await markCashSnapshotsDirty(auth.userId, tx.accountId, tx.date);
    }
    return NextResponse.json(
      {
        ...tx,
        ...(signWarn ? { warning: signWarn.message } : {}),
        ...(repeatSub ? { subscription: repeatSub } : {}),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof RepeatError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (isPgErrorCode(error, "23505") && pgErrorConstraint(error) === "subscriptions_user_name_lookup_uniq") {
      return NextResponse.json(
        { error: "A subscription with this payee name already exists.", code: "repeat_subscription_name_conflict" },
        { status: 409 },
      );
    }
    if (error instanceof InvestmentHoldingRequiredError) {
      return NextResponse.json(
        { error: error.message, code: error.code, accountId: error.accountId },
        { status: 400 },
      );
    }
    if (error instanceof OwnershipError) {
      // 404 (not 403) — same shape as "not found" so the caller can't
      // distinguish "another user's id" from "non-existent id". H-1.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Postgres FK violation — typically a stale categoryId / accountId /
    // portfolioHoldingId from a stale UI form. Map to 400 with a friendly
    // pointer instead of leaking the SQL error as a 500.
    if (isPgErrorCode(error, "23503")) {
      return NextResponse.json(
        { error: "Pick a valid account, category, and portfolio holding — one of them no longer exists.", code: "fk_violation" },
        { status: 400 },
      );
    }
    await logApiError("POST", "/api/transactions", error, auth.userId);
    return NextResponse.json({ error: safeErrorMessage(error, "Failed to create transaction") }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireEncryption(request);
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const parsed = validateBody(body, putSchema);
    if (parsed.error) return parsed.error;
    const { id, confirmReallocation, ...data } = parsed.data;

    // Portfolio edit-guard (Phase 2 of the operations refactor). When a
    // buy/transfer-in tx's opened lot has been sold or transferred out, the
    // guard reports the dependent closures.
    //   - Without confirmReallocation → keep the existing 409 affordance so
    //     the client can fetch the reallocation preview (FINLYNQ-176).
    //   - With confirmReallocation → re-plan the dependent closures against
    //     the post-edit inventory instead of refusing.
    const guard = await canEditPortfolioRow(auth.userId, id);
    const reallocate = !guard.allowed && confirmReallocation === true;
    const dependentCloseTxIds = guard.blockingClosureTxIds ?? [];
    if (!guard.allowed && !reallocate) {
      return NextResponse.json(
        {
          error: guard.reason,
          code: "portfolio_edit_blocked",
          blockingClosureTxIds: dependentCloseTxIds,
        },
        { status: 409 },
      );
    }

    // Fetch current transaction's entered_* fields for amount-only update handling.
    // This is used by resolveTxAmounts to keep cross-currency transactions consistent
    // when only the amount is being updated.
    let currentTx: { enteredCurrency?: string | null; enteredAmount?: number | null } = {};
    if (data.amount !== undefined && data.enteredAmount === undefined && data.enteredCurrency === undefined) {
      const curr = await db
        .select({
          enteredCurrency: schema.transactions.enteredCurrency,
          enteredAmount: schema.transactions.enteredAmount,
        })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.id, id),
            eq(schema.transactions.userId, auth.userId),
          ),
        )
        .get();
      if (curr) currentTx = curr;
    }

    const resolved = await resolveTxAmounts(data, auth.userId, true, currentTx);
    if (!resolved.ok) return resolved.response;
    Object.assign(data, resolved.fields);

    // Cross-tenant FK guard (H-1). The transaction id itself is checked by
    // the SQL `eq(transactions.userId, ...)` in `updateTransaction`, but the
    // FK ids in the update body would otherwise re-attribute the row to
    // another user's account/category/holding.
    await verifyOwnership(auth.userId, {
      accountIds: data.accountId != null ? [data.accountId] : undefined,
      categoryIds: data.categoryId != null ? [data.categoryId] : undefined,
      // `null` is an explicit clear-the-FK; only verify positive ids.
      holdingIds:
        data.portfolioHoldingId != null && data.portfolioHoldingId > 0
          ? [data.portfolioHoldingId]
          : undefined,
    });

    // Same name→id resolution as POST. Only runs when caller passed a name
    // without explicitly supplying (or nulling) the FK.
    if (
      data.portfolioHoldingId === undefined &&
      data.portfolioHolding &&
      data.accountId != null
    ) {
      const resolver = await buildHoldingResolver(auth.userId, auth.dek);
      data.portfolioHoldingId =
        (await resolver.resolve(data.accountId, data.portfolioHolding)) ?? undefined;
    }
    // Phase 5: never persist the legacy text column.
    delete data.portfolioHolding;
    // FINLYNQ-97 — sign-vs-category check is advisory on PUT too. Compute
    // the post-merge amount + category by falling back to the existing
    // row's values when the patch doesn't touch them, then validate.
    // The row is updated either way; a non-null result is attached as
    // `warning` on the 200 body.
    let signWarn: { message: string } | null = null;
    if (data.amount !== undefined || data.categoryId !== undefined) {
      const current = await db
        .select({
          amount: schema.transactions.amount,
          categoryId: schema.transactions.categoryId,
        })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.id, id),
            eq(schema.transactions.userId, auth.userId),
          ),
        )
        .get();
      if (current) {
        const postAmount =
          data.amount !== undefined ? data.amount : current.amount;
        const postCategoryId =
          data.categoryId !== undefined ? data.categoryId : current.categoryId;
        if (postAmount != null) {
          signWarn = await validateSignVsCategoryById(
            auth.userId,
            auth.dek,
            postCategoryId,
            Number(postAmount),
          );
        }
      }
    }
    // Capture the PRE-EDIT position so a date-moved-later or cross-account edit
    // dirties the OLD (account, date) too — otherwise stamping only the new date
    // misses the day the row LEFT. LEAST coalescing makes double-stamping safe.
    let preEditCash: { accountId: number; date: string } | null = null;
    let preEditInvestmentDate: string | null = null;
    try {
      const before = await db
        .select({
          accountId: schema.transactions.accountId,
          date: schema.transactions.date,
          portfolioHoldingId: schema.transactions.portfolioHoldingId,
        })
        .from(schema.transactions)
        .where(
          and(
            eq(schema.transactions.id, id),
            eq(schema.transactions.userId, auth.userId),
          ),
        )
        .get();
      if (before) {
        if (before.portfolioHoldingId != null) {
          preEditInvestmentDate = before.date;
        } else if (before.accountId != null) {
          preEditCash = { accountId: before.accountId, date: before.date };
        }
      }
    } catch {
      /* best-effort — never block the edit */
    }
    const encrypted = encryptTxWrite(auth.dek, data);
    const { withDbTransaction } = await import("@/db");
    const { incrementDataVersion } = await import("@/lib/data-version");
    const tx = await withDbTransaction(async () => {
      const updated = await updateTransaction(id, auth.userId, encrypted, auth.dek);
      await incrementDataVersion(auth.userId);
      return updated;
    });
    invalidateUserTxCache(auth.userId);
    if (reallocate) {
      // FINLYNQ-176 — the edited buy/transfer-in had dependent closures.
      // Re-plan them against the post-edit inventory (strict, all-or-nothing):
      // reverse dependents + target, redo the edited target, re-close each
      // dependent (FIFO + auto-short). Throws on any error → 500 rollback.
      await replanLotsAfterMutation(
        auth.userId,
        { op: "edit", targetTxId: id, dependentCloseTxIds },
        { dryRun: false, dek: auth.dek },
      );
    } else {
      // Portfolio lot tracking — UPDATE may have changed quantity / amount /
      // category / holding, so the conservative move is reverse + redo.
      // Pure-metadata edits (note / payee / tags / date) still spend the
      // reverse cycle, but reverseLotsForDeleteHook is a no-op when there
      // are no lots tied to this tx.
      await reverseLotsForDeleteHook(auth.userId, id);
      if (tx && tx.portfolioHoldingId != null && tx.quantity != null && tx.quantity !== 0) {
        const ctx = await buildLotContext(auth.userId, auth.dek);
        await applyLotEffectsForTx(tx as TxRowForLots, ctx);
      }
    }
    // Snapshot history is stale from this date forward (a back-dated edit can
    // move the affected date earlier than today). Stamp the NEW position's
    // marker, plus the PRE-EDIT position's marker so a date/account move dirties
    // both ends. Investment → per-user marker; cash → per-account marker.
    if (tx && tx.portfolioHoldingId != null) {
      await markSnapshotsDirty(auth.userId, tx.date);
    } else if (tx && tx.accountId != null) {
      await markCashSnapshotsDirty(auth.userId, tx.accountId, tx.date);
    }
    if (preEditInvestmentDate) {
      await markSnapshotsDirty(auth.userId, preEditInvestmentDate);
    }
    if (preEditCash) {
      await markCashSnapshotsDirty(auth.userId, preEditCash.accountId, preEditCash.date);
    }
    return NextResponse.json(
      signWarn ? { ...tx, warning: signWarn.message } : tx,
    );
  } catch (error: unknown) {
    if (error instanceof InvestmentHoldingRequiredError) {
      return NextResponse.json(
        { error: error.message, code: error.code, accountId: error.accountId },
        { status: 400 },
      );
    }
    if (error instanceof OwnershipError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (isPgErrorCode(error, "23503")) {
      return NextResponse.json(
        { error: "Pick a valid account, category, and portfolio holding — one of them no longer exists.", code: "fk_violation" },
        { status: 400 },
      );
    }
    await logApiError("PUT", "/api/transactions", error, auth.userId);
    return NextResponse.json({ error: safeErrorMessage(error, "Failed to update transaction") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  // DELETE doesn't need the DEK — IDs and user-scope only.
  const auth = await requireAuth(request);
  if (!auth.authenticated) return auth.response;
  const { userId } = auth.context;
  const params = request.nextUrl.searchParams;
  const id = parseInt(params.get("id") ?? "0");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // FINLYNQ-176 — `?confirmReallocation=1` opts into warn-and-reallocate
  // instead of the hard `portfolio_edit_blocked` 409.
  const confirmReallocation = params.get("confirmReallocation") === "1";
  // Repeat + Installment: `scope=following` deletes this instalment AND every
  // later one (higher installment_seq) of the same group. Default `this`.
  const scope = params.get("scope") ?? "this";
  if (scope !== "this" && scope !== "following") {
    return NextResponse.json({ error: 'scope must be "this" or "following"', code: "invalid_scope" }, { status: 400 });
  }

  // Thin wrapper (2026-07-30): expansion, edit-guard, lot reversal, the
  // single-statement delete, the dirty markers and the tx-cache invalidation
  // all live in `deleteTransactionsCascade` so the bulk / MCP / stdio delete
  // paths get identical semantics. Only the HTTP shaping stays here.
  try {
    const { withDbTransaction } = await import("@/db");
    const { incrementDataVersion } = await import("@/lib/data-version");
    let notInstallment = false;
    const outcome = await withDbTransaction(async () => {
      let ids = [id];
      if (scope === "following") {
        const seed = await db
          .select({
            groupId: schema.transactions.installmentGroupId,
            seq: schema.transactions.installmentSeq,
          })
          .from(schema.transactions)
          .where(and(eq(schema.transactions.id, id), eq(schema.transactions.userId, userId)))
          .get();
        // Not owned / missing: fall through to the cascade's own not_found (404).
        if (seed) {
          if (!seed.groupId || seed.seq == null) {
            notInstallment = true;
            return null;
          }
          const later = await db
            .select({ id: schema.transactions.id })
            .from(schema.transactions)
            .where(and(
              eq(schema.transactions.userId, userId),
              eq(schema.transactions.installmentGroupId, seed.groupId),
              gte(schema.transactions.installmentSeq, seed.seq),
            ))
            .all();
          ids = Array.from(new Set([id, ...later.map((r) => r.id)]));
        }
      }
      const o = await deleteTransactionsCascade(userId, ids, {
        confirmReallocation,
        requireAllSeeds: true,
      });
      if (o.ok) await incrementDataVersion(userId);
      return o;
    });
    if (notInstallment || !outcome) {
      return NextResponse.json(
        { error: "scope=following only applies to installment transactions", code: "not_installment" },
        { status: 400 },
      );
    }
    if (!outcome.ok) {
      if (outcome.reason === "not_found") {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      // FINLYNQ-176 — keep the 409 affordance so the client can fetch the
      // reallocation preview before retrying with ?confirmReallocation=1.
      return NextResponse.json(
        {
          error: outcome.message,
          code: "portfolio_edit_blocked",
          blockingClosureTxIds: outcome.blockingClosureTxIds,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({
      success: true,
      deletedIds: outcome.deletedIds,
      cascaded: outcome.cascaded,
      ...(outcome.reallocated.length > 0 ? { reallocated: outcome.reallocated } : {}),
    });
  } catch (error: unknown) {
    await logApiError("DELETE", "/api/transactions", error, userId);
    return NextResponse.json(
      { error: safeErrorMessage(error, "Failed to delete transaction") },
      { status: 500 },
    );
  }
}
