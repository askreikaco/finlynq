"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  AlertCircle,
  ArrowUpDown,
  Briefcase,
  CalendarDays,
  Calculator,
  CheckCircle2,
  Copy,
  Hash,
  Info,
  Loader2,
  StickyNote,
  Store,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { useApi } from "@/lib/data/use-api";
import { mutate, useSWRConfig } from "swr";
import { revalidateTransactionLists } from "@/lib/transactions/revalidate";
import { currencyDecimals, fxPreviewText } from "@/lib/currency";
import { parseCount, toAccountCurrencySplits } from "@/lib/transactions/split-math";
import { validateSplits, type SplitRowModel } from "@/components/transactions/split-rows";
import Link from "next/link";
import { useDisplayCurrency } from "@/components/currency-provider";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AutoTextarea } from "@/components/ui/auto-textarea";
import { cn } from "@/lib/utils";
import { NumpadDock } from "./numpad-dock";
import { CategorySelector, type Category } from "./category-selector";
import { AccountSelector, type Account } from "./account-selector";
import { EMPTY_GROUP_ORDER, type AccountGroupOrder } from "@/lib/accounts/groups";
import { CurrencySelector } from "./currency-selector";
import { AutocompletePills } from "./autocomplete-pills";
import { SplitSection } from "./split-section";
import { FormRow } from "./form-row";
import { AmountRow } from "./amount-row";
import { TypeSegmented } from "./type-segmented";
import { ListCard } from "./list-card";
import { buildPrefill, canDuplicate, readAndClearPrefill, writePrefill } from "@/lib/transactions/prefill";
import {
  buildEntrySeed,
  buildSplitsBody,
  buildTransactionPutBody,
  buildTransferPutBody,
  isEditMode,
  type EntryMode,
} from "@/lib/transactions/entry-mode";
import { parseSaveError } from "@/lib/save-error";
import type { LotReallocationPreview } from "@/lib/portfolio/lots/types";
import { LotReallocationNotice } from "@/components/portfolio/lot-reallocation-notice";
import { EditMetaLine } from "./edit-meta-line";
import { EditDeleteDialog } from "./edit-delete-dialog";
import {
  getLastAccount,
  getRecent,
  pushRecent,
  setLastAccount,
  type RecentTxType,
} from "@/lib/transactions/recent-picks";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { useFxPreview } from "@/lib/hooks/use-fx-preview";
import { FxPreviewLine } from "@/components/transactions/fx-preview-line";
import { buildPayeeCategoryRule } from "@/lib/rules/build-payee-category-rule";
import { PageHeader, HEADER_CELL } from "@/components/mobile";
import type { OverflowAction } from "@/components/mobile/page-header";

export type { EntryMode } from "@/lib/transactions/entry-mode";

type TxType = "Expense" | "Income" | "Transfer";
type InvalidField = "amount" | "account" | "category" | "toAccount";
const RECENT_TX_CODE: Record<TxType, RecentTxType> = { Expense: "E", Income: "I", Transfer: "T" };
// Numpad target id for the main Amount. Split rows use their row id (never this value).
const MAIN_PAD = "main";

/**
 * The one transaction entry screen. mode.kind picks the chrome and the start values, never the rows:
 *   create         blank (or a Duplicate prefill), posts a new transaction / transfer
 *   edit           one plain transaction prefilled; PUT /api/transactions (+ splits), Duplicate and Delete in the header
 *   edit-transfer  a transfer pair prefilled; PUT /api/transactions/transfer, Delete in the header
 */
export function TransactionEntryScreen({ mode }: { mode: EntryMode }) {
  const { mutate: swrMutate, cache } = useSWRConfig();
  const router = useRouter();
  const { displayCurrency } = useDisplayCurrency();
  const editMode = isEditMode(mode) ? mode : null;
  const isEditTransfer = editMode?.kind === "edit-transfer";
  // The row the muted meta line (created / updated / source) describes.
  const editRow = editMode ? (editMode.kind === "edit" ? editMode.tx : editMode.debit) : null;
  // Edit: start values from the loaded row, read once (a later re-render must not wipe the user's edits).
  const [seed] = useState(() => (editMode ? buildEntrySeed(editMode) : null));
  const returnTo = editMode?.returnTo ?? "/transactions";

  // Refs to handle StrictMode and prefill application
  const prefillReadRef = useRef(false);
  const prefillAppliedRef = useRef(false);
  // ?account=<id> (set by the account page's New transaction button) preselects the source account.
  const preselectAccountRef = useRef<string | null>(null);
  // ?account=<id> as read from the URL (state, so the investment notice can render).
  const [urlAccountId] = useState<string | null>(() =>
    typeof window === "undefined" || editMode ? null : new URLSearchParams(window.location.search).get("account")
  );

  // Mode
  const [txType, setTxType] = useState<TxType>(seed?.txType ?? "Expense");

  // Live Data
  const { data: rawCategories = [], isLoading: loadingCategories } =
    useApi<Category[]>("/api/categories");
  const { data: rawAccounts = [], isLoading: loadingAccounts } =
    useApi<Account[]>("/api/accounts");
  // The user's saved account-group display order (Accounts → Groups). Soft: a failed read
  // falls back to alphabetical group sections in the account pickers.
  const { data: groupOrderRes } = useApi<{ order: AccountGroupOrder }>(
    "/api/settings/account-group-order",
    { soft: { order: EMPTY_GROUP_ORDER } },
  );
  const groupOrder = groupOrderRes?.order ?? EMPTY_GROUP_ORDER;

  // Prefill notice (malformed/expired sessionStorage entry)
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  // Form State
  const [amount, setAmount] = useState(seed?.amount ?? "");
  const [categoryId, setCategoryId] = useState(seed?.categoryId ?? "");
  const [accountId, setAccountId] = useState(seed?.accountId ?? "");
  const [toAccountId, setToAccountId] = useState(seed?.toAccountId ?? ""); // For Transfer
  const [payee, setPayee] = useState(seed?.payee ?? "");
  const [note, setNote] = useState(seed?.note ?? "");
  const [tags, setTags] = useState(seed?.tags ?? "");
  // Entered currency; blank = follow the selected account's currency (as the dialog does).
  const [currencyChoice, setCurrencyChoice] = useState(seed?.currencyChoice ?? "");
  // "Also create a rule for next time" (Expense/Income with payee + category).
  const [alsoCreateRule, setAlsoCreateRule] = useState(false);
  // Cross-currency transfer: amount the destination account receives (user-overridable).
  const [receivedAmount, setReceivedAmount] = useState(seed?.receivedAmount ?? "");
  // Edit: the booked received amount is the canonical rate, so the FX preview must not overwrite it.
  const [receivedTouched, setReceivedTouched] = useState(isEditTransfer);

  // Date & Time State
  const [date, setDate] = useState(() => {
    if (seed) return seed.date;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  // More details (Tags, Business, Split): collapsed by default; a prefill with tags opens it.
  const [showMore, setShowMore] = useState(seed?.showMore ?? false);
  const [isBusiness, setIsBusiness] = useState(seed?.isBusiness ?? false);
  // Splits: count text ("" = none; N >= 2 = N rows, see split-math). Rows keep the hidden tail beyond N.
  const [splitCount, setSplitCount] = useState(seed?.splitCount ?? "");
  const [splitRows, setSplitRows] = useState<SplitRowModel[]>(seed?.splitRows ?? []);
  // Split rows whose amount was typed, committed from the numpad, or left (blur). An untouched empty
  // row shows no "Enter an amount"; the Save press reveals all rows (splitSaveAttempted).
  const [touchedSplitRowIds, setTouchedSplitRowIds] = useState<ReadonlySet<string>>(() => new Set());
  const [splitSaveAttempted, setSplitSaveAttempted] = useState(false);
  const markSplitRowTouched = (rowId: string) =>
    setTouchedSplitRowIds((prev) => (prev.has(rowId) ? prev : new Set(prev).add(rowId)));
  // Split row whose category the CategorySelector is editing (null = the main Category row).
  const [activeSplitRowId, setActiveSplitRowId] = useState<string | null>(null);

  // Read prefill from sessionStorage once on mount ([] deps)
  // Uses ref to prevent double-read in StrictMode
  useEffect(() => {
    // Edit starts from the loaded row: no sessionStorage prefill, no ?account= / ?kind= presets.
    if (editMode) {
      prefillReadRef.current = true;
      prefillAppliedRef.current = true;
      return;
    }
    // Only read if ?prefill=1 is in URL or legacy mode (no query param)
    const hasPrefillQuery = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("prefill");

    // Prevent reading twice in StrictMode
    if (prefillReadRef.current) return;
    prefillReadRef.current = true;

    preselectAccountRef.current = new URLSearchParams(window.location.search).get("account");

    const prefill = readAndClearPrefill(Date.now());
    if (prefill) {
      setAmount(prefill.amount);
      setCategoryId(prefill.categoryId);
      setAccountId(prefill.accountId);
      setPayee(prefill.payee);
      setNote(prefill.note);
      setTags(prefill.tags);
      if (prefill.tags) setShowMore(true);
      setIsBusiness(prefill.isBusiness);
      setTxType(prefill.txType);
      prefillAppliedRef.current = true;
    } else if (hasPrefillQuery) {
      // prefill=1 in URL but no valid data = show notice
      setPrefillNotice("Prefill data expired or invalid. Please fill the form manually.");
    }

    // ?kind=transfer|expense|income opens that tab (account page Transfer action, workspace links). Other values ignored.
    const kindParam = new URLSearchParams(window.location.search).get("kind");
    if (kindParam === "transfer") setTxType("Transfer");
    else if (kindParam === "expense") setTxType("Expense");
    else if (kindParam === "income") setTxType("Income");
  }, []);

  // UI / Modal States
  // One shared numpad follows the focused amount: MAIN_PAD or a split row id. null = closed.
  const [padTarget, setPadTarget] = useState<string | null>(null);
  const showNumpad = padTarget !== null;
  const [showCatSelector, setShowCatSelector] = useState(false);
  const [showAccSelector, setShowAccSelector] = useState(false);
  const [showToAccSelector, setShowToAccSelector] = useState(false);
  const [showCurrencySelector, setShowCurrencySelector] = useState(false);
  const [focusedField, setFocusedField] = useState<"payee" | "note" | "tags" | null>(null);
  // Row to mark invalid after a failed Save (the first failing check).
  const [invalid, setInvalid] = useState<{ field: InvalidField } | null>(null);

  // Numpad opens only when an amount is focused; it closes on Done, Escape or any other field.
  const openPad = () => {
    setPadTarget(MAIN_PAD);
    setFocusedField(null);
  };
  const openSplitPad = (rowId: string) => {
    setPadTarget(rowId);
    setFocusedField(null);
  };
  const closePad = () => setPadTarget(null);
  // Numpad commit: the main amount, or the split row it was opened for (by id, never by index).
  const handleDockChange = (id: string, value: string) => {
    if (id === MAIN_PAD) {
      setAmount(value);
      if (isEditTransfer) setReceivedTouched(false); // a new sent amount refills the received amount
      setInvalid((prev) => (prev?.field === "amount" ? null : prev));
      return;
    }
    markSplitRowTouched(id);
    setSplitRows((prev) => prev.map((row) => (row.id === id ? { ...row, amount: value } : row)));
  };
  // SplitRows reports a count change and the row fill in one call. An amount edit marks that row
  // touched; growing N clears the former remainder row, which is not an edit.
  const handleSplitRowsChange = (next: SplitRowModel[]) => {
    const prevN = parseCount(splitCount).n;
    next.forEach((row, i) => {
      if (i < prevN - 1 && row.amount !== (splitRows[i]?.amount ?? "")) markSplitRowTouched(row.id);
    });
    setSplitRows(next);
  };
  // Transfer swap: exchange From/To. The entered currency follows the From account (as on selection),
  // a typed "receives" amount is cleared so the FX preview refills it for the new pair.
  const swapTransferAccounts = () => {
    closePad();
    setAccountId(toAccountId);
    setToAccountId(accountId);
    setCurrencyChoice("");
    setReceivedTouched(false);
    setReceivedAmount("");
    setInvalid((prev) => (prev?.field === "account" || prev?.field === "toAccount" ? null : prev));
  };
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/transactions");
  };
  // Edit: Back, Cancel, a finished save and a delete all return to the list the user came from.
  const goReturn = () => router.push(returnTo);
  const refreshLists = () => {
    void revalidateTransactionLists(swrMutate, cache);
    void mutate("/api/accounts");
  };
  // Edit: Delete asks first; the lot-reallocation prompt of a lot-locked save (FINLYNQ-176).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reallocPreview, setReallocPreview] = useState<LotReallocationPreview | null>(null);
  const [reallocPending, setReallocPending] = useState(false);
  // Recently picked IDs for this type (read per render; empty on the server).
  const txCode = RECENT_TX_CODE[txType];
  const recentCategoryIds = getRecent("category", txCode);
  const recentAccountIds = getRecent("account", txCode);
  const recentToAccountIds = getRecent("account", "T");

  // A split amount opened the numpad: scroll it above the dock (the scroll region reserves the dock height).
  useEffect(() => {
    if (padTarget === null || padTarget === MAIN_PAD) return;
    const index = splitRows.findIndex((r) => r.id === padTarget);
    if (index < 0) return;
    document
      .querySelector<HTMLElement>(`[data-testid="split-amount-${index + 1}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
    // Scroll once per opened row; typing must not re-scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padTarget]);

  // After a failed Save: focus the first invalid row. Amount also opens the numpad.
  useEffect(() => {
    if (!invalid) return;
    const selectors: Record<InvalidField, string> = {
      amount: 'input[aria-label="Amount"]',
      account: '[data-testid="txnew-row-account"]',
      category: '[data-testid="txnew-row-category"]',
      toAccount: '[data-testid="txnew-row-to-account"]',
    };
    document.querySelector<HTMLElement>(selectors[invalid.field])?.focus();
  }, [invalid]);

  // Submission State
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  // Set once a save has booked: the button stays locked so a second click cannot book it again.
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  // Suggested category (Payee blur): the id it filled, and whether the user picked a category by hand.
  const [suggestedCategoryId, setSuggestedCategoryId] = useState<string | null>(null);
  const categoryTouchedRef = useRef(false);
  const suggestSeqRef = useRef(0);
  // Latest form values, read when the suggestion reply arrives (it is ignored if they moved on).
  const latestRef = useRef({
    payee: "",
    categoryId: "",
    txType: "Expense" as TxType,
    categories: [] as Category[],
  });

  // Filter Categories by TxType
  const filteredCategories = useMemo(() => {
    if (txType === "Expense") {
      const expenseCats = rawCategories.filter(
        (c) => c.type === "E" || c.type?.toLowerCase() === "expense"
      );
      return expenseCats.length > 0 ? expenseCats : rawCategories;
    }
    if (txType === "Income") {
      const incomeCats = rawCategories.filter(
        (c) => c.type === "I" || c.type?.toLowerCase() === "income"
      );
      return incomeCats.length > 0 ? incomeCats : rawCategories;
    }
    return rawCategories;
  }, [rawCategories, txType]);

  useEffect(() => {
    latestRef.current = { payee, categoryId, txType, categories: filteredCategories };
  }, [payee, categoryId, txType, filteredCategories]);

  // Non-archived Accounts
  // Investment accounts are excluded: they are booked through Buy/Sell, not here.
  const activeAccounts = useMemo(() => {
    return rawAccounts.filter((a) => !a.archived && a.isInvestment !== true);
  }, [rawAccounts]);
  const sortAccount = useDropdownOrder("account");

  // ?account=<id> pointing at an investment account: shown as a notice, never selected.
  const urlInvestmentAccount = useMemo(
    () =>
      urlAccountId
        ? rawAccounts.find((a) => String(a.id) === urlAccountId && a.isInvestment === true)
        : undefined,
    [rawAccounts, urlAccountId]
  );

  // Auto-select initial account if available
  // Skip if prefill was applied (to avoid clobbering prefilled accountId)
  useEffect(() => {
    if (!accountId && activeAccounts.length > 0 && !prefillAppliedRef.current) {
      const pre = preselectAccountRef.current;
      // ?account=<investment id>: leave the picker empty (the notice explains). Read the ref,
      // not the state, because this runs before the mount effect's state update lands.
      if (pre && rawAccounts.some((a) => String(a.id) === pre && a.isInvestment === true)) return;
      const match = pre ? activeAccounts.find((a) => String(a.id) === pre) : undefined;
      // Then the last-used account in this browser (still active), then the first in dropdown order.
      const last = getLastAccount();
      const lastMatch = last ? activeAccounts.find((a) => String(a.id) === last) : undefined;
      const ordered = sortAccount(
        activeAccounts,
        (a) => Number(a.id),
        (a, z) => a.name.localeCompare(z.name),
      );
      setAccountId(String((match ?? lastMatch ?? ordered[0] ?? activeAccounts[0]).id));
    }
  }, [activeAccounts, accountId, rawAccounts, sortAccount]);

  // Reset category when switching between Expense and Income if invalid
  useEffect(() => {
    if (categoryId && filteredCategories.length > 0) {
      const stillValid = filteredCategories.some((c) => String(c.id) === categoryId);
      if (!stillValid) {
        setCategoryId("");
      }
    }
  }, [txType, filteredCategories, categoryId]);

  // Selected Records
  const selectedCat = useMemo(
    () => rawCategories.find((c) => String(c.id) === categoryId),
    [rawCategories, categoryId]
  );
  const selectedAcc = useMemo(
    () => activeAccounts.find((a) => String(a.id) === accountId),
    [activeAccounts, accountId]
  );
  const selectedToAcc = useMemo(
    () => activeAccounts.find((a) => String(a.id) === toAccountId),
    [activeAccounts, toAccountId]
  );

  const parsedAmount = parseFloat(amount) || 0;

  // Entered currency: explicit choice, else the account's currency, else the display currency.
  const currency = currencyChoice || selectedAcc?.currency || displayCurrency;
  const currencyOptions = useActiveCurrencies(currency);

  // Splits (Expense/Income only). One validation feeds the Save gate, the save payload and the messages.
  // Splits use the ENTERED currency (the amount the user typed); the save converts them to the account currency.
  const splitCheck = validateSplits({
    count: txType === "Transfer" ? "" : splitCount,
    rows: splitRows,
    parentAmount: parsedAmount,
    currency,
    parentCategoryId: categoryId,
    variant: "entry",
  });
  const splitActive = splitCheck.n >= 2;
  const splitBlocked = splitActive && !splitCheck.canSave;
  const splitEditingRow = activeSplitRowId === null ? null : splitRows.find((r) => r.id === activeSplitRowId) ?? null;
  const fxPreview = useFxPreview({
    enabled: txType !== "Transfer",
    from: currency,
    to: selectedAcc?.currency || displayCurrency,
    amount: parsedAmount,
    date,
  });
  // Cross-currency transfer: FX preview of the destination amount (same hook as the dialog).
  const transferCrossCcy =
    txType === "Transfer" &&
    !!selectedAcc &&
    !!selectedToAcc &&
    selectedAcc.currency !== selectedToAcc.currency;
  // Transfer typed in a currency other than the From account: the amount is converted to the
  // From currency first (the save does the same), and the To preview runs on that converted amount.
  const transferEnteredCcy = txType === "Transfer" && !!selectedAcc && currency !== selectedAcc.currency;
  const transferEntryFx = useFxPreview({
    enabled: transferEnteredCcy,
    from: currency,
    to: selectedAcc?.currency,
    amount: parsedAmount,
    date,
  });
  const transferSourceAmount = transferEnteredCcy
    ? transferEntryFx.state === "ok" ? transferEntryFx.converted : Number.NaN
    : parsedAmount;
  const transferFxPreview = useFxPreview({
    enabled: transferCrossCcy,
    from: selectedAcc?.currency ?? "",
    to: selectedToAcc?.currency,
    amount: transferSourceAmount,
    date,
  });
  // Pre-fill the received amount from the market rate until the user types their own (as the dialog does).
  useEffect(() => {
    if (transferFxPreview.state === "ok" && !receivedTouched) {
      setReceivedAmount(fxPreviewText(transferFxPreview.converted, selectedToAcc?.currency ?? displayCurrency));
    }
  }, [transferFxPreview, receivedTouched, selectedToAcc, displayCurrency]);

  // Rule suggestion needs a payee + category on a plain (non-split) Expense/Income.
  const ruleEligible =
    !editMode && txType !== "Transfer" && !splitActive && payee.trim().length > 0 && !!categoryId;

  // Handle Category Selection for either main category or split row
  const handleCategorySelect = (selectedId: string) => {
    if (activeSplitRowId !== null) {
      setSplitRows((prev) =>
        prev.map((row) => (row.id === activeSplitRowId ? { ...row, categoryId: selectedId } : row)),
      );
      setActiveSplitRowId(null);
    } else {
      categoryTouchedRef.current = true;
      setSuggestedCategoryId(null);
      setCategoryId(selectedId);
      setInvalid((prev) => (prev?.field === "category" ? null : prev));
      pushRecent("category", txCode, selectedId);
    }
  };

  // Payee blur with an empty category and a payee of 2+ characters: fill the category the history
  // suggests. Never overwrites a category the user picked; ignored if the payee or category moved on.
  const suggestCategoryForPayee = async (rawPayee: string) => {
    const name = rawPayee.trim();
    if (txType === "Transfer" || name.length < 2 || categoryId || categoryTouchedRef.current) return;
    const seq = ++suggestSeqRef.current;
    try {
      const res = await fetch("/api/transactions/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payee: name }),
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as
        | { suggestion?: { id?: string | number } | null }
        | null;
      const suggestedId = data?.suggestion?.id;
      if (suggestedId == null || seq !== suggestSeqRef.current) return;
      const latest = latestRef.current;
      if (latest.txType === "Transfer" || latest.payee.trim() !== name) return;
      if (latest.categoryId || categoryTouchedRef.current) return;
      const match = latest.categories.find((c) => String(c.id) === String(suggestedId));
      if (!match) return;
      setCategoryId(String(match.id));
      setSuggestedCategoryId(String(match.id));
      setInvalid((prev) => (prev?.field === "category" ? null : prev));
    } catch {
      // The suggestion is optional: a failed request leaves the category empty.
    }
  };

  // Submit Handler: Save books the entry and locks the form.
  const handleSave = async (confirmReallocation = false) => {
    if (saving || doneRef.current) return;
    setSplitSaveAttempted(true);
    if (!confirmReallocation) setReallocPreview(null);
    setErrorMessage(null);
    setSuccessNotice(null);
    setInvalid(null);
    closePad();

    if (parsedAmount <= 0) {
      setErrorMessage("Please enter a valid amount greater than 0");
      setInvalid({ field: "amount" });
      setPadTarget(MAIN_PAD);
      return;
    }

    if (!accountId) {
      setErrorMessage("Please select an account");
      setInvalid({ field: "account" });
      return;
    }

    setSaving(true);

    try {
      if (txType === "Transfer") {
        // Transfer Mode Validation
        if (!toAccountId) {
          setInvalid({ field: "toAccount" });
          throw new Error("Please select a destination account");
        }
        if (accountId === toAccountId) {
          setInvalid({ field: "toAccount" });
          throw new Error("Destination account must be different from source account");
        }

        let receivedNum: number | undefined;
        if (transferCrossCcy && receivedAmount) {
          const parsedReceived = parseFloat(receivedAmount);
          if (Number.isFinite(parsedReceived) && parsedReceived >= 0) receivedNum = parsedReceived;
        }

        if (editMode?.kind === "edit-transfer") {
          // Same PUT the old transfer edit sent (the amount is in the From account currency).
          const putRes = await fetch("/api/transactions/transfer", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildTransferPutBody({
                linkId: editMode.linkId,
                fromAccountId: Number(accountId),
                toAccountId: Number(toAccountId),
                enteredAmount: parsedAmount,
                date,
                receivedAmount: receivedNum,
                note,
                tags,
              }),
            ),
          });
          if (!putRes.ok) {
            const errData = await putRes.json().catch(() => ({}));
            if (errData?.code === "fx-currency-needs-override") {
              throw new Error(`No FX rate for ${errData.currency ?? selectedToAcc?.currency ?? "destination currency"}.`);
            }
            throw new Error(errData?.error ?? `Save failed (${putRes.status})`);
          }
          doneRef.current = true;
          setDone(true);
          refreshLists();
          goReturn();
          return;
        }

        const transferPayload = {
          fromAccountId: Number(accountId),
          toAccountId: Number(toAccountId),
          enteredAmount: Math.abs(parsedAmount),
          enteredCurrency: currency,
          date,
          note: note.trim() || undefined,
          tags: tags.trim() || undefined,
          ...(receivedNum != null ? { receivedAmount: receivedNum } : {}),
        };

        const res = await fetch("/api/transactions/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transferPayload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (errData?.code === "fx-currency-needs-override") {
            throw new Error(`No FX rate for ${errData.currency ?? selectedToAcc?.currency ?? "destination currency"}.`);
          }
          throw new Error(errData?.error || `Transfer failed (${res.status})`);
        }

        setLastAccount(accountId);
        doneRef.current = true;
        setDone(true);
        setSuccessNotice("Transfer recorded successfully!");
        void revalidateTransactionLists(swrMutate, cache);
        mutate("/api/accounts");
        setTimeout(() => router.push("/transactions"), 600);
        return;
      }

      // Regular Transaction Mode (Expense / Income)
      if (!splitActive && !categoryId) {
        setInvalid({ field: "category" });
        throw new Error("Please select a category");
      }

      if (splitActive) {
        setShowMore(true);
        // Save is disabled while splits are invalid; this guards the same rule for any other path.
        if (!splitCheck.canSave) throw new Error(splitCheck.firstError ?? "Check the split amounts");
      }

      // Sign: Expense is negative, Income is positive
      const signedAmount = txType === "Expense" ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);
      // Row 1 inherits the main category when it has none of its own (validateSplits resolves it).
      const effectiveCategoryId = splitActive ? Number(splitCheck.resolved[0].id) : Number(categoryId);

      if (editMode?.kind === "edit") {
        // Same PUT (+ splits POST) the old edit form sent.
        const putRes = await fetch("/api/transactions", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildTransactionPutBody({
              id: editMode.tx.id,
              date,
              accountId: Number(accountId),
              categoryId: effectiveCategoryId,
              enteredCurrency: currency,
              enteredAmount: signedAmount,
              payee,
              note,
              tags,
              isBusiness,
              confirmReallocation,
            }),
          ),
        });
        if (!putRes.ok) {
          const errData = await putRes.clone().json().catch(() => ({}));
          if (errData?.code === "fx-currency-needs-override") {
            throw new Error(`No FX rate for ${errData.currency ?? currency}.`);
          }
          if (errData?.code === "portfolio_edit_blocked") {
            // The edited row opened a lot that has been sold or transferred out: show the reallocation preview
            // and let the user confirm saving anyway (dependents are re-matched to other lots).
            setErrorMessage(
              "This transaction opened a lot that has since been sold or transferred out. " +
                "You can still save your edit — the dependent transactions will be re-matched to your other lots.",
            );
            setReallocPreview(null);
            setReallocPending(true);
            try {
              const pRes = await fetch("/api/transactions/lot-replan-preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ op: "edit", id: editMode.tx.id }),
              });
              if (pRes.ok) {
                const pData = await pRes.json().catch(() => null);
                if (pData?.preview) setReallocPreview(pData.preview as LotReallocationPreview);
              }
            } finally {
              setReallocPending(false);
            }
            return;
          }
          throw new Error(await parseSaveError(putRes, `Save failed (${putRes.status})`));
        }
        setReallocPreview(null);

        let splitsError: string | null = null;
        if (splitActive) {
          const splitRes = await fetch("/api/transactions/splits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildSplitsBody({
                transactionId: editMode.tx.id,
                sign: signedAmount < 0 ? -1 : 1,
                rows: splitCheck.visible.map((row, i) => ({
                  categoryId: Number(splitCheck.resolved[i].id),
                  amount: splitCheck.amounts[i],
                  note: row.note,
                })),
              }),
            ),
          });
          if (!splitRes.ok) {
            splitsError = await parseSaveError(splitRes, `The splits could not be saved (${splitRes.status}).`);
          }
        }
        refreshLists();
        // The transaction is saved already: a failed splits write is shown and the page stays (a retry re-saves).
        if (splitsError) throw new Error(`Transaction saved, but the splits were not: ${splitsError}`);
        doneRef.current = true;
        setDone(true);
        goReturn();
        return;
      }

      const txPayload = {
        date,
        accountId: Number(accountId),
        categoryId: effectiveCategoryId,
        enteredCurrency: currency,
        enteredAmount: signedAmount,
        payee: payee.trim() || undefined,
        note: note.trim() || undefined,
        tags: tags.trim() || undefined,
        isBusiness: isBusiness ? 1 : 0,
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(txPayload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData?.code === "fx-currency-needs-override") {
          throw new Error(`No FX rate for ${errData.currency ?? currency}.`);
        }
        throw new Error(errData?.error || `Failed to create transaction (${res.status})`);
      }

      const createdTx = await res.json().catch(() => ({}));
      setLastAccount(accountId);
      const transactionId = createdTx?.id;

      // Splits post after the parent. Their amounts are entered-currency; the API stores account-currency
      // amounts, so convert with the created row's own ratio (its legs sum to the stored total).
      let splitFailure: string | null = null;
      if (splitActive && transactionId) {
        try {
          const sign = txType === "Expense" ? -1 : 1;
          const accountCcy: string = createdTx.currency || selectedAcc?.currency || displayCurrency;
          const legs =
            currency === accountCcy
              ? splitCheck.amounts
              : toAccountCurrencySplits(splitCheck.amounts, {
                  amount: Math.abs(Number(createdTx.amount)),
                  enteredAmount: Math.abs(Number(createdTx.enteredAmount)),
                  currency: accountCcy,
                });
          const splitRes = await fetch("/api/transactions/splits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transactionId: Number(transactionId),
              splits: splitCheck.visible.map((row, i) => ({
                categoryId: Number(splitCheck.resolved[i].id),
                amount: sign * Math.abs(legs[i]),
                note: row.note.trim() || undefined,
              })),
            }),
          });
          if (!splitRes.ok) {
            const splitErr = await splitRes.json().catch(() => ({}));
            throw new Error(splitErr?.error || `Splits failed (${splitRes.status})`);
          }
        } catch (splitErr: unknown) {
          splitFailure = `Transaction saved, but the splits were not: ${
            splitErr instanceof Error ? splitErr.message : "unknown error"
          }`;
        }
      }

      // Rule step runs after the transaction is saved; a failure never undoes it.
      let ruleFailure: string | null = null;
      if (alsoCreateRule && ruleEligible) {
        try {
          const ruleRes = await fetch("/api/rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayeeCategoryRule(payee.trim(), Number(categoryId))),
          });
          if (!ruleRes.ok) {
            const ruleErr = await ruleRes.json().catch(() => ({}));
            ruleFailure = ruleErr?.error
              ? `Transaction saved, but the rule could not be created: ${ruleErr.error}`
              : "Transaction saved, but the rule could not be created.";
          }
        } catch (ruleErr: unknown) {
          ruleFailure =
            ruleErr instanceof Error
              ? `Transaction saved, but the rule could not be created: ${ruleErr.message}`
              : "Transaction saved, but the rule could not be created.";
        }
      }

      // The transaction is saved already: a failed split or rule write is shown, never undone. Save
      // leaves the page after a short delay (a second Save would book the transaction twice).
      const followUpError = splitFailure ?? ruleFailure;
      if (followUpError) {
        doneRef.current = true;
        setDone(true);
        void revalidateTransactionLists(swrMutate, cache);
        mutate("/api/accounts");
        setErrorMessage(followUpError);
        setTimeout(() => router.push("/transactions"), 2500);
        return;
      }

      doneRef.current = true;
      setDone(true);
      setSuccessNotice(`${txType} saved successfully!`);
      void revalidateTransactionLists(swrMutate, cache);
      mutate("/api/accounts");
      setTimeout(() => router.push("/transactions"), 600);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      // Booked saves stay locked through `done`; the in-flight flag always clears.
      setSaving(false);
    }
  };

  // Edit: Duplicate seeds the new-entry screen from the loaded row; Delete asks first.
  async function deleteEntry() {
    if (!editMode) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        editMode.kind === "edit-transfer"
          ? `/api/transactions/transfer?linkId=${encodeURIComponent(editMode.linkId)}`
          : `/api/transactions?id=${editMode.tx.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(
          data?.code === "portfolio_edit_blocked"
            ? (data.error ?? "Delete blocked by portfolio dependencies.")
            : (data?.error ?? `Delete failed (${res.status})`),
        );
        return;
      }
      setConfirmOpen(false);
      refreshLists();
      goReturn();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not reach the server.");
    } finally {
      setDeleting(false);
    }
  }
  const editOverflow: OverflowAction[] | undefined = !editMode
    ? undefined
    : editMode.kind === "edit-transfer"
      ? [{ label: "Delete transfer", icon: Trash2, destructive: true, onSelect: () => setConfirmOpen(true) }]
      : [
          {
            label: "Duplicate",
            icon: Copy,
            disabled: !canDuplicate(editMode.tx, editMode.tx.currency),
            onSelect: () => {
              if (!canDuplicate(editMode.tx, editMode.tx.currency)) return;
              writePrefill(buildPrefill(editMode.tx as unknown as Parameters<typeof buildPrefill>[0]));
              router.push("/transactions/new?prefill=1");
            },
          },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirmOpen(true) },
        ];

  // Layout budget (phone 390x844; sat/sab = safe-area top/bottom). The page root is fixed from
  // --sat to --sab (the tab bar is hidden on this route), so its height is 844 - sat - sab:
  // 844 with 0/0 insets, 763 with 47/34. Rows are fixed height; only the list region scrolls.
  // Measured (Playwright, 390x844): 0/0 closed Save 475-519; 47/34 closed Save 522-566, numpad dock 601-810,
  // amount row 204-265 and Save 522-566 both above the dock.
  //   top bar          h-11                         44
  //   gap              mt-2                          8
  //   type control     h-11                         44
  //   gap              mt-3                         12
  //   list             rows 48+56+48+48+48+48 = 296
  //                    + 5 dividers + 2 border     303
  //   gap              gap-2                         8
  //   More details     h-11                         44
  //   gap              gap-2 + mt-1                 12
  //   Save and Cancel  h-12                         48
  //   closed total                                 519   (rule row 44+8 and error box ~48 add when shown)
  //   budget 763 (47/34): 763 - 519 = 244 spare; budget 844 (0/0): 325 spare.
  // Numpad open: the dock is pinned to --sab and is NUMPAD_HEIGHT_PX (209) tall, so its top is
  // 844 - 34 - 209 = 601 with 47/34 insets (635 with 0/0). The amount row and Save sit above that line, and the
  // scroll region keeps NUMPAD_HEIGHT_PX of bottom padding while open (pointer-coarse only), so a focused
  // row can scroll above the dock. pb-[209px] below must equal NUMPAD_HEIGHT_PX.
  const moreSummary = [
    tags.trim() ? "Tags" : null,
    isBusiness ? "Business" : null,
    splitActive ? "Split" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const fxAmountLine =
    txType === "Transfer"
      ? transferEnteredCcy && transferEntryFx.state !== "idle"
        ? <FxPreviewLine preview={transferEntryFx} className="text-xs text-muted-foreground" />
        : transferCrossCcy && transferFxPreview.state !== "idle"
          ? <FxPreviewLine preview={transferFxPreview} className="text-xs text-muted-foreground" />
          : undefined
      : fxPreview.state !== "idle"
        ? <FxPreviewLine preview={fxPreview} className="text-xs text-muted-foreground" />
        : undefined;
  const invalidField = invalid?.field ?? null;

  return (
    <div
      data-testid="txnew-root"
      data-mode={mode.kind}
      className={cn(
        "flex flex-col bg-background text-foreground",
        "max-regular:fixed max-regular:inset-x-0 max-regular:top-[var(--sat)] max-regular:bottom-[var(--sab,0px)]",
        // No page gutter on this root: stop the bar bleeding (-mx-4) past the screen edge so it keeps its own 16px side padding.
        "max-regular:[&>[data-slot=page-header]]:mx-0",
        "regular:relative regular:mx-auto regular:h-[min(46rem,calc(100dvh-8rem))] regular:w-full regular:max-w-md regular:rounded-2xl regular:border regular:border-border/80",
      )}
    >
      {/* Global page bar (PageHeader): back = history back, else /transactions. The spinner shows while saving. */}
      {/* This page is a full-screen fixed root with no page gutter, so the bar must not bleed (-mx-4) past its edges:
          the root class below keeps the bar's own 16px gutter, the same as every other page. */}
      <PageHeader
        className="shrink-0"
        title={editMode ? `Edit ${txType.toLowerCase()}` : `New ${txType}`}
        {...(editMode
          ? { backHref: returnTo, backLabel: "Back" }
          : { onBack: goBack, backLabel: "Back to transactions" })}
        overflow={editOverflow}
        actions={
          saving ? (
            <span role="status" aria-label="Saving" className={`${HEADER_CELL} flex size-11 items-center justify-center`}>
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            </span>
          ) : undefined
        }
      />

      {/* Type control (44px), 8px below the top bar. */}
      <div data-testid="txnew-type" className="mt-2 shrink-0 px-4">
        <TypeSegmented
          value={txType}
          disabledOptions={
            editMode?.kind === "edit" ? ["Transfer"] : editMode?.kind === "edit-transfer" ? ["Expense", "Income"] : undefined
          }
          onChange={(next) => {
            setTxType(next);
            setErrorMessage(null);
            setInvalid(null);
            closePad();
          }}
        />
      </div>

      {/* The only scrolling region. Reserves the numpad height while the numpad is open (touch only). */}
      <main
        className={cn(
          "mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-3",
          showNumpad && "pointer-coarse:pb-[209px]",
        )}
      >
        {/* Notice banners */}
        {(prefillNotice || urlInvestmentAccount || successNotice) && (
          <div className="shrink-0 space-y-2">
            {prefillNotice && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs animate-in fade-in">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                <span className="flex-1 leading-relaxed">{prefillNotice}</span>
              </div>
            )}
            {urlInvestmentAccount && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs animate-in fade-in">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                <span className="flex-1 leading-relaxed">
                  Investment accounts use Buy/Sell.{" "}
                  <Link href={`/portfolio/new?account=${urlInvestmentAccount.id}`} className="underline font-medium hover:no-underline">
                    Open Buy/Sell
                  </Link>
                </span>
              </div>
            )}
            {successNotice && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-pos/10 border border-pos/30 text-pos text-xs animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-pos" />
                <span className="flex-1 leading-relaxed">{successNotice}</span>
              </div>
            )}
          </div>
        )}

        {/* Field list. Expense/Income: Date, Amount, Category, Account, Payee, Note.
            Transfer: Date, Amount, From Account, To Account, Received (cross-currency only), Note. */}
        <ListCard className="shrink-0" data-testid="txnew-list">
          {/* The OS date picker: a native date input (iOS/Android sheets, desktop calendar popup). */}
          <FormRow variant="custom" testId="txnew-row-date" label="Date" icon={CalendarDays} htmlFor="txnew-date">
            <input
              id="txnew-date"
              type="date"
              value={date}
              max="9999-12-31"
              onFocus={closePad}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
              className="block min-h-row w-full min-w-0 bg-transparent text-left text-base text-foreground outline-none"
            />
          </FormRow>
          <AmountRow
            testId="txnew-row-amount"
            value={amount}
            onChange={(v) => {
              setAmount(v);
              if (isEditTransfer) setReceivedTouched(false); // a new sent amount refills the received amount
              setInvalid((prev) => (prev?.field === "amount" ? null : prev));
            }}
            onOpenPad={openPad}
            currency={currency}
            currencyDisabled={isEditTransfer}
            onOpenCurrency={() => {
              closePad();
              setShowCurrencySelector(true);
            }}
            showCurrency
            fxLine={fxAmountLine}
            invalid={invalidField === "amount"}
          />
          {txType !== "Transfer" && (
            <FormRow
              variant="button"
              testId="txnew-row-category"
              label="Category"
              icon={Tag}
              value={
                selectedCat ? (
                  <>
                    {selectedCat.name}
                    {suggestedCategoryId !== null && categoryId === suggestedCategoryId && (
                      <span className="ml-1.5 text-xs text-muted-foreground">· Suggested</span>
                    )}
                  </>
                ) : undefined
              }
              placeholder={loadingCategories ? "Loading categories..." : "Select Category"}
              invalid={invalidField === "category"}
              onClick={() => {
                closePad();
                setActiveSplitRowId(null);
                setShowCatSelector(true);
              }}
            />
          )}
          {/* From and To share a relative wrapper so the Transfer swap button sits on their divider;
              the wrapper repeats the group's hairline (divide-y) because the two rows are no longer its direct children. */}
          <div className="relative divide-y divide-border">
            <FormRow
              variant="button"
              testId="txnew-row-account"
              label={txType === "Transfer" ? "From" : "Account"}
              icon={Wallet}
              value={selectedAcc?.name}
              placeholder={loadingAccounts ? "Loading accounts..." : "Select Account"}
              invalid={invalidField === "account"}
              className={txType === "Transfer" ? "pr-16" : undefined}
              onClick={() => {
                closePad();
                setShowAccSelector(true);
              }}
            />
            {txType === "Transfer" && (
              <>
                <FormRow
                  variant="button"
                  testId="txnew-row-to-account"
                  label="To"
                  icon={Wallet}
                  value={selectedToAcc?.name}
                  placeholder={loadingAccounts ? "Loading accounts..." : "Select Destination Account"}
                  invalid={invalidField === "toAccount"}
                  className="pr-16"
                  onClick={() => {
                    closePad();
                    setShowToAccSelector(true);
                  }}
                />
                <button
                  type="button"
                  aria-label="Swap accounts"
                  data-testid="txnew-swap-accounts"
                  disabled={!accountId && !toAccountId}
                  onClick={swapTransferAccounts}
                  className="absolute right-3 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm blur-soft transition-colors active:bg-muted disabled:opacity-50"
                >
                  <ArrowUpDown aria-hidden="true" className="size-[18px]" />
                </button>
              </>
            )}
          </div>
          {transferCrossCcy && (
            <FormRow
              variant="input"
              testId="txnew-row-received"
              id="transfer-received"
              label={`Received (${selectedToAcc?.currency})`}
              icon={Calculator}
              inputValue={receivedAmount}
              onInputChange={(v) => {
                setReceivedTouched(true);
                setReceivedAmount(v);
              }}
              onInputFocus={closePad}
              inputMode="decimal"
              placeholder={
                transferFxPreview.state === "ok"
                  ? fxPreviewText(transferFxPreview.converted, selectedToAcc?.currency ?? displayCurrency)
                  : "0.00"
              }
            />
          )}
          {txType !== "Transfer" && (
            <FormRow
              variant="input"
              testId="txnew-row-payee"
              id="txnew-payee"
              label="Payee"
              icon={Store}
              inputValue={payee}
              onInputChange={setPayee}
              onInputBlur={() => void suggestCategoryForPayee(payee)}
              placeholder="Payee / Merchant"
              enterKeyHint="next"
              autoComplete="off"
              onInputFocus={() => {
                closePad();
                setFocusedField("payee");
              }}
              onInputKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  document.getElementById("txnew-note")?.focus();
                }
              }}
            />
          )}
          {/* Note: two-row minimum (2x the tall row token), grows with the text up to max-h-48. */}
          <FormRow
            variant="custom"
            testId="txnew-row-note"
            htmlFor="txnew-note"
            label="Note"
            icon={StickyNote}
            className="items-start min-h-[calc(var(--spacing-row-tall)*2)] py-3"
          >
            <AutoTextarea
              id="txnew-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note / Description"
              enterKeyHint="enter"
              autoComplete="off"
              rows={2}
              className="max-h-48 bg-transparent text-base"
              onFocus={() => {
                closePad();
                setFocusedField("note");
              }}
            />
          </FormRow>
        </ListCard>

        {/* Autocomplete pills sit below the list while the field is focused. */}
        {txType !== "Transfer" && (
          <AutocompletePills
            type="payee"
            currentValue={payee}
            onSelect={(val) => setPayee(val)}
            visible={focusedField === "payee"}
          />
        )}
        <AutocompletePills
          type="note"
          currentValue={note}
          onSelect={(val) => setNote(val)}
          visible={focusedField === "note"}
        />

        {/* More details (44px). Tags, Business and Split are collapsed by default. */}
        <button
          type="button"
          data-testid="txnew-more"
          aria-expanded={showMore}
          aria-controls={showMore ? "txnew-more-panel" : undefined}
          onClick={() => {
            closePad();
            setShowMore((v) => !v);
          }}
          className="flex h-11 w-full shrink-0 items-center justify-between rounded-2xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors active:bg-muted"
        >
          <span>More details</span>
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{moreSummary || "Tags · Business · Split"}</span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", showMore && "rotate-180")}
              aria-hidden="true"
            />
          </span>
        </button>

        {showMore && (
          <div id="txnew-more-panel" className="shrink-0 space-y-2 animate-in fade-in duration-200">
            <ListCard>
              <FormRow
                variant="input"
                testId="txnew-row-tags"
                id="txnew-tags"
                label="Tags"
                icon={Hash}
                inputValue={tags}
                onInputChange={setTags}
                placeholder="Comma-separated"
                autoComplete="off"
                onInputFocus={() => {
                  closePad();
                  setFocusedField("tags");
                }}
              />
              <div className="flex min-h-row items-center justify-between gap-3 px-4">
                <label htmlFor="txnew-business" className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-foreground">
                  <Briefcase aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    Business
                    <span className="text-xs font-normal text-muted-foreground">
                      Tag for business accounting and tax reporting
                    </span>
                  </span>
                </label>
                <Switch
                  id="txnew-business"
                  className="shrink-0"
                  checked={isBusiness}
                  onCheckedChange={(checked) => setIsBusiness(checked)}
                />
              </div>
            </ListCard>
            <AutocompletePills
              type="tag"
              currentValue={tags}
              onSelect={(val) => setTags(val)}
              visible={focusedField === "tags"}
            />
            {txType !== "Transfer" && (
              <SplitSection
                count={splitCount}
                onCountChange={setSplitCount}
                rows={splitRows}
                onRowsChange={handleSplitRowsChange}
                parentAmount={parsedAmount}
                currency={currency}
                parentCategoryId={categoryId}
                onOpenCategory={(rowId) => {
                  setActiveSplitRowId(rowId);
                  setShowCatSelector(true);
                }}
                padTargetRowId={padTarget === MAIN_PAD ? null : padTarget}
                onOpenPad={openSplitPad}
                onClosePad={closePad}
                onRowBlur={markSplitRowTouched}
                showEmptyErrors={(rowId) => splitSaveAttempted || touchedSplitRowIds.has(rowId)}
              />
            )}
          </div>
        )}

        {/* Rule suggestion (Expense/Income, payee + category set). Outside More details: Payee is on screen one. */}
        {ruleEligible && (
          <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-2xl border border-info/30 bg-info/10 px-4 py-2">
            <label htmlFor="txnew-also-rule" className="flex min-w-0 flex-1 cursor-pointer flex-col">
              <span className="text-sm font-medium text-foreground">Also create a rule for next time</span>
              <span className="truncate text-xs text-muted-foreground">
                Payee contains &ldquo;{payee.trim()}&rdquo; → {selectedCat?.name}
              </span>
            </label>
            <Switch
              id="txnew-also-rule"
              className="shrink-0"
              checked={alsoCreateRule}
              onCheckedChange={(checked) => setAlsoCreateRule(checked)}
            />
          </div>
        )}

        {editRow && <EditMetaLine tx={editRow} />}

        {errorMessage && (
          <div
            role="alert"
            className="flex shrink-0 items-start gap-2.5 rounded-xl border border-neg/30 bg-neg/10 p-2.5 text-xs text-neg animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-neg" />
            <span className="flex-1 leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {(reallocPreview || reallocPending) && (
          <div className="shrink-0 space-y-2">
            <LotReallocationNotice preview={reallocPreview} loading={reallocPending} />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full"
              disabled={reallocPending || saving}
              onClick={() => void handleSave(true)}
            >
              Reallocate &amp; save
            </Button>
          </div>
        )}

        {/* Save and Cancel (48px), in normal flow after the fields. */}
        <div data-testid="txnew-actions" className="mt-1 grid shrink-0 grid-cols-[1fr_auto] gap-3">
          <Button
            type="button"
            data-testid="txnew-save"
            disabled={saving || done || splitBlocked}
            onClick={() => void handleSave()}
            className="h-12 rounded-2xl text-base font-semibold bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : done ? (
              "Saved"
            ) : (
              "Save"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="txnew-cancel"
            disabled={saving}
            onClick={editMode ? goReturn : goBack}
            className="h-12 rounded-2xl px-5 text-base font-semibold"
          >
            Cancel
          </Button>
        </div>
      </main>

      {/* Numpad dock: pinned to the safe-area bottom (the tab bar is hidden here). Touch only:
          pointer-coarse, never a JS device check, so a desktop never shows it. */}
      <NumpadDock
        activeId={padTarget}
        activeValue={
          padTarget === MAIN_PAD ? amount : (splitRows.find((r) => r.id === padTarget)?.amount ?? "")
        }
        onChange={handleDockChange}
        onDone={closePad}
        decimals={currencyDecimals(currency)}
      />

      {editMode && (
        <EditDeleteDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            setConfirmOpen(open);
            if (!open) setDeleteError(null);
          }}
          isTransfer={isEditTransfer}
          deleting={deleting}
          error={deleteError}
          onConfirm={() => void deleteEntry()}
        />
      )}

      {/* Bottom Sheets */}
      <CurrencySelector
        open={showCurrencySelector}
        onOpenChange={setShowCurrencySelector}
        currencies={currencyOptions}
        selected={currency}
        onSelect={(code) => setCurrencyChoice(code)}
      />

      <CategorySelector
        open={showCatSelector}
        onOpenChange={setShowCatSelector}
        categories={filteredCategories}
        selectedCategoryId={splitEditingRow ? splitEditingRow.categoryId : categoryId}
        recentIds={activeSplitRowId === null ? recentCategoryIds : undefined}
        onSelect={handleCategorySelect}
      />

      <AccountSelector
        open={showAccSelector}
        onOpenChange={setShowAccSelector}
        accounts={activeAccounts}
        groupOrder={groupOrder}
        selectedAccountId={accountId}
        title={txType === "Transfer" ? "Select Source Account" : "Select Account"}
        recentIds={recentAccountIds}
        onSelect={(id) => {
          setAccountId(id);
          setCurrencyChoice("");
          setInvalid((prev) => (prev?.field === "account" ? null : prev));
          pushRecent("account", txCode, id);
        }}
      />

      <AccountSelector
        open={showToAccSelector}
        onOpenChange={setShowToAccSelector}
        accounts={activeAccounts.filter((a) => String(a.id) !== accountId)}
        groupOrder={groupOrder}
        selectedAccountId={toAccountId}
        title="Select Destination Account"
        recentIds={recentToAccountIds}
        onSelect={(id) => {
          setToAccountId(id);
          setInvalid((prev) => (prev?.field === "toAccount" ? null : prev));
          pushRecent("account", "T", id);
        }}
      />

    </div>
  );
}
