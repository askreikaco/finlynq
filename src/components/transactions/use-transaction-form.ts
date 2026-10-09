"use client";

/**
 * useTransactionForm — the form state, seeding, FX preview and save logic behind
 * the Add/Edit Transaction surfaces. Moved verbatim out of transaction-dialog.tsx
 * (PKG1 tx-edit) so the dialog and the full-page edit routes share one
 * implementation. Presentation lives in transaction-form-body.tsx.
 *
 * `open` drives the false->true seed edge: a page mounts with open=true and
 * seeds once on mount.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { fxPreviewText } from "@/lib/currency";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { useDisplayCurrency } from "@/components/currency-provider";
import { useDropdownOrder } from "@/components/dropdown-order-provider";
import { todayISO } from "@/lib/utils/date";
import type {
  Category as RuleEditorCategory,
  Account as RuleEditorAccount,
  Holding as RuleEditorHolding,
} from "@/components/rules/rule-editor-dialog";
import { buildPayeeCategoryRule } from "@/lib/rules/build-payee-category-rule";
import { useFxPreview, type FxPreview } from "@/lib/hooks/use-fx-preview";
import { parseSaveError } from "@/lib/save-error";
import type { Condition, Action } from "@/lib/rules/schema";
import type { LotReallocationPreview } from "@/lib/portfolio/lots/types";
import type {
  TransactionDialogProps,
  TransactionFormValues,
  DialogTransaction,
  DialogLinkedSibling,
} from "./transaction-dialog";

// ─── Internal types ────────────────────────────────────────────────────

type DialogMode = "transaction" | "transfer";

interface SplitRow {
  categoryId: string;
  amount: string;
  note: string;
}

interface TransferFormState {
  date: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  receivedAmount: string;
  holdingName: string;
  destHoldingName: string;
  quantity: string;
  destQuantity: string;
  fromHoldingId: string;
  toHoldingId: string;
  note: string;
  tags: string;
}

interface TransferEditState {
  linkId: string;
  fromTxId: number;
  toTxId: number;
}

const emptySplitRow = (): SplitRow => ({ categoryId: "", amount: "", note: "" });

const FORM_DEFAULTS: TransactionFormValues = {
  date: todayISO(),
  accountId: "",
  categoryId: "",
  currency: "CAD",
  amount: "",
  payee: "",
  note: "",
  tags: "",
  isBusiness: false,
  quantity: "",
  portfolioHoldingId: "",
};

const TRANSFER_DEFAULTS: TransferFormState = {
  date: todayISO(),
  fromAccountId: "",
  toAccountId: "",
  amount: "",
  receivedAmount: "",
  holdingName: "",
  destHoldingName: "",
  quantity: "",
  destQuantity: "",
  fromHoldingId: "",
  toHoldingId: "",
  note: "",
  tags: "",
};

export function useTransactionForm({
  open,
  onOpenChange,
  accounts,
  categories,
  holdings,
  initialState,
  offerRuleSuggestion = false,
  onSaved,
}: TransactionDialogProps) {
  // Get display currency for defaults
  const { displayCurrency } = useDisplayCurrency();

  // Form (transaction mode)
  const [form, setForm] = useState<TransactionFormValues>(FORM_DEFAULTS);
  // Currency options: built-in fiat UNION the user's active currencies (#291).
  const currencyOptions = useActiveCurrencies(form.currency);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSplits, setShowSplits] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([emptySplitRow(), emptySplitRow()]);

  // Mode + transfer state
  const [dialogMode, setDialogMode] = useState<DialogMode>("transaction");
  const [transferForm, setTransferForm] = useState<TransferFormState>(TRANSFER_DEFAULTS);
  const [transferEdit, setTransferEdit] = useState<TransferEditState | null>(null);
  const [destHoldingTouched, setDestHoldingTouched] = useState(false);
  const [destQuantityTouched, setDestQuantityTouched] = useState(false);
  const [transferReceivedTouched, setTransferReceivedTouched] = useState(false);
  // FINLYNQ-317 — the sent/received pair as ORIGINALLY booked, on a
  // cross-currency transfer edit. Lets the rate caption show the rate the user
  // actually got on that date rather than the market rate for the same date.
  const [transferBooked, setTransferBooked] = useState<{ sent: number; received: number } | null>(null);

  // FX preview
  const fxAccountCurrency = accounts.find((a) => String(a.id) === form.accountId)?.currency;
  const fxPreview = useFxPreview({
    enabled: open,
    from: form.currency,
    to: fxAccountCurrency,
    amount: parseFloat(form.amount),
    date: form.date,
  });
  const [transferFxPreview, setTransferFxPreview] = useState<FxPreview>({ state: "idle" });
  const transferFxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI state
  const [submitError, setSubmitError] = useState<{ message: string; currency?: string } | null>(null);
  // In-flight guard for the transaction save. Without it a double-click on
  // "Create Transaction" fired two POSTs and booked the transaction twice
  // (review 2026-07-30, finding #10).
  const [saving, setSaving] = useState(false);
  // FINLYNQ-176 — when an edit is lot-locked, hold the reallocation preview so
  // the user can confirm proceeding (reallocate dependents) instead of failing.
  const [reallocPreview, setReallocPreview] = useState<LotReallocationPreview | null>(null);
  const [reallocPending, setReallocPending] = useState(false);
  const [linkedSiblings, setLinkedSiblings] = useState<DialogLinkedSibling[]>([]);
  const [transferDeleting, setTransferDeleting] = useState(false);

  // ─── Rule suggestion (FINLYNQ-125) ──────────────────────────────────
  // Opt-in via `offerRuleSuggestion` (reconcile/import only). The tx always
  // saves + reconciles FIRST; the rule POST is best-effort and never blocks.
  const [alsoCreateRule, setAlsoCreateRule] = useState(false);
  const [ruleNotice, setRuleNotice] = useState<string | null>(null);
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [ruleSeed, setRuleSeed] = useState<{ payee: string; categoryId: number } | null>(null);

  // Edit context — derived from initialState. Held in a ref so async splits
  // fetch can match it on resolve.
  const [editingTx, setEditingTx] = useState<DialogTransaction | null>(null);
  const [transferEditCredit, setTransferEditCredit] = useState<DialogTransaction | null>(null);
  const editId = editingTx?.id ?? null;

  const sortAccount = useDropdownOrder("account");
  const sortCategory = useDropdownOrder("category");
  const sortHolding = useDropdownOrder("holding");

  // ─── Seed state on open transition ──────────────────────────────────
  // Tracks the previous `open` value so we only seed on false→true edges.
  // NOTE: the false→true seeding effect is declared *below* the
  // seedFromInitialState/resetToCreateDefaults function declarations so the
  // effect closure doesn't reference them before their lexical declaration
  // (react-hooks/immutability, FINLYNQ-119). Hook call order is unchanged —
  // no hooks sit between here and that effect.
  const wasOpen = useRef(false);

  function seedFromInitialState() {
    setSubmitError(null);
    setTransferDeleting(false);
    if (!initialState) {
      resetToCreateDefaults();
      return;
    }
    if (initialState.kind === "transaction-edit") {
      const t = initialState.tx;
      setEditingTx(t);
      setTransferEditCredit(null);
      setTransferEdit(null);
      setDialogMode("transaction");
      setForm({
        date: t.date,
        accountId: String(t.accountId),
        categoryId: String(t.categoryId),
        currency: t.enteredCurrency ?? t.currency,
        amount: String(t.enteredAmount ?? t.amount),
        payee: t.payee || "",
        note: t.note || "",
        tags: t.tags || "",
        isBusiness: t.isBusiness === 1,
        quantity: t.quantity != null ? String(t.quantity) : "",
        portfolioHoldingId: t.portfolioHolding || "",
      });
      setShowAdvanced(t.isBusiness === 1 || t.quantity != null || !!t.portfolioHolding);
      setShowSplits(false);
      setSplitRows([emptySplitRow(), emptySplitRow()]);
      setLinkedSiblings(initialState.linkedSiblings ?? []);
      // Async load existing splits
      fetch(`/api/transactions/splits?transactionId=${t.id}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Array<{ categoryId: number | null; amount: number; note: string | null }>) => {
          if (Array.isArray(rows) && rows.length > 0) {
            setSplitRows(
              rows.map((r) => ({
                categoryId: r.categoryId ? String(r.categoryId) : "",
                amount: String(r.amount),
                note: r.note ?? "",
              })),
            );
            setShowSplits(true);
          }
        })
        .catch(() => {});
      return;
    }
    if (initialState.kind === "transfer-edit") {
      const { debit, credit, linkId } = initialState;
      setEditingTx(debit);
      setTransferEditCredit(credit);
      setLinkedSiblings([]);
      setDialogMode("transfer");
      setTransferEdit({ linkId, fromTxId: debit.id, toTxId: credit.id });

      const sourceLegAmount = Math.abs(debit.enteredAmount ?? debit.amount);
      // FINLYNQ-317 — the destination leg's `amount` is the ONLY column
      // denominated in the DESTINATION account's currency. createTransferPair
      // stamps BOTH legs with the source currency in `enteredCurrency` /
      // `enteredAmount` and keeps the conversion in `enteredFxRate`, so
      // `credit.enteredAmount` is the amount SENT. Reading it here showed 300
      // USD under an "Amount received (CAD)" label and — because the seed below
      // marks the field user-touched — saving re-booked the pair at 1:1,
      // silently destroying the rate the user actually banked.
      const destLegAmount = Math.abs(credit.amount);
      const sourceAcct = accounts.find((a) => a.id === debit.accountId);
      const destAcct = accounts.find((a) => a.id === credit.accountId);
      const isCrossCcy = !!sourceAcct && !!destAcct && sourceAcct.currency !== destAcct.currency;

      const sourceLegHolding = debit.portfolioHolding;
      const destLegHolding = credit.portfolioHolding;
      const sourceLegQty =
        debit.quantity != null ? Math.abs(debit.quantity) : credit.quantity != null ? Math.abs(credit.quantity) : 0;
      const destLegQty = credit.quantity != null ? Math.abs(credit.quantity) : debit.quantity != null ? Math.abs(debit.quantity) : 0;
      const inKindHolding = sourceLegHolding ?? destLegHolding ?? "";
      const inKindQty = sourceLegQty || destLegQty;
      const isInKind = !!inKindHolding && inKindQty > 0;
      const destQtyDiffers = isInKind && sourceLegQty > 0 && destLegQty > 0 && Math.abs(sourceLegQty - destLegQty) > 1e-9;
      const destHoldingDiffers =
        isInKind && !!sourceLegHolding && !!destLegHolding && destLegHolding !== sourceLegHolding;

      setTransferForm({
        date: debit.date,
        fromAccountId: String(debit.accountId),
        toAccountId: String(credit.accountId),
        amount: String(sourceLegAmount),
        receivedAmount: isCrossCcy ? String(destLegAmount) : "",
        holdingName: isInKind ? inKindHolding : "",
        destHoldingName: destHoldingDiffers ? (destLegHolding ?? "") : "",
        quantity: isInKind ? String(sourceLegQty || inKindQty) : "",
        destQuantity: destQtyDiffers ? String(destLegQty) : "",
        fromHoldingId: "",
        toHoldingId: "",
        note: debit.note || credit.note || "",
        tags: debit.tags || credit.tags || "",
      });
      setDestHoldingTouched(destHoldingDiffers);
      setDestQuantityTouched(destQtyDiffers);
      // Pre-filled receivedAmount IS the canonical booked rate; mark touched
      // so the FX preview doesn't auto-overwrite with a fresh market rate.
      setTransferReceivedTouched(true);
      setTransferBooked(isCrossCcy ? { sent: sourceLegAmount, received: destLegAmount } : null);
      return;
    }
    if (initialState.kind === "transfer-create") {
      resetToCreateDefaults();
      setDialogMode("transfer");
      const from = initialState.fromAccountId;
      if (from) setTransferForm((tf) => ({ ...tf, fromAccountId: from }));
      return;
    }
    // transaction-prefill
    resetToCreateDefaults();
    setForm((prev) => ({ ...prev, ...initialState.values }));
    // Reconcile materialize (2026-06-04): seed the Transfer tab from the same
    // bank row so switching tabs keeps the date/amount/source account, and
    // open in Transfer mode when a rule named a destination account.
    const seed = initialState.transferSeed;
    if (seed) {
      setTransferForm((tf) => ({
        ...tf,
        ...(seed.fromAccountId != null ? { fromAccountId: seed.fromAccountId } : {}),
        ...(seed.toAccountId != null ? { toAccountId: seed.toAccountId } : {}),
        ...(seed.date != null ? { date: seed.date } : {}),
        ...(seed.amount != null ? { amount: seed.amount } : {}),
        ...(seed.note != null ? { note: seed.note } : {}),
      }));
      if (seed.toAccountId) {
        setDialogMode("transfer");
      }
    }
  }

  function resetToCreateDefaults() {
    setEditingTx(null);
    setTransferEditCredit(null);
    setTransferEdit(null);
    setDialogMode("transaction");
    setForm({
      ...FORM_DEFAULTS,
      date: todayISO(),
      currency: displayCurrency || FORM_DEFAULTS.currency,
    });
    setShowAdvanced(false);
    setShowSplits(false);
    setSplitRows([emptySplitRow(), emptySplitRow()]);
    setTransferForm({
      ...TRANSFER_DEFAULTS,
      date: todayISO(),
    });
    setTransferReceivedTouched(false);
    setTransferBooked(null);
    setDestHoldingTouched(false);
    setDestQuantityTouched(false);
    setTransferFxPreview({ state: "idle" });
    setLinkedSiblings([]);
    setAlsoCreateRule(false);
    setRuleNotice(null);
  }

  // Seed on the false→true `open` edge. Declared after the two seed helpers
  // above so the effect closure references them post-declaration (FINLYNQ-119).
  useEffect(() => {
    if (open && !wasOpen.current) {
      seedFromInitialState();
    }
    wasOpen.current = open;
    // initialState changes are picked up at next open transition; we don't
    // want a mid-edit re-seed to wipe user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset received-touched flag whenever the user types a new source amount in
  // cross-currency transfer mode (allows FX preview to refill the dest).
  // This is mirrored inside the input's onChange but lifted here for clarity.

  // Clear per-side holding state when an account transitions away from
  // investment (full behavior preserved from the original inline dialog).
  const prevFromIsInvestmentRef = useRef(false);
  const prevToIsInvestmentRef = useRef(false);
  useEffect(() => {
    const fromAcct = accounts.find((a) => String(a.id) === transferForm.fromAccountId);
    const toAcct = accounts.find((a) => String(a.id) === transferForm.toAccountId);
    const fromIsInvestment = fromAcct?.isInvestment === true;
    const toIsInvestment = toAcct?.isInvestment === true;

    if (prevFromIsInvestmentRef.current && !fromIsInvestment) {
      setTransferForm((tf) => ({
        ...tf,
        fromHoldingId: "",
        holdingName: "",
        quantity: "",
      }));
    }
    if (prevToIsInvestmentRef.current && !toIsInvestment) {
      setTransferForm((tf) => ({
        ...tf,
        toHoldingId: "",
        destHoldingName: "",
        destQuantity: "",
      }));
      setDestHoldingTouched(false);
      setDestQuantityTouched(false);
    }
    if (
      !fromIsInvestment &&
      !toIsInvestment &&
      (prevFromIsInvestmentRef.current || prevToIsInvestmentRef.current)
    ) {
      setTransferForm((tf) => ({
        ...tf,
        holdingName: "",
        destHoldingName: "",
        quantity: "",
        destQuantity: "",
        fromHoldingId: "",
        toHoldingId: "",
      }));
      setDestHoldingTouched(false);
      setDestQuantityTouched(false);
    }

    prevFromIsInvestmentRef.current = fromIsInvestment;
    prevToIsInvestmentRef.current = toIsInvestment;
  }, [transferForm.fromAccountId, transferForm.toAccountId, accounts]);

  // ─── FX preview (transfer mode) ─────────────────────────────────────
  useEffect(() => {
    if (transferFxTimer.current) clearTimeout(transferFxTimer.current);
    if (!open || dialogMode !== "transfer") {
      setTransferFxPreview({ state: "idle" });
      return;
    }
    const fromAcct = accounts.find((a) => String(a.id) === transferForm.fromAccountId);
    const toAcct = accounts.find((a) => String(a.id) === transferForm.toAccountId);
    const amountNum = parseFloat(transferForm.amount);
    if (
      !fromAcct ||
      !toAcct ||
      !transferForm.amount ||
      !Number.isFinite(amountNum) ||
      amountNum <= 0 ||
      fromAcct.currency === toAcct.currency
    ) {
      setTransferFxPreview({ state: "idle" });
      return;
    }
    setTransferFxPreview({ state: "loading" });
    transferFxTimer.current = setTimeout(() => {
      const params = new URLSearchParams({
        from: fromAcct.currency,
        to: toAcct.currency,
        date: transferForm.date,
        amount: String(amountNum),
      });
      fetch(`/api/fx/preview?${params}`)
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok) {
            setTransferFxPreview({ state: "error", message: d?.error ?? "Rate lookup failed" });
            return;
          }
          if (d?.needsOverride === true) {
            setTransferFxPreview({ state: "needs-override" });
            return;
          }
          const converted = Number(d.converted ?? 0);
          setTransferFxPreview({
            state: "ok",
            rate: Number(d.rate ?? 0),
            source: String(d.source ?? "—"),
            converted,
            date: String(d.date ?? transferForm.date),
            to: toAcct.currency,
          });
          if (!transferReceivedTouched) {
            const targetCcy = toAcct?.currency ?? displayCurrency;
            setTransferForm((tf) => ({ ...tf, receivedAmount: fxPreviewText(converted, targetCcy) }));
          }
        })
        .catch((e) => setTransferFxPreview({ state: "error", message: String(e?.message ?? "Network error") }));
    }, 300);
    return () => {
      if (transferFxTimer.current) clearTimeout(transferFxTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dialogMode, transferForm.fromAccountId, transferForm.toAccountId, transferForm.amount, transferForm.date, accounts]);

  // ─── Handlers ───────────────────────────────────────────────────────
  // FINLYNQ-125 — `ruleIntent` is driven by which submit path fired:
  //   "none"      → plain create/update (default; /transactions + checkbox off)
  //   "auto"      → checkbox ticked: best-effort POST /api/rules after save
  //   "customize" → "Customize…": after save, open the seeded RuleEditorDialog
  // The tx POST + splits + onSaved (reconcile link) ALWAYS complete first; the
  // rule step is best-effort and never blocks the save/reconcile.
  async function handleSubmit(
    e: React.FormEvent,
    ruleIntent: "none" | "auto" | "customize" = "none",
    confirmReallocation = false,
  ) {
    e.preventDefault();
    // Double-submit guard — a second click while the POST is in flight would
    // book the transaction twice (there is no idempotency key on the route).
    if (saving) return;
    setSubmitError(null);
    setRuleNotice(null);
    if (!confirmReallocation) setReallocPreview(null);

    if (!form.accountId) {
      setSubmitError({ message: "Pick an account" });
      return;
    }
    if (!form.categoryId) {
      setSubmitError({ message: "Pick a category" });
      return;
    }
    if (!form.amount || Number.isNaN(parseFloat(form.amount))) {
      setSubmitError({ message: "Enter an amount" });
      return;
    }
    const sel = accounts.find((a) => String(a.id) === form.accountId);
    if (sel?.isInvestment === true && !form.portfolioHoldingId) {
      setSubmitError({ message: `Pick a portfolio holding — ${sel.name} is an investment account.` });
      return;
    }

    const body: Record<string, unknown> = {
      ...(editId ? { id: editId } : {}),
      date: form.date,
      accountId: Number(form.accountId),
      categoryId: Number(form.categoryId),
      enteredCurrency: form.currency,
      enteredAmount: parseFloat(form.amount),
      payee: form.payee,
      note: form.note,
      tags: form.tags,
      isBusiness: form.isBusiness ? 1 : 0,
    };
    if (form.quantity) body.quantity = parseFloat(form.quantity);
    if (form.portfolioHoldingId) body.portfolioHolding = form.portfolioHoldingId;
    // FINLYNQ-176 — on the confirm pass, opt into reallocating dependents.
    if (confirmReallocation && editId) body.confirmReallocation = true;

    // Everything past this point touches the network. A thrown fetch (offline,
    // DNS, aborted connection) used to escape handleSubmit entirely, leaving
    // the user staring at an unchanged dialog with no indication the save
    // failed. The dialog now stays OPEN with input preserved and an error
    // shown, per the form-validation convention.
    setSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Read a CLONE so `parseSaveError` below still has an unconsumed body.
        const data = await res.clone().json().catch(() => ({}));
        if (data?.code === "fx-currency-needs-override") {
          setSubmitError({
            message: `No FX rate for ${data.currency ?? form.currency}.`,
            currency: data.currency ?? form.currency,
          });
        } else if (data?.code === "portfolio_edit_blocked" && editId) {
          // The edited row opened a lot that's been sold/transferred out.
          // FINLYNQ-176 — fetch the reallocation preview and let the user
          // confirm proceeding instead of dead-ending.
          setSubmitError({
            message:
              "This transaction opened a lot that has since been sold or transferred out. " +
              "You can still save your edit — the dependent transactions will be re-matched to your other lots.",
          });
          setReallocPreview(null);
          setReallocPending(true);
          try {
            const pRes = await fetch("/api/transactions/lot-replan-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ op: "edit", id: editId }),
            });
            if (pRes.ok) {
              const pData = await pRes.json().catch(() => null);
              if (pData?.preview) setReallocPreview(pData.preview as LotReallocationPreview);
            }
          } finally {
            setReallocPending(false);
          }
        } else {
          // parseSaveError owns HTTP 423 → the canonical DEK_LOCKED_MESSAGE
          // ("Unlock your data to make changes"), which the hand-rolled
          // `data?.error` read here used to bury under a raw server string.
          setSubmitError({ message: await parseSaveError(res, `Save failed (${res.status})`) });
        }
        return;
      }
      // A successful (re)save clears any pending reallocation prompt.
      setReallocPreview(null);

      let savedTxId = editId;
      if (!savedTxId) {
        const created = await res.json();
        savedTxId = created.id;
      }

      // Splits are a SEPARATE POST after the transaction exists. Its response
      // was previously never checked, so a failed/locked splits write was
      // silently discarded and the dialog closed as if everything saved. The
      // transaction itself is already committed, so onSaved (reconcile link,
      // list refresh) still runs — but the dialog stays open with the error.
      let splitsError: string | null = null;
      if (showSplits && splitRows.filter((r) => r.amount).length >= 2 && savedTxId) {
        const sign = parseFloat(form.amount) < 0 ? -1 : 1;
        const splitRes = await fetch("/api/transactions/splits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: savedTxId,
            splits: splitRows
              .filter((r) => r.amount)
              .map((r) => ({
                categoryId: r.categoryId ? parseInt(r.categoryId) : null,
                amount: sign * Math.abs(parseFloat(r.amount) || 0),
                note: r.note,
              })),
          }),
        });
        if (!splitRes.ok) {
          splitsError = await parseSaveError(
            splitRes,
            `The splits could not be saved (${splitRes.status}).`,
          );
        }
      }

      if (savedTxId) {
        await onSaved(savedTxId, {
          mode: editId ? "update" : "create",
          isTransfer: false,
        });
      }

      if (splitsError) {
        setSubmitError({
          message: `Transaction saved, but the splits were not: ${splitsError}`,
        });
        return;
      }

      // ─── Rule suggestion (FINLYNQ-125) ────────────────────────────────
      // Runs ONLY after the tx save + reconcile link above succeeded. A failure
      // here never unwinds the saved tx — at worst it leaves a soft amber notice
      // and keeps the dialog open.
      const trimmedPayee = form.payee.trim();
      const catId = Number(form.categoryId);
      if (ruleIntent === "customize" && trimmedPayee && catId > 0) {
        setRuleSeed({ payee: trimmedPayee, categoryId: catId });
        setRuleEditorOpen(true);
        onOpenChange(false); // close main dialog; sibling editor opens as it closes
        return;
      }
      if (ruleIntent === "auto" && trimmedPayee && catId > 0) {
        try {
          const ruleRes = await fetch("/api/rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildPayeeCategoryRule(trimmedPayee, catId)),
          });
          if (!ruleRes.ok) {
            const data = await ruleRes.json().catch(() => ({}));
            // Transaction is already saved; surface a soft notice and keep the
            // dialog open so the user can retry "Customize…" if they want.
            setRuleNotice(
              data?.error
                ? `Transaction saved, but the rule could not be created: ${data.error}`
                : "Transaction saved, but the rule could not be created.",
            );
            return;
          }
        } catch (err) {
          setRuleNotice(
            err instanceof Error
              ? `Transaction saved, but the rule could not be created: ${err.message}`
              : "Transaction saved, but the rule could not be created.",
          );
          return;
        }
      }

      onOpenChange(false);
    } catch (err) {
      setSubmitError({
        message:
          err instanceof Error
            ? `Could not reach the server: ${err.message}`
            : "Could not reach the server. Check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTransferSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const fromAccountId = Number(transferForm.fromAccountId);
    const toAccountId = Number(transferForm.toAccountId);
    if (!fromAccountId || !toAccountId) {
      setSubmitError({ message: "Pick both a source and destination account" });
      return;
    }

    const fromAcctCheck = accounts.find((a) => a.id === fromAccountId);
    const toAcctCheck = accounts.find((a) => a.id === toAccountId);
    const bothInv = fromAcctCheck?.isInvestment === true && toAcctCheck?.isInvestment === true;
    if (fromAccountId === toAccountId && !bothInv) {
      setSubmitError({ message: "From and To accounts must differ for a cash transfer" });
      return;
    }

    const enteredAmount = parseFloat(transferForm.amount || "0");
    const isInKind = bothInv;
    let quantityNum: number | undefined;
    let holdingName: string | undefined;
    if (isInKind) {
      holdingName = transferForm.holdingName.trim();
      if (!holdingName) {
        setSubmitError({ message: "Pick a holding for the in-kind transfer" });
        return;
      }
      const q = parseFloat(transferForm.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        setSubmitError({ message: "Quantity must be a positive number for an in-kind transfer" });
        return;
      }
      quantityNum = q;
      if (!Number.isFinite(enteredAmount) || enteredAmount < 0) {
        setSubmitError({ message: "Cash amount must be 0 or a positive number" });
        return;
      }
    } else {
      if (!Number.isFinite(enteredAmount) || enteredAmount <= 0) {
        setSubmitError({ message: "Amount must be a positive number" });
        return;
      }
    }

    const fromAcct = fromAcctCheck;
    const toAcct = toAcctCheck;
    const isCrossCcy = !!fromAcct && !!toAcct && fromAcct.currency !== toAcct.currency;

    let fromHoldingPin: number | undefined;
    let toHoldingPin: number | undefined;
    let singleSideQuantity: number | undefined;
    if (!isInKind) {
      if (fromAcct?.isInvestment === true) {
        if (!transferForm.fromHoldingId) {
          setSubmitError({ message: `Pick a source holding — ${fromAcct.name} is an investment account.` });
          return;
        }
        fromHoldingPin = Number(transferForm.fromHoldingId);
      }
      if (toAcct?.isInvestment === true) {
        if (!transferForm.toHoldingId) {
          setSubmitError({ message: `Pick a destination holding — ${toAcct.name} is an investment account.` });
          return;
        }
        toHoldingPin = Number(transferForm.toHoldingId);
      }
      if (!transferEdit && (fromHoldingPin != null || toHoldingPin != null)) {
        const q = parseFloat(transferForm.quantity);
        if (!Number.isFinite(q) || q <= 0) {
          setSubmitError({
            message: "Quantity (shares) must be a positive number for an investment-account transfer",
          });
          return;
        }
        singleSideQuantity = q;
      }
    }

    let receivedAmount: number | undefined;
    if (isCrossCcy && transferForm.receivedAmount) {
      const parsed = parseFloat(transferForm.receivedAmount);
      if (Number.isFinite(parsed) && parsed >= 0) receivedAmount = parsed;
    }

    const body: Record<string, unknown> = {
      fromAccountId,
      toAccountId,
      enteredAmount,
      date: transferForm.date,
      ...(receivedAmount != null ? { receivedAmount } : {}),
      ...(fromHoldingPin != null ? { fromHoldingId: fromHoldingPin } : {}),
      ...(toHoldingPin != null ? { toHoldingId: toHoldingPin } : {}),
      ...(singleSideQuantity != null ? { quantity: singleSideQuantity } : {}),
      ...(transferForm.note ? { note: transferForm.note } : {}),
      ...(transferForm.tags ? { tags: transferForm.tags } : {}),
      ...(transferEdit ? { linkId: transferEdit.linkId } : {}),
    };

    const isEdit = !!transferEdit;
    if (isInKind) {
      body.holdingName = holdingName;
      body.quantity = quantityNum;
      const destOverride = transferForm.destHoldingName.trim();
      if (destOverride && destOverride !== holdingName) {
        body.destHoldingName = destOverride;
      } else if (isEdit) {
        body.destHoldingName = null;
      }
      const destQtyRaw = transferForm.destQuantity.trim();
      if (destQuantityTouched && destQtyRaw) {
        const parsed = parseFloat(destQtyRaw);
        if (Number.isFinite(parsed) && parsed > 0 && parsed !== quantityNum) {
          body.destQuantity = parsed;
        } else if (isEdit) {
          body.destQuantity = null;
        }
      } else if (isEdit) {
        body.destQuantity = null;
      }
    } else if (isEdit) {
      body.holdingName = null;
      body.destHoldingName = null;
      body.quantity = null;
      body.destQuantity = null;
    }

    const res = await fetch("/api/transactions/transfer", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.code === "fx-currency-needs-override") {
        setSubmitError({
          message: `No FX rate for ${data.currency ?? toAcct?.currency ?? "destination currency"}.`,
          currency: data.currency,
        });
      } else {
        setSubmitError({ message: data?.error ?? `Save failed (${res.status})` });
      }
      return;
    }

    // Best-effort: return the debit leg id when we can recover it from the
    // server response, else fall back to the existing edit-pair fromTxId.
    let debitTxId = transferEdit?.fromTxId ?? 0;
    try {
      const created = await res.clone().json();
      // `/api/transactions/transfer` returns `fromTransactionId` (the debit
      // leg). Read it first so the reconcile materialize flow can auto-link
      // the bank row to that leg; `fromTxId`/`id` kept as defensive fallbacks.
      if (typeof created?.fromTransactionId === "number") debitTxId = created.fromTransactionId;
      else if (typeof created?.fromTxId === "number") debitTxId = created.fromTxId;
      else if (typeof created?.id === "number") debitTxId = created.id;
    } catch {
      /* response may not have JSON body — ignore */
    }
    await onSaved(debitTxId, {
      mode: isEdit ? "update" : "create",
      isTransfer: true,
    });
    onOpenChange(false);
  }

  async function handleTransferDelete() {
    if (!transferEdit) return;
    setTransferDeleting(true);
    try {
      await fetch(`/api/transactions/transfer?linkId=${encodeURIComponent(transferEdit.linkId)}`, {
        method: "DELETE",
      });
    } finally {
      setTransferDeleting(false);
    }
    await onSaved(transferEdit.fromTxId, { mode: "update", isTransfer: true });
    onOpenChange(false);
  }

  // ─── Computed ───────────────────────────────────────────────────────
  const splitAllocated = useMemo(
    () => splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [splitRows],
  );
  const splitRemaining = Math.abs(parseFloat(form.amount) || 0) - splitAllocated;
  const splitBalanced = Math.abs(splitRemaining) < 0.01;

  // ─── Rule suggestion eligibility (FINLYNQ-125) ──────────────────────
  // Render the affordance ONLY when explicitly opted-in AND in new-entry
  // transaction mode with both a payee and a category set. Never in edit mode,
  // transfer mode, or the generic /transactions dialog (prop defaults off).
  const ruleSelectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === form.categoryId) ?? null,
    [categories, form.categoryId],
  );
  const ruleEligible =
    offerRuleSuggestion &&
    dialogMode === "transaction" &&
    !editId &&
    form.payee.trim().length > 0 &&
    !!ruleSelectedCategory;

  // Map the dialog's FK lists into the RuleEditorDialog shapes once (no new
  // fetch — the inbox tabs already pass these in full).
  const ruleEditorCategories: RuleEditorCategory[] = useMemo(
    () => categories.map((c) => ({ id: c.id, name: c.name, type: c.type, group: c.group })),
    [categories],
  );
  const ruleEditorAccounts: RuleEditorAccount[] = useMemo(
    () => accounts.map((a) => ({ id: a.id, name: a.name })),
    [accounts],
  );
  const ruleEditorHoldings: RuleEditorHolding[] = useMemo(
    () => holdings.map((h) => ({ id: h.id, name: h.name })),
    [holdings],
  );
  const ruleSeedConditions: Condition[] = ruleSeed
    ? [{ field: "payee", op: "contains", value: ruleSeed.payee }]
    : [];
  const ruleSeedActions: Action[] = ruleSeed
    ? [{ kind: "set_category", categoryId: ruleSeed.categoryId }]
    : [];
  const ruleSeedName = ruleSeed ? `Match "${ruleSeed.payee.slice(0, 100)}"` : "";

  /** Dialog close reset (the page never closes in place; it navigates). */
  function resetOnClose() {
    setEditingTx(null);
    setTransferEditCredit(null);
    setDialogMode("transaction");
    setSubmitError(null);
  }

  return {
    form,
    setForm,
    currencyOptions,
    showAdvanced,
    setShowAdvanced,
    showSplits,
    setShowSplits,
    splitRows,
    setSplitRows,
    dialogMode,
    setDialogMode,
    transferForm,
    setTransferForm,
    transferEdit,
    setTransferEdit,
    destHoldingTouched,
    setDestHoldingTouched,
    destQuantityTouched,
    setDestQuantityTouched,
    transferReceivedTouched,
    setTransferReceivedTouched,
    transferBooked,
    fxPreview,
    transferFxPreview,
    setTransferFxPreview,
    submitError,
    setSubmitError,
    saving,
    reallocPreview,
    setReallocPreview,
    reallocPending,
    linkedSiblings,
    setLinkedSiblings,
    transferDeleting,
    alsoCreateRule,
    setAlsoCreateRule,
    ruleNotice,
    setRuleNotice,
    ruleEditorOpen,
    setRuleEditorOpen,
    ruleSeed,
    setRuleSeed,
    editingTx,
    setEditingTx,
    transferEditCredit,
    setTransferEditCredit,
    editId,
    sortAccount,
    sortCategory,
    sortHolding,
    displayCurrency,
    handleSubmit,
    handleTransferSubmit,
    handleTransferDelete,
    splitAllocated,
    splitRemaining,
    splitBalanced,
    ruleEligible,
    ruleSelectedCategory,
    ruleEditorCategories,
    ruleEditorAccounts,
    ruleEditorHoldings,
    ruleSeedConditions,
    ruleSeedActions,
    ruleSeedName,
    resetOnClose,
    accounts,
    categories,
    holdings,
    emptySplitRow,
  };
}

export type TransactionFormState = ReturnType<typeof useTransactionForm>;
export type { DialogTransaction, DialogLinkedSibling };
