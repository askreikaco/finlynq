"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { Overlay } from "@/components/ui/overlay";
import { Notice } from "@/components/notice";
import { Badge } from "@/components/ui/badge";
import { Receipt, Search, X, AlertTriangle, ArrowRightLeft, ArrowDownUp, ListChecks, TrendingUp, Download, ShoppingCart, Banknote, Repeat, Send, HandCoins, CircleDollarSign, ArrowDownToLine, ArrowUpFromLine, Plus, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { portfolioEditHref, transactionEditHref, transactionSplitHref } from "@/lib/transactions/edit-flow";
import { MobileTxList } from "@/components/transactions/mobile-tx-list";
import { type TransactionSource, labelForSource } from "@/lib/tx-source";
import { buildPrefill, writePrefill, canDuplicate } from "@/lib/transactions/prefill";
import { COLUMN_LABELS as SHARED_COLUMN_LABELS } from "@/lib/transactions/columns";
import type {
  Transaction,
} from "../_types";
import { useLookups, useTxFilterPrefs } from "../_hooks/use-tx-prefs";
import { useTransactions } from "../_hooks/use-transactions";
import { TransactionSheet } from "./transaction-sheet";
import { buildTransactionQuery } from "@/lib/transactions/build-query";
import { buildTxDrillUrl } from "@/lib/transactions/drill-url";
import { exportCsv, type CsvColumn } from "@/lib/csv-export";
import { todayISO } from "@/lib/utils/date";
import { PageToolbar } from "@/components/page-toolbar";
import { useTransactionsToolbar, type TransactionsToolbarState } from "../_hooks/use-transactions-toolbar";
import { TRANSACTION_FILTER_KEYS } from "@/lib/toolbar/list-configs";
import type { RangeSelection } from "@/lib/metrics/period";
import type { SortPref } from "../_types";
import { LotReallocationNotice } from "@/components/portfolio/lot-reallocation-notice";
import type { LotReallocationPreview } from "@/lib/portfolio/lots/types";
import { PageHeader, ListDetailLayout, useListDetail } from "@/components/mobile";
import { TransactionFormScreen } from "./transaction-form-screen";
import { withSel } from "@/lib/list-detail/selection";
import { useTransferPeers } from "../_hooks/use-transfer-peers";
import { PendingSyncBadge } from "@/components/transactions/pending-sync-badge";
import { applyPendingToTransactions, countPendingDeletes } from "@/lib/transactions/pending-overlay";
import { canQueueOfflineDelete, isNetworkFailure } from "@/lib/transactions/entry-mode";
import { Field, type FieldComboboxOption } from "@/components/ui/field";
import { discardQueuedCreate, isLocalWriteQueueActive, queueOfflineDelete, usePendingTransactions } from "@/lib/data/local-write-queue";

/**
 * TransactionsWorkspace — the full transactions surface (filters, per-column
 * customize, header sort, multi-select bulk update/delete, CSV export,
 * pagination, add/edit/split dialogs). Extracted from the `/transactions` page
 * so it can be REUSED verbatim on the account detail page (DRY).
 *
 * `/transactions` renders it with no props (full page). `/accounts/[id]`
 * renders it with `lockedAccountId` set, which:
 *   - seeds + FORCES the account filter to that account,
 *   - hides the account picker (the view is already scoped),
 *   - disables the URL⇄filter sync (the embedding page owns the URL/hash).
 * `showHeader={false}` drops the page title + Add-Transaction buttons (the
 * account page has its own quick-actions), and `onDataChange` lets the
 * embedding page refresh sibling data (e.g. the account balance header) after
 * any create/edit/delete/bulk mutation.
 */
export interface TransactionsWorkspaceProps {
  /** When set, scope the workspace to this account: force + hide the account
   *  filter and disable URL sync so it can be embedded in a page that owns the
   *  URL (e.g. `/accounts/[id]`). */
  lockedAccountId?: number;
  /** Render the page header (title + Add Transaction split-button). Default
   *  true; the account page passes false and keeps its own quick-actions. */
  showHeader?: boolean;
  /** Called after any create / edit / delete / bulk mutation so an embedding
   *  page can refresh sibling data (e.g. the account balance header). */
  onDataChange?: () => void;
  /** Toolbar state owned by the embedding page (it renders the PageToolbar itself, e.g. /accounts/[id] shares the
   *  range with its metric cards). Omit on /transactions: the workspace owns both state and toolbar. */
  toolbar?: TransactionsToolbarState;
}

/** URL params of a single-record drill (deep link / holding / tag): all dates unless a range was picked. */
const DRILL_KEYS = ["id", "portfolioHolding", "tag"] as const;
const OWNED_URL_KEYS = [...TRANSACTION_FILTER_KEYS, "search", "sort", "dir", "startDate", "endDate", ...DRILL_KEYS];

export function TransactionsWorkspace({
  lockedAccountId,
  showHeader = true,
  onDataChange,
  toolbar: toolbarProp,
}: TransactionsWorkspaceProps = {}) {
  const locked = lockedAccountId != null;
  const urlParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // Lookups (accounts / categories / holdings) — extracted to useLookups
  // (FINLYNQ-111 Phase 2). Same uncoordinated mount-time parallel fetch.
  const { accounts, categories } = useLookups();
  const sortAccount = useDropdownOrder("account");
  const sortCategory = useDropdownOrder("category");
  // Filter state is synced FROM the URL via the `useEffect` below (not a
  // `useState(urlParams.get(...))` initialiser). `useState` only runs on
  // mount, so client-side drill-through navigation while already on
  // `/transactions` (e.g. clicking a dashboard/budget/portfolio drill link)
  // would NOT remount the component and the new query params were silently
  // ignored, leaving stale filters in place (FINLYNQ-130). The effect
  // re-syncs `filters` + `searchInput` and resets the page on every
  // `urlParams` change so a drill REPLACES (not merges) the prior filters.
  // `portfolioHolding` is a server-side post-decrypt filter (ciphertext-at-
  // rest on this column), `accountId` is a standard SQL filter.
  //
  // When `locked`, the account filter is seeded to `lockedAccountId` and the
  // URL⇄filter sync below keeps that forced accountId and only applies the
  // mobile search filters (dates, category, text, direction, amount range).
  const [filters, setFilters] = useState({
    // FINLYNQ-177 — single-transaction deep link (`/transactions?id=<n>`).
    id: "",
    startDate: "",
    endDate: "",
    accountId: locked ? String(lockedAccountId) : "",
    categoryId: "",
    search: "",
    portfolioHolding: "",
    tag: "",
    direction: "",
    minAmount: "",
    maxAmount: "",
  });

  const COLUMN_LABELS = SHARED_COLUMN_LABELS;

  // Set up setPage to reset the page slice via resetPageRef
  const resetPageRef = useRef<() => void>(() => {});
  const setPage = useCallback((_p?: number) => {
    resetPageRef.current();
  }, []);

  // FINLYNQ-130 — re-sync filters from the URL on every navigation (including
  // client-side drill-through while already mounted on /transactions). Resets
  // the page index and the controlled search input so a drill fully REPLACES
  // any prior filter state rather than merging into it. Skipped when `locked`
  // (the account-scoped embed keeps its forced accountId and ignores the URL).
  const filterKey = useMemo(() => {
    const q = new URLSearchParams(urlParams.toString());
    q.delete("sel");
    q.delete("prefill");
    return q.toString();
  }, [urlParams]);
  useEffect(() => {
    if (locked) {
      // Account-scoped embed: the account stays forced, but the mobile search
      // page's filters (returned via the URL) still apply.
      setFilters((f) => ({
        ...f,
        accountId: String(lockedAccountId),
        startDate: urlParams.get("startDate") ?? "",
        endDate: urlParams.get("endDate") ?? "",
        categoryId: urlParams.get("categoryId") ?? "",
        search: urlParams.get("search") ?? "",
        direction: urlParams.get("direction") ?? "",
        minAmount: urlParams.get("minAmount") ?? "",
        maxAmount: urlParams.get("maxAmount") ?? "",
      }));
      setPage(0);
      return;
    }
    setFilters({
      // FINLYNQ-177 — single-tx id deep link is URL-driven like the rest, so a
      // drill while already mounted REPLACES (not merges) prior filters.
      id: urlParams.get("id") ?? "",
      startDate: urlParams.get("startDate") ?? "",
      endDate: urlParams.get("endDate") ?? "",
      accountId: urlParams.get("accountId") ?? "",
      categoryId: urlParams.get("categoryId") ?? "",
      search: urlParams.get("search") ?? "",
      portfolioHolding: urlParams.get("portfolioHolding") ?? "",
      tag: urlParams.get("tag") ?? "",
      direction: urlParams.get("direction") ?? "",
      minAmount: urlParams.get("minAmount") ?? "",
      maxAmount: urlParams.get("maxAmount") ?? "",
    });
    setPage(0);
    // The split view keeps its selection in ?sel (and a Duplicate hands its prefill over in ?prefill): neither is a
    // filter, so a selection change must not reset the filters or the page (filterKey ignores them).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, locked, lockedAccountId]);

  // Header sort and per-column filters (the list has no columns; both are set from the compact
  // sort control and the active-filter chips). Each hook owns the load-on-mount + debounced-PUT
  // effects. `setColFilter` resets the page to 0 via the onChange callback.
  const { colFilters, setColFilters, setColFilter } = useTxFilterPrefs(() => setPage(0));

  // Toolbar: range (dates), search and sort come from the toolbar state, the rest of the filters from the URL sync above.
  const ownToolbar = useTransactionsToolbar();
  const tb = toolbarProp ?? ownToolbar;
  const [rangeTouched, setRangeTouched] = useState(false);
  const legacyDates = !!(urlParams.get("startDate") || urlParams.get("endDate"));
  const drill = !locked && !rangeTouched && !legacyDates && !urlParams.has("range") && DRILL_KEYS.some((k) => urlParams.get(k));
  // What the dropdown shows: a link carrying startDate/endDate (or a record drill) reads as Custom, not "This month".
  const toolbarSelection: RangeSelection = legacyDates
    ? { range: "custom", from: urlParams.get("startDate") || undefined, to: urlParams.get("endDate") || undefined }
    : drill ? { range: "custom" } : tb.range.selection;
  const rangeStart = legacyDates ? (urlParams.get("startDate") ?? "") : drill ? "" : tb.range.period.start;
  const rangeEnd = legacyDates ? (urlParams.get("endDate") ?? "") : drill ? "" : tb.range.period.end;
  // "Date" and "Amount" sort server-side. Name is not offered: payee and note are encrypted at rest.
  const sortPref = useMemo<SortPref>(
    () => ({ columnId: tb.list.sort.sort === "amount" ? "amount" : "date", direction: tb.list.sort.dir }),
    [tb.list.sort.sort, tb.list.sort.dir],
  );
  const [debouncedQ, setDebouncedQ] = useState(tb.list.q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(tb.list.q), 350);
    return () => clearTimeout(t);
  }, [tb.list.q]);
  const rawFilters = filters;
  const effFilters = useMemo(
    () => ({ ...rawFilters, search: debouncedQ, startDate: rangeStart, endDate: rangeEnd }),
    [rawFilters, debouncedQ, rangeStart, rangeEnd],
  );
  function changeRange(next: RangeSelection) {
    setRangeTouched(true);
    tb.range.setSelection(next);
    if (legacyDates) {
      const q = new URLSearchParams(urlParams.toString());
      q.delete("startDate");
      q.delete("endDate");
      router.replace(`${pathname}${q.toString() ? `?${q.toString()}` : ""}`);
    }
  }

  // Main list (txns / total / loading) + loadTxns + infinite scroll loadNextPage
  const { txns: serverTxns, total, loading, limit, loadTxns, loadNextPage, resetPage, hasMore, loadError, loadMoreError, isLoadingMore } = useTransactions(
    effFilters,
    sortPref,
    colFilters,
    accounts,
    1,
    // Account-scoped embed (/accounts/[id]) lists every row of that account, investment included.
    // The /transactions page (unlocked) stays on the builder default: scope=daily.
    locked ? "all" : undefined,
  );
  // Offline queue (flag off: the shared empty snapshot, so `txns` is `serverTxns` itself): queued creates on top,
  // queued edits overlaid, queued deletes hidden. One list feeds both Cards and List.
  const pendingTx = usePendingTransactions();
  const txns = useMemo(
    () => applyPendingToTransactions(serverTxns, pendingTx, { accounts, categories, filters: effFilters, hasColFilters: colFilters.length > 0 }),
    [serverTxns, pendingTx, accounts, categories, effFilters, colFilters],
  );
  const pendingDeleteCount = countPendingDeletes(pendingTx);
  // Assigned in an effect (not during render); setPage is only called from handlers and effects.
  useEffect(() => { resetPageRef.current = resetPage; }, [resetPage]);

  // Infinite scroll trigger via native IntersectionObserver
  const observerTargetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = observerTargetRef.current;
    if (!target || !hasMore) return;
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // One page in flight at a time. A failed later page waits for the Retry
        // control; the sentinel must not re-request it on every observer restart.
        if (entries[0]?.isIntersecting && !loading && !isLoadingMore && !loadMoreError) {
          loadNextPage();
        }
      },
      {
        root: null,
        rootMargin: "200px",
        threshold: 0,
      }
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [loadNextPage, hasMore, loading, isLoadingMore, loadMoreError]);

  // Post-mutation refresh: reload the list AND notify the embedding page so it
  // can refresh sibling data (e.g. the account balance header). Used after
  // every create / edit / delete / bulk action below.
  const afterMutate = useCallback(() => {
    loadTxns();
    onDataChange?.();
  }, [loadTxns, onDataChange]);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  // Phase 2 portfolio-ops refactor: server returns 409 with this shape when
  // the row being deleted is the open-tx of a lot that's already been sold
  // or transferred out. UI surfaces the blocking tx ids so the user knows
  // exactly which rows to delete first.
  const [deleteBlockedError, setDeleteBlockedError] = useState<{
    message: string;
    blockingIds: number[];
  } | null>(null);
  const [deleteConfirmPayee, setDeleteConfirmPayee] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => { setDeleteError(null); }, [deleteConfirmId]);
  // FINLYNQ-176 — warn-and-reallocate. When a delete is lot-locked, fetch the
  // dry-run preview so the user can see the proposed reallocation (affected
  // calendar years + any short lot that will open) and choose to proceed.
  const [reallocPreview, setReallocPreview] = useState<LotReallocationPreview | null>(null);
  const [reallocLoading, setReallocLoading] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Split view (list 3/4 | the entry form 1/4) from regular up, selection in ?sel. Off in the account-scoped embed.
  const listDetail = useListDetail();
  const splitView = listDetail.split && !locked;
  // Other leg of each transfer row, so rows can show "From … To …".
  const transferPeers = useTransferPeers(txns);
  // Bulk select is a mode of the one list: "Select" shows row checkboxes; leaving it drops the selection.
  const [selectMode, setSelectMode] = useState(false);
  // Row detail sheet (a row tap on a narrow or regular screen, or split view off).
  const [sheetTx, setSheetTx] = useState<Transaction | null>(null);
  function toggleSelectMode() {
    if (selectMode) setSelected(new Set());
    setSelectMode(!selectMode);
  }
  const [bulkAction, setBulkAction] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkAccountId, setBulkAccountId] = useState("");
  const [bulkDate, setBulkDate] = useState("");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkPayee, setBulkPayee] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  function clearFilters() {
    // When locked, keep the account scope — only the OTHER filters clear.
    setFilters({ id: "", startDate: "", endDate: "", accountId: locked ? String(lockedAccountId) : "", categoryId: "", search: "", portfolioHolding: "", tag: "", direction: "", minAmount: "", maxAmount: "" });
    tb.list.setQ("");
    // The toolbar's filters and sort live in the URL: drop them there too (the range stays).
    const q = new URLSearchParams(urlParams.toString());
    for (const k of OWNED_URL_KEYS) q.delete(k);
    router.replace(`${pathname}${q.toString() ? `?${q.toString()}` : ""}`);
    // Issue #59 — also wipe the per-column filters.
    setColFilters([]);
    setPage(0);
  }

  // ── CSV export of the current filtered view ──────────────────────────
  // Re-fetches GET /api/transactions with the SAME buildTransactionQuery the
  // table uses (FINLYNQ-115 — never hand-roll params), but with page 0 + a
  // high limit so a single request returns the whole filtered set.
  const [exporting, setExporting] = useState(false);
  const exportColumns: CsvColumn<Transaction>[] = [
    { header: "Date", accessor: (t) => t.date },
    { header: "Account", accessor: (t) => t.accountAlias || t.accountName },
    { header: "Category", accessor: (t) => t.categoryName },
    { header: "Payee", accessor: (t) => t.payee },
    { header: "Note", accessor: (t) => t.note },
    { header: "Tags", accessor: (t) => t.tags },
    { header: "Quantity", accessor: (t) => t.quantity ?? "" },
    { header: "Amount", accessor: (t) => t.amount },
    { header: "Currency", accessor: (t) => t.currency },
    { header: "Investment", accessor: (t) => t.portfolioHolding ?? "" },
    { header: "Source", accessor: (t) => t.source ?? "" },
  ];

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      // Same builder + filter/sort state the table uses; page 0 + high limit
      // pulls the entire filtered view in one shot. Export matches the screen:
      // daily on /transactions, everything in an account-locked embed.
      // Intentionally NO cursor: this is the legacy (non-cursor) mode, kept on
      // purpose for export. The paged list uses cursor mode; export does not.
      const params = buildTransactionQuery({ ...effFilters, scope: locked ? "all" : "daily" }, sortPref, colFilters, accounts, {
        page: 0,
        limit: 100000,
      });
      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) return;
      const json: { data?: Transaction[] } = await res.json();
      const rows = json.data ?? [];
      exportCsv(rows, exportColumns, `transactions-${todayISO()}.csv`);
    } finally {
      setExporting(false);
    }
  }

  /** Where Back on an edit page should return: the list as it is right now (filters, page). */
  function currentReturnTo(): string {
    return typeof window === "undefined" ? "/transactions" : `${window.location.pathname}${window.location.search}`;
  }

  /** Edit-row entry point: navigates to the edit page. That page loads the row and
   *  hands transfer pairs to the transfer edit page and portfolio rows to their op page. */
  function startEdit(t: Transaction) {
    if (t.pendingSync) {
      // A failed entry is resolved in Settings > Data (Retry / Discard); a queued create reopens the entry screen
      // prefilled from the outbox; other queued rows have nothing newer on the server to edit yet.
      if (t.pendingSync.status === "failed") router.push("/settings/data");
      else if (t.pendingSync.kind === "create") router.push(`/transactions/new?queued=${encodeURIComponent(t.pendingSync.opId)}`);
      return;
    }
    openEditPage(t);
  }

  /** Row tap: split view selects the row into the detail pane; otherwise the row's detail sheet opens (queued rows too). */
  function handleOpenRow(t: Transaction) {
    if (splitView) {
      // Queued rows and investment rows keep their own editors; every other row opens in the pane.
      if (t.pendingSync || portfolioEditHref(t.kind, t.id)) {
        startEdit(t);
        return;
      }
      listDetail.select(t.id);
      return;
    }
    setSheetTx(t);
  }

  /** Full edit page: portfolio rows go to their op page, everything else to /transactions/[id]/edit. */
  function openEditPage(t: Transaction) {
    const portfolioHref = portfolioEditHref(t.kind, t.id);
    router.push(portfolioHref ?? transactionEditHref(t.id, currentReturnTo()));
  }

  // Offline delete: whether the row being confirmed has splits, read while the request still works (queue active only).
  const splitsCheckRef = useRef<{ id: number; result: Promise<boolean | null> } | null>(null);

  function confirmDelete(t: Transaction) {
    if (t.id > 0 && isLocalWriteQueueActive()) {
      splitsCheckRef.current = {
        id: t.id,
        result: fetch(`/api/transactions/splits?transactionId=${t.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d: unknown) => (Array.isArray(d) ? d.length > 0 : null))
          .catch(() => null),
      };
    }
    setDeleteConfirmId(t.id);
    setDeleteConfirmPayee(t.payee || `Transaction #${t.id}`);
  }

  /** Network failure on a simple row: keep the delete on this device (hidden from the list, synced later). */
  async function queueDeleteOffline(err: unknown, id: number): Promise<boolean> {
    if (!isLocalWriteQueueActive() || !isNetworkFailure(err)) return false;
    const row = txns.find((x) => x.id === id);
    const chk = splitsCheckRef.current;
    if (!row || row.pendingSync || !chk || chk.id !== id) return false;
    if (!canQueueOfflineDelete({ queueActive: true, error: err, row, hasSplits: await chk.result })) return false;
    if (!(await queueOfflineDelete(id, row as unknown as Record<string, unknown>))) return false;
    setDeleting(false);
    setDeleteConfirmId(null);
    return true;
  }

  async function handleDelete() {
    if (!deleteConfirmId) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteBlockedError(null);
    if (deleteConfirmId < 0) {
      // A queued create deleted before it synced: drop the outbox entry, nothing goes to the server.
      const opId = txns.find((x) => x.id === deleteConfirmId)?.pendingSync?.opId;
      const dropped = opId ? await discardQueuedCreate(opId) : false;
      setDeleting(false);
      if (!dropped) {
        setDeleteError("This entry is being sent right now. Try again in a moment.");
        return;
      }
      setDeleteConfirmId(null);
      return;
    }
    let res: Response;
    try {
      res = await fetch(`/api/transactions?id=${deleteConfirmId}`, { method: "DELETE" });
    } catch (netErr) {
      // Flag off / not eligible / online: nothing is queued and the error path is exactly what it was.
      if (await queueDeleteOffline(netErr, deleteConfirmId)) return;
      throw netErr;
    }
    setDeleting(false);
    if (!res.ok) {
      // Portfolio edit-guard refusal. The server returns 409 + the list of
      // dependent closure tx ids when the row being deleted opens a lot that's
      // been sold or transferred out. FINLYNQ-176 — instead of dead-ending,
      // fetch the reallocation preview so the user can proceed.
      const data = await res.json().catch(() => ({}));
      if (data?.code === "portfolio_edit_blocked") {
        const blockingIds: number[] = Array.isArray(data.blockingClosureTxIds)
          ? (data.blockingClosureTxIds as number[])
          : [];
        setDeleteBlockedError({
          message: data.error ?? "Delete blocked by portfolio dependencies",
          blockingIds,
        });
        // Fetch the dry-run reallocation preview (best-effort).
        setReallocPreview(null);
        setReallocLoading(true);
        try {
          const pRes = await fetch("/api/transactions/lot-replan-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "delete", id: deleteConfirmId }),
          });
          if (pRes.ok) {
            const pData = await pRes.json().catch(() => null);
            if (pData?.preview) setReallocPreview(pData.preview as LotReallocationPreview);
          }
        } finally {
          setReallocLoading(false);
        }
        return;
      }
      setDeleteError(data?.error ?? `Delete failed (${res.status})`);
      return;
    }
    setDeleteConfirmId(null);
    setReallocPreview(null);
    afterMutate();
  }

  // FINLYNQ-176 — proceed with the lot-locked delete, reallocating dependents.
  async function handleReallocateDelete() {
    if (!deleteConfirmId) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await fetch(
      `/api/transactions?id=${deleteConfirmId}&confirmReallocation=1`,
      { method: "DELETE" },
    );
    setDeleting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data?.error ?? `Delete failed (${res.status})`);
      return;
    }
    setDeleteConfirmId(null);
    setDeleteBlockedError(null);
    setReallocPreview(null);
    afterMutate();
  }

  function startDuplicate(t: Transaction) {
    if (!canDuplicate(t, t.currency)) return;
    writePrefill(buildPrefill(t));
    router.push("/transactions/new?prefill=1");
  }

  function openSplitDialog(t: Transaction) {
    router.push(transactionSplitHref(t.id, currentReturnTo()));
  }

  // Bulk selection helpers
  const allSelected = txns.length > 0 && txns.every((t) => t.pendingSync || selected.has(t.id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(txns.filter((t) => !t.pendingSync).map((t) => t.id)));
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function resetBulkFields() {
    setBulkCategoryId("");
    setBulkAccountId("");
    setBulkDate("");
    setBulkNote("");
    setBulkPayee("");
    setBulkTags("");
  }

  async function executeBulkAction() {
    if (!someSelected) return;
    const ids = Array.from(selected);

    if (bulkAction === "delete") {
      setBulkDeleteConfirm(true);
      return;
    }

    setBulkProcessing(true);
    const body: Record<string, unknown> = { action: bulkAction, ids };
    if (bulkAction === "update_category") body.categoryId = Number(bulkCategoryId);
    if (bulkAction === "update_account") body.accountId = Number(bulkAccountId);
    if (bulkAction === "update_date") body.date = bulkDate;
    if (bulkAction === "update_note") body.note = bulkNote;
    if (bulkAction === "update_payee") body.payee = bulkPayee;
    if (bulkAction === "update_tags") body.tags = bulkTags;

    await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSelected(new Set());
    setBulkAction("");
    resetBulkFields();
    setBulkProcessing(false);
    afterMutate();
  }

  async function confirmBulkDelete() {
    setBulkProcessing(true);
    await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", ids: Array.from(selected) }),
    });
    setSelected(new Set());
    setBulkAction("");
    setBulkDeleteConfirm(false);
    setBulkProcessing(false);
    afterMutate();
  }

  const isBulkApplyDisabled =
    bulkProcessing ||
    !bulkAction ||
    (bulkAction === "update_category" && !bulkCategoryId) ||
    (bulkAction === "update_account" && !bulkAccountId) ||
    (bulkAction === "update_date" && !bulkDate) ||
    (bulkAction === "update_note" && bulkNote === "" && bulkAction === "update_note") ||
    (bulkAction === "update_payee" && bulkPayee === "" && bulkAction === "update_payee");

  // Pagination math + control now live in the shared <Pagination>
  // (src/components/ui/pagination.tsx) — extracted from here verbatim so the
  // admin users table could reuse it instead of forking a third copy.

  // Split allocated total for inline split editor
  // Chips / clear-all / embedded Select+Export row; with the page header, an otherwise-empty row is not rendered.
  const hasToolsRow =
    !showHeader ||
    !!(filters.id || filters.startDate || filters.endDate || (!locked && filters.accountId) || filters.categoryId || filters.search || filters.portfolioHolding || filters.tag) ||
    colFilters.length > 0 ||
    tb.list.activeCount > 0;
  if (loadError) return <Notice variant="error" title="Couldn't load transactions" retry={() => { void loadTxns(); }}>{"We couldn't load your transactions. Please try again."}</Notice>;

  return (
    /* FINLYNQ-52 (was issue #59 workaround): the (app)-shell width clamp
       was removed in src/app/(app)/layout.tsx, so this page no longer
       needs the negative-margin escape hatch. The card body still wraps
       the table in `overflow-x-auto` so long column lists scroll
       horizontally rather than truncate. */
    <div className="space-y-6">
      {showHeader && (
        <PageHeader
          title="Transactions"
          info="Manage and track all your financial transactions"
          filter={{ href: tb.list.filterHref, activeCount: tb.list.activeCount }}
          bulkEdit={{ onToggle: toggleSelectMode, active: selectMode, label: "Edit list" }}
          more={[
            { label: "Transfer", icon: ArrowRightLeft, onSelect: () => router.push("/transactions/new?kind=transfer") },
            { label: "Buy", icon: ShoppingCart, onSelect: () => router.push("/portfolio/new/buy") },
            { label: "Sell", icon: Banknote, onSelect: () => router.push("/portfolio/new/sell") },
            { label: "Swap", icon: Repeat, onSelect: () => router.push("/portfolio/new/swap") },
            { label: "In-kind transfer", icon: Send, onSelect: () => router.push("/portfolio/new/in-kind-transfer") },
            { label: "Income / expense", icon: HandCoins, onSelect: () => router.push("/portfolio/new/income-expense") },
            { label: "FX conversion", icon: CircleDollarSign, onSelect: () => router.push("/portfolio/new/fx-conversion") },
            { label: "Brokerage deposit", icon: ArrowDownToLine, onSelect: () => router.push("/portfolio/new/deposit") },
            { label: "Brokerage withdrawal", icon: ArrowUpFromLine, onSelect: () => router.push("/portfolio/new/withdrawal") },
            { label: "Investment Transactions", icon: TrendingUp, onSelect: () => router.push("/portfolio/new") },
            { label: exporting ? "Exporting…" : "Export CSV", icon: Download, onSelect: handleExport, disabled: exporting || total === 0 },
          ]}
          // Add: the full page on a phone, the new-record pane in the split view.
          primary={{ kind: "add", label: "Add Transaction", href: "/transactions/new", onSelect: splitView ? () => listDetail.selectNew() : undefined }}
        />
      )}
      <ListDetailLayout
        entity="transaction"
        newLabel="Add Transaction"
        enabled={!locked}
        pane={(api) => (
          <TransactionFormScreen
            mode={api.isNew ? "create" : "edit"}
            id={api.selectedId ?? undefined}
            returnTo={currentReturnTo()}
            embedded={{
              onSaved: () => { void loadTxns(); api.afterSaved(); },
              onCancel: api.clear,
              onDeleted: () => { void loadTxns(); api.afterDeleted(); },
              // Duplicate wrote its prefill: open a create pane, which reads it (?prefill=1) once on mount.
              onDuplicate: () => router.push(`${pathname}${withSel(urlParams.toString(), "new")}&prefill=1`, { scroll: false }),
            }}
          />
        )}
      >
      {showHeader && <Notice source="tips:transactions" />}
      {/* One toolbar at every size: range, month, search, filter (PageToolbar). Split view sits at the far right. */}
      <div className="flex flex-wrap items-center gap-2">
        {!toolbarProp && (
          <PageToolbar
            className="flex-1"
            range={{ selection: toolbarSelection, onChange: changeRange }}
            monthSwitcher={!legacyDates && !drill}
            search={{ value: tb.list.q, onChange: tb.list.setQ, placeholder: "Payee or note" }}
          />
        )}
      </div>

      {/* Sort, bulk select, export and the active-filter chips. The list has no columns to show or hide. */}
      {hasToolsRow && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {!showHeader && (
            <Button
              variant={selectMode ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1.5"
              aria-pressed={selectMode}
              onClick={toggleSelectMode}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {selectMode ? "Done selecting" : "Select"}
            </Button>
            )}
            {(filters.id || filters.startDate || filters.endDate || (!locked && filters.accountId) || filters.categoryId || filters.search || filters.portfolioHolding || filters.tag || colFilters.length > 0 || tb.list.activeCount > 0) && (
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors ml-1">
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
            {!showHeader && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 ml-auto"
              onClick={handleExport}
              disabled={exporting || total === 0}
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            )}
          </div>
          {/* Active column-filter chips (set from the filter page). Each chip drops just its own filter. */}
          {colFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Filters:</span>
              {colFilters.map((f) => {
                const label = COLUMN_LABELS[f.columnId];
                let summary: string;
                if (f.type === "date") {
                  summary = `${f.from ?? "…"} → ${f.to ?? "…"}`;
                } else if (f.type === "text") {
                  summary = `“${f.value}”`;
                } else if (f.type === "numeric") {
                  if (f.op === "between") summary = `${f.value} – ${f.value2 ?? "?"}`;
                  else summary = `${f.op === "eq" ? "=" : f.op === "gt" ? ">" : "<"} ${f.value}`;
                } else {
                  // enum — render labelled values where we can
                  const labels = f.values.map((v) => {
                    if (f.columnId === "source") return labelForSource(v as TransactionSource);
                    if (f.columnId === "category") {
                      const cat = categories.find((c) => String(c.id) === v);
                      return cat?.name ?? v;
                    }
                    if (f.columnId === "account") {
                      const a = accounts.find((aa) => String(aa.id) === v);
                      return a?.name ?? v;
                    }
                    return v;
                  });
                  summary = labels.length <= 2 ? labels.join(", ") : `${labels[0]} + ${labels.length - 1} more`;
                }
                return (
                  <Badge key={f.columnId} variant="outline" className="h-7 gap-1.5 pr-1">
                    <span className="font-medium text-xs">{label}: {summary}</span>
                    <button
                      onClick={() => setColFilter(null, f.columnId)}
                      className="p-0.5 rounded hover:bg-muted transition-colors"
                      aria-label={`Clear ${label} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          {filters.portfolioHolding && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Holding:</span>
              <Badge variant="outline" className="h-7 gap-1.5 pr-1 border-primary/30 bg-primary/5 text-primary">
                <span className="font-medium">{filters.portfolioHolding}</span>
                <button
                  onClick={() => { setFilters({ ...filters, portfolioHolding: "" }); setPage(0); }}
                  className="p-0.5 rounded hover:bg-primary/10 transition-colors"
                  aria-label="Clear holding filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
          {filters.tag && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Tag:</span>
              <Badge variant="outline" className="h-7 gap-1.5 pr-1 border-info/30 bg-info/10 text-info">
                <span className="font-medium font-mono">{filters.tag}</span>
                <button
                  onClick={() => { setFilters({ ...filters, tag: "" }); setPage(0); }}
                  className="p-0.5 rounded hover:bg-info/10 transition-colors"
                  aria-label="Clear tag filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
          {/* FINLYNQ-177 — single-transaction id deep link chip. Clearing it
              drops the filter so the user can step back to the full list. */}
          {filters.id && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Transaction:</span>
              <Badge variant="outline" className="h-7 gap-1.5 pr-1 border-primary/30 bg-primary/5 text-primary">
                <span className="font-medium font-mono">#{filters.id}</span>
                <button
                  onClick={() => { setFilters({ ...filters, id: "" }); setPage(0); }}
                  className="p-0.5 rounded hover:bg-primary/10 transition-colors"
                  aria-label="Clear single-transaction filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
        </div>
      )}

      {pendingDeleteCount > 0 && (
        <div data-testid="tx-pending-deletes" className="flex items-center gap-2 text-sm text-muted-foreground">
          <PendingSyncBadge mark={{ kind: "delete", status: "pending", opId: "", failReason: null }} />
          <span>{pendingDeleteCount === 1 ? "1 deleted transaction is hidden until it syncs." : `${pendingDeleteCount} deleted transactions are hidden until they sync.`}</span>
        </div>
      )}

        <div className="min-w-0 space-y-6">
        {/* The one transactions list at every width: date-grouped mobile rows. Select mode adds checkboxes. */}
                {/* Bulk actions for the selected rows (Select mode). */}
                {someSelected && (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                    <span className="font-medium text-primary">{selected.size} selected</span>
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <Field
                        control="select"
                        value={bulkAction}
                        onValueChange={(v) => { setBulkAction(v ?? ""); resetBulkFields(); }}
                        placeholder="Choose action…"
                        compact
                        className="w-44"
                        options={[
                          { value: "update_category", label: "Change category" },
                          { value: "update_account", label: "Change account" },
                          { value: "update_date", label: "Change date" },
                          { value: "update_payee", label: "Change payee" },
                          { value: "update_note", label: "Change note" },
                          { value: "update_tags", label: "Change tags" },
                          { value: "delete", label: "Delete selected" },
                        ]}
                      />
                      {bulkAction === "update_category" && (
                        <Field
                          control="combobox"
                          value={bulkCategoryId}
                          onValueChange={(v) => setBulkCategoryId(v)}
                          options={sortCategory(
                            categories.map((c): FieldComboboxOption => ({ value: String(c.id), label: `${c.group} — ${c.name}` })),
                            (c) => Number(c.value),
                            (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                          )}
                          placeholder="Select category"
                          searchPlaceholder="Search categories…"
                          emptyMessage="No matches"
                          compact
                          className="w-44"
                        />
                      )}
                      {bulkAction === "update_account" && (
                        <Field
                          control="combobox"
                          value={bulkAccountId}
                          onValueChange={(v) => setBulkAccountId(v)}
                          options={sortAccount(
                            accounts
                              .filter((a) => a.archived !== true)
                              .map((a): FieldComboboxOption => ({ value: String(a.id), label: a.name })),
                            (a) => Number(a.value),
                            (a, z) => (a.label ?? "").localeCompare(z.label ?? ""),
                          )}
                          placeholder="Select account"
                          searchPlaceholder="Search accounts…"
                          emptyMessage="No matches"
                          compact
                          className="w-44"
                        />
                      )}
                      {bulkAction === "update_date" && (
                        <Field
                          control="date"
                          value={bulkDate}
                          onChange={(e) => setBulkDate(e.target.value)}
                          compact
                          className="w-36"
                        />
                      )}
                      {bulkAction === "update_payee" && (
                        <Field
                          placeholder="New payee"
                          value={bulkPayee}
                          onChange={(e) => setBulkPayee(e.target.value)}
                          compact
                          className="w-44"
                        />
                      )}
                      {bulkAction === "update_note" && (
                        <Field
                          placeholder="New note"
                          value={bulkNote}
                          onChange={(e) => setBulkNote(e.target.value)}
                          compact
                          className="w-44"
                        />
                      )}
                      {bulkAction === "update_tags" && (
                        <Field
                          placeholder="New tags"
                          value={bulkTags}
                          onChange={(e) => setBulkTags(e.target.value)}
                          compact
                          className="w-44"
                        />
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={executeBulkAction}
                        disabled={isBulkApplyDisabled}
                        variant={bulkAction === "delete" ? "destructive" : "default"}
                      >
                        {bulkProcessing ? "Processing…" : "Apply"}
                      </Button>
                    </div>
                    <button aria-label="Clear selection" onClick={() => setSelected(new Set())} className="text-muted-foreground hover:text-foreground transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
          {selectMode && txns.length > 0 && (
            <Field
              label="Select all"
              control="checkbox"
              title="Select all"
              checked={allSelected}
              onChange={toggleAll}
            />
          )}
          <MobileTxList
            transactions={txns}
            isLoading={loading && txns.length === 0}
            isLoadingMore={isLoadingMore}
            onOpen={handleOpenRow}
            showAccountName={!locked}
            selectedId={splitView ? listDetail.selectedId === null ? null : Number(listDetail.selectedId) : null}
            transferPeers={transferPeers}
            emptyState={
              <Notice
                variant="empty"
                icon={Receipt}
                title="No transactions yet"
                action={{ label: "Import data", href: "/import" }}
              >
                Add or import your first transactions.
              </Notice>
            }
            selection={selectMode ? { selected, onToggle: toggleOne } : undefined}
          />
        </div>

      {sheetTx && (
        <TransactionSheet
          tx={sheetTx}
          peer={transferPeers.get(sheetTx.id) ?? null}
          onClose={() => setSheetTx(null)}
          onEdit={startEdit}
          onDuplicate={startDuplicate}
          onSplit={openSplitDialog}
          onDelete={confirmDelete}
        />
      )}

      {/* Infinite scroll trigger sentinel at the bottom of the table */}
      <div
        ref={observerTargetRef}
        data-testid="infinite-scroll-trigger"
        className="h-14 w-full flex items-center justify-center text-xs text-muted-foreground"
      >
        {loadMoreError ? (
          <span className="flex flex-wrap items-center justify-center gap-2">
            <span>Couldn&apos;t load more.</span>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 regular:pointer-fine:min-h-8 text-xs"
              onClick={() => { void loadTxns(); }}
            >
              Retry
            </Button>
          </span>
        ) : hasMore ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Loading more transactions…
          </span>
        ) : total > 0 ? (
          <span>Showing all {total} transactions</span>
        ) : null}
      </div>

      </ListDetailLayout>

      {/* Single delete confirmation dialog */}
      <Overlay
        variant="confirm"
        open={deleteConfirmId !== null}
        onClose={() => {
          setDeleteConfirmId(null);
          setDeleteBlockedError(null);
          setReallocPreview(null);
        }}
        title="Delete Transaction"
        message={
          deleteBlockedError ? undefined : (
            <>Are you sure you want to delete <strong>{deleteConfirmPayee}</strong>? This cannot be undone.</>
          )
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        actions={
          deleteBlockedError
            ? [
                { label: "Cancel", disabled: deleting },
                {
                  label: "Reallocate & delete",
                  kind: "destructive",
                  busy: deleting,
                  busyLabel: "Deleting…",
                  disabled: reallocLoading,
                  onClick: handleReallocateDelete,
                },
              ]
            : undefined
        }
      >
        {deleteError && (
          <Notice tone="danger">{deleteError}</Notice>
        )}
        {deleteBlockedError && (
          <div className="space-y-3">
            <p className="text-sm text-warning">
              This transaction opened a lot that has since been sold or
              transferred out. You can still delete it — the dependent
              transactions below will be re-matched to your other lots.
            </p>
            {/* FINLYNQ-176 — reallocation preview (affected years + shorts). */}
            <LotReallocationNotice preview={reallocPreview} loading={reallocLoading} />
            {deleteBlockedError.blockingIds.length > 0 && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                <p className="font-medium mb-1.5">Dependent rows:</p>
                <ul className="space-y-1">
                  {deleteBlockedError.blockingIds.map((id) => (
                    <li key={id}>
                      <Link
                        href={buildTxDrillUrl({ id: String(id) })}
                        className="text-primary underline hover:no-underline"
                        onClick={() => {
                          setDeleteConfirmId(null);
                          setDeleteBlockedError(null);
                          setReallocPreview(null);
                        }}
                      >
                        Transaction #{id}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Overlay>

      {/* Bulk delete confirmation dialog */}
      <Overlay
        variant="confirm"
        open={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        title={`Delete ${selected.size} Transactions`}
        message={<>This will permanently delete <strong>{selected.size} transaction{selected.size !== 1 ? "s" : ""}</strong>. This cannot be undone.</>}
        confirmLabel={`Delete ${selected.size}`}
        busy={bulkProcessing}
        onConfirm={confirmBulkDelete}
      />

    </div>
  );
}
