"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Calendar,
  ArrowRightLeft,
  AlignLeft,
  Tags,
  ChevronDown,
  ChevronUp,
  User,
  Briefcase,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Wallet,
  Info,
  Coins,
} from "lucide-react";
import { useApi } from "@/lib/data/use-api";
import { mutate } from "swr";
import { formatCurrency, fxPreviewText } from "@/lib/currency";
import Link from "next/link";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Button } from "@/components/ui/button";
import { Numpad, NUMPAD_HEIGHT_PX } from "./_components/numpad";
import { FieldTile } from "./_components/field-tile";
import { CategorySelector, type Category } from "./_components/category-selector";
import { AccountSelector, type Account } from "./_components/account-selector";
import {
  DateTimePickerSheet,
  formatDateTimeDisplay,
} from "./_components/date-time-picker";
import { AutocompletePills } from "./_components/autocomplete-pills";
import { SplitSection, type SplitRow } from "./_components/split-section";
import { readAndClearPrefill } from "@/lib/transactions/prefill";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import { useFxPreview } from "@/lib/hooks/use-fx-preview";
import { FxPreviewLine } from "@/components/transactions/fx-preview-line";
import { buildPayeeCategoryRule } from "@/lib/rules/build-payee-category-rule";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TxType = "Expense" | "Income" | "Transfer";

export default function MobileTransactionPage() {
  const router = useRouter();
  const { displayCurrency } = useDisplayCurrency();

  // Refs to handle StrictMode and prefill application
  const prefillReadRef = useRef(false);
  const prefillAppliedRef = useRef(false);
  // ?account=<id> (set by the account page's New transaction button) preselects the source account.
  const preselectAccountRef = useRef<string | null>(null);
  // ?account=<id> as read from the URL (state, so the investment notice can render).
  const [urlAccountId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("account")
  );

  // Mode
  const [txType, setTxType] = useState<TxType>("Expense");

  // Live Data
  const { data: rawCategories = [], isLoading: loadingCategories } =
    useApi<Category[]>("/api/categories");
  const { data: rawAccounts = [], isLoading: loadingAccounts } =
    useApi<Account[]>("/api/accounts");

  // Prefill notice (malformed/expired sessionStorage entry)
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  // Form State
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState(""); // For Transfer
  const [payee, setPayee] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  // Entered currency; blank = follow the selected account's currency (as the dialog does).
  const [currencyChoice, setCurrencyChoice] = useState("");
  // "Also create a rule for next time" (Expense/Income with payee + category).
  const [alsoCreateRule, setAlsoCreateRule] = useState(false);
  // Cross-currency transfer: amount the destination account receives (user-overridable).
  const [receivedAmount, setReceivedAmount] = useState("");
  const [receivedTouched, setReceivedTouched] = useState(false);

  // Date & Time State
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  // Advanced Options State
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Notes & tags row: collapsed by default; opens when a prefill carries a note or tags.
  const [notesOpen, setNotesOpen] = useState(false);
  const [isBusiness, setIsBusiness] = useState(false);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { id: "1", categoryId: "", amount: "", note: "" },
    { id: "2", categoryId: "", amount: "", note: "" },
  ]);

  // Read prefill from sessionStorage once on mount ([] deps)
  // Uses ref to prevent double-read in StrictMode
  useEffect(() => {
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
      if (prefill.note || prefill.tags) setNotesOpen(true);
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
  const [showNumpad, setShowNumpad] = useState(false);
  const [showCatSelector, setShowCatSelector] = useState(false);
  const [showAccSelector, setShowAccSelector] = useState(false);
  const [showToAccSelector, setShowToAccSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeSplitIndex, setActiveSplitIndex] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<"payee" | "note" | "tags" | null>(null);

  // Submission State
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  // Set once a save has booked: the button stays locked so a second click cannot book it again.
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

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

  // Non-archived Accounts
  // Investment accounts are excluded: they are booked through Buy/Sell, not here.
  const activeAccounts = useMemo(() => {
    return rawAccounts.filter((a) => !a.archived && a.isInvestment !== true);
  }, [rawAccounts]);

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
      setAccountId(String((match ?? activeAccounts[0]).id));
    }
  }, [activeAccounts, accountId, rawAccounts]);

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
  const transferFxPreview = useFxPreview({
    enabled: transferCrossCcy,
    from: selectedAcc?.currency ?? "",
    to: selectedToAcc?.currency,
    amount: parsedAmount,
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
    txType !== "Transfer" && !splitEnabled && payee.trim().length > 0 && !!categoryId;

  // Handle Category Selection for either main category or split row
  const handleCategorySelect = (selectedId: string) => {
    if (activeSplitIndex !== null) {
      const updated = [...splitRows];
      if (updated[activeSplitIndex]) {
        updated[activeSplitIndex] = {
          ...updated[activeSplitIndex],
          categoryId: selectedId,
        };
        setSplitRows(updated);
      }
      setActiveSplitIndex(null);
    } else {
      setCategoryId(selectedId);
    }
  };

  // Submit Handler
  const handleSave = async () => {
    if (saving || doneRef.current) return;
    setErrorMessage(null);
    setSuccessNotice(null);

    if (parsedAmount <= 0) {
      setErrorMessage("Please enter a valid amount greater than 0");
      return;
    }

    if (!accountId) {
      setErrorMessage("Please select an account");
      return;
    }

    setSaving(true);

    try {
      if (txType === "Transfer") {
        // Transfer Mode Validation
        if (!toAccountId) {
          throw new Error("Please select a destination account");
        }
        if (accountId === toAccountId) {
          throw new Error("Destination account must be different from source account");
        }

        let receivedNum: number | undefined;
        if (transferCrossCcy && receivedAmount) {
          const parsedReceived = parseFloat(receivedAmount);
          if (Number.isFinite(parsedReceived) && parsedReceived >= 0) receivedNum = parsedReceived;
        }

        const transferPayload = {
          fromAccountId: Number(accountId),
          toAccountId: Number(toAccountId),
          enteredAmount: Math.abs(parsedAmount),
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

        doneRef.current = true;
        setDone(true);
        setSuccessNotice("Transfer recorded successfully!");
        mutate((k) => typeof k === "string" && k.startsWith("/api/transactions"));
        mutate("/api/accounts");
        setTimeout(() => router.push("/transactions"), 600);
        return;
      }

      // Regular Transaction Mode (Expense / Income)
      if (!splitEnabled && !categoryId) {
        throw new Error("Please select a category");
      }

      if (splitEnabled) {
        const validSplits = splitRows.filter((r) => parseFloat(r.amount) > 0);
        if (validSplits.length < 2) {
          throw new Error("Split transactions require at least 2 split rows with amounts");
        }
        const hasUncategorized = validSplits.some((r) => !r.categoryId);
        if (hasUncategorized) {
          throw new Error("All split rows must have a category assigned");
        }
        const splitSum = validSplits.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);
        const effectiveAccountCurrency = selectedAcc?.currency || displayCurrency;
        if (Math.abs(splitSum - parsedAmount) > 0.05) {
          throw new Error(`Split sum ${formatCurrency(splitSum, effectiveAccountCurrency)} must equal total amount ${formatCurrency(parsedAmount, effectiveAccountCurrency)}`);
        }
      }

      // Sign: Expense is negative, Income is positive
      const signedAmount = txType === "Expense" ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);
      const effectiveCategoryId = splitEnabled
        ? Number(splitRows[0]?.categoryId) || Number(categoryId)
        : Number(categoryId);

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
      const transactionId = createdTx?.id;

      // If splits enabled, post splits
      if (splitEnabled && transactionId) {
        const sign = txType === "Expense" ? -1 : 1;
        const splitsPayload = {
          transactionId: Number(transactionId),
          splits: splitRows
            .filter((r) => parseFloat(r.amount) > 0)
            .map((r) => ({
              categoryId: r.categoryId ? Number(r.categoryId) : null,
              amount: sign * Math.abs(parseFloat(r.amount) || 0),
              note: r.note.trim() || undefined,
            })),
        };

        const splitRes = await fetch("/api/transactions/splits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(splitsPayload),
        });

        if (!splitRes.ok) {
          const splitErr = await splitRes.json().catch(() => ({}));
          console.warn("Splits write failed:", splitErr);
        }
      }

      // Rule step runs after the transaction is saved; a failure never undoes it.
      if (alsoCreateRule && ruleEligible) {
        let ruleFailure: string | null = null;
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
        if (ruleFailure) {
          // Saved already: show why and leave (a second Save would book the transaction twice).
          doneRef.current = true;
          setDone(true);
          mutate((k) => typeof k === "string" && k.startsWith("/api/transactions"));
          mutate("/api/accounts");
          setErrorMessage(ruleFailure);
          setTimeout(() => router.push("/transactions"), 2500);
          return;
        }
      }

      doneRef.current = true;
      setDone(true);
      setSuccessNotice(`${txType} saved successfully!`);
      mutate((k) => typeof k === "string" && k.startsWith("/api/transactions"));
      mutate("/api/accounts");
      setTimeout(() => router.push("/transactions"), 600);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      // Booked saves stay locked through `done`; the in-flight flag always clears.
      setSaving(false);
    }
  };

  // Layout budget (phone 390x844, sat = top safe area, sab = bottom safe area,
  // --mobile-bar-clearance = 96px + sab; tab bar = max(12px,sab) + 64px tall).
  // Mobile root is fixed: top = sat, bottom = sab (the tab bar is hidden on this
  // route), so its height is 844 - sat - sab. With sat = sab = 0 (test viewport)
  // that is 844px.
  // The fixed root bypasses the (app) shell's main padding (clearance + 80px)
  // and the py-3 wrapper, so the document never scrolls.
  //   header        h-11                 44
  //   segmented     pt-2 + h-9 + pb-2    52
  //   amount        py-1 + 16 + 2 + 40   66  (+16 when the FX line shows)
  //   field grid    2 x 52 + gap 8      112  (scroll region, flex-1 min-h-0)
  //   notes row     h-10 + gap 8         48
  //   advanced row  h-10 + gap 8         48
  //   footer        pt-2 + h-12 + pb-3   68  (Save, hidden while numpad is open)
  // Closed sum: 44+52+66+112+48+48+68 = 438 <= 844, so nothing scrolls.
  // Numpad (321px tall, bottom = sab) sits at the safe-area bottom; the tab bar
  // is hidden on this route. Its top is 321px above
  // the root bottom, so the field region reserves NUMPAD_HEIGHT_PX of bottom
  // padding while open and the focused field stays above the keys.
  const tileValue = (cls: string, text: string) => (
    <span className={`truncate text-sm font-semibold leading-5 ${cls}`}>{text}</span>
  );
  const dateTile = (
    <FieldTile
      icon={<Calendar className="h-3.5 w-3.5 text-primary" />}
      label="Date & Time"
      onClick={() => {
        setShowDatePicker(true);
        setShowNumpad(false);
        setFocusedField(null);
      }}
    >
      {tileValue("text-foreground", formatDateTimeDisplay(date, time))}
    </FieldTile>
  );
  const accountTile = (
    <FieldTile
      icon={<Wallet className="h-3.5 w-3.5 text-warning" />}
      label={txType === "Transfer" ? "From Account" : "Account"}
      onClick={() => {
        setShowAccSelector(true);
        setShowNumpad(false);
        setFocusedField(null);
      }}
    >
      {loadingAccounts
        ? tileValue("text-muted-foreground", "Loading accounts...")
        : tileValue(
            selectedAcc ? "text-foreground" : "text-muted-foreground",
            selectedAcc?.name || "Select Account",
          )}
    </FieldTile>
  );

  return (
    <div
      className={
        "flex flex-col bg-background text-foreground " +
        "max-md:fixed max-md:inset-x-0 max-md:top-[var(--sat)] max-md:bottom-[var(--sab,0px)] " +
        "md:relative md:mx-auto md:h-[min(46rem,calc(100dvh-8rem))] md:w-full md:max-w-md md:rounded-2xl md:border md:border-border/80"
      }
    >
      {/* Header (44px). The top safe area is reserved once, by the fixed root's top offset. */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center text-primary font-medium active:opacity-70 transition-opacity"
        >
          <ChevronLeft className="w-5 h-5 mr-0.5" />
          Cancel
        </button>
        <h1 className="text-base font-semibold text-foreground">New {txType}</h1>
        <div className="w-12 flex justify-end">
          {saving && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
        </div>
      </header>

      {/* Segmented control (36px track) */}
      <div className="shrink-0 px-4 pb-2 pt-2">
        <div className="flex h-9 rounded-xl border border-border/80 bg-card/90 p-1">
          {(["Expense", "Income", "Transfer"] as TxType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTxType(type);
                setErrorMessage(null);
              }}
              className={`flex-1 rounded-lg text-xs font-semibold transition-all ${
                txType === type
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Amount hero (about 64px) */}
      <div className="flex shrink-0 flex-col items-center justify-center px-4 py-1">
        <span className="mb-0.5 text-xs font-medium uppercase leading-4 tracking-wider text-muted-foreground">
          Amount
        </span>
        <button
          type="button"
          className="flex w-full items-center justify-center text-4xl font-bold leading-10 tracking-tight active:scale-[0.98] transition-transform"
          onClick={() => {
            setShowNumpad(true);
            setFocusedField(null);
          }}
        >
          <span className="text-muted-foreground mr-2 text-3xl">$</span>
          <span className={amount ? "text-foreground" : "text-muted-foreground"}>
            {amount || "0.00"}
          </span>
        </button>
        <FxPreviewLine preview={fxPreview} className="text-xs text-muted-foreground text-center" />
      </div>

      {/* Scroll region: the only part that scrolls. Reserves the numpad height while it is open. */}
      <main
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-2"
        style={showNumpad ? { paddingBottom: `${NUMPAD_HEIGHT_PX}px` } : undefined}
      >
        {/* Notice & error banners */}
        {(prefillNotice || errorMessage || urlInvestmentAccount || successNotice) && (
          <div className="shrink-0 space-y-2">
            {prefillNotice && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-xs animate-in fade-in">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                <span className="flex-1 leading-relaxed">{prefillNotice}</span>
              </div>
            )}
            {errorMessage && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-neg/10 border border-neg/30 text-neg text-xs animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-neg" />
                <span className="flex-1 leading-relaxed">{errorMessage}</span>
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

        {/* Field tiles, two columns. Expense/Income: Date & Time | Category, Account | Payee.
            Transfer: From | To, Date & Time | (received amount when cross-currency). */}
        <div className="grid shrink-0 grid-cols-2 gap-2">
          {txType === "Transfer" ? (
            <>
              {accountTile}
              <FieldTile
                icon={<ArrowRightLeft className="h-3.5 w-3.5 text-info" />}
                label="To Account"
                onClick={() => {
                  setShowToAccSelector(true);
                  setShowNumpad(false);
                  setFocusedField(null);
                }}
              >
                {loadingAccounts
                  ? tileValue("text-muted-foreground", "Loading accounts...")
                  : tileValue(
                      selectedToAcc ? "text-foreground" : "text-muted-foreground",
                      selectedToAcc?.name || "Select Destination Account",
                    )}
              </FieldTile>
              {dateTile}
              {transferCrossCcy && (
                <FieldTile icon={<Coins className="h-3.5 w-3.5 text-muted-foreground" />} label={`Received (${selectedToAcc?.currency})`}>
                  <input
                    id="transfer-received"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    aria-label={`Amount received (${selectedToAcc?.currency})`}
                    value={receivedAmount}
                    onChange={(e) => {
                      setReceivedTouched(true);
                      setReceivedAmount(e.target.value);
                    }}
                    placeholder={
                      transferFxPreview.state === "ok"
                        ? fxPreviewText(transferFxPreview.converted, selectedToAcc?.currency ?? displayCurrency)
                        : "0.00"
                    }
                    className="bg-transparent border-none outline-none text-foreground text-sm font-semibold leading-5 w-full min-w-0 placeholder:text-muted-foreground"
                  />
                </FieldTile>
              )}
            </>
          ) : (
            <>
              {dateTile}
              <FieldTile
                icon={<Tags className="h-3.5 w-3.5 text-pos" />}
                label="Category"
                onClick={() => {
                  setActiveSplitIndex(null);
                  setShowCatSelector(true);
                  setShowNumpad(false);
                  setFocusedField(null);
                }}
              >
                {loadingCategories
                  ? tileValue("text-muted-foreground", "Loading categories...")
                  : tileValue(
                      selectedCat ? "text-foreground" : "text-muted-foreground",
                      selectedCat?.name || "Select Category",
                    )}
              </FieldTile>
              {accountTile}
              <FieldTile icon={<User className="h-3.5 w-3.5 text-chart-5" />} label="Payee">
                <input
                  type="text"
                  aria-label="Payee"
                  placeholder="Payee / Merchant"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  onFocus={() => {
                    setShowNumpad(false);
                    setFocusedField("payee");
                  }}
                  className="bg-transparent border-none outline-none text-foreground text-sm font-semibold leading-5 w-full min-w-0 placeholder:text-muted-foreground placeholder:font-medium"
                />
              </FieldTile>
            </>
          )}
        </div>

        {/* Autocomplete and FX lines sit below the grid, full width */}
        {txType !== "Transfer" && (
          <AutocompletePills
            type="payee"
            currentValue={payee}
            onSelect={(val) => setPayee(val)}
            visible={focusedField === "payee"}
          />
        )}
        {transferCrossCcy && (
          <FxPreviewLine preview={transferFxPreview} className="text-xs text-muted-foreground" />
        )}

        {/* Notes & tags: one collapsed row (40px); expands to Note and Tags */}
        <div className="shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-card/60">
          <button
            type="button"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((v) => !v)}
            className="flex h-10 w-full items-center justify-between px-3 text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2">
              <AlignLeft className="h-3.5 w-3.5" />
              <span>Notes & tags</span>
              {(note || tags) && <span className="w-2 h-2 rounded-full bg-primary" />}
            </span>
            {notesOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {notesOpen && (
            <div className="space-y-2 border-t border-border/80 p-3 animate-in fade-in duration-200">
              <div className="space-y-1.5">
                <AutocompletePills
                  type="note"
                  currentValue={note}
                  onSelect={(val) => setNote(val)}
                  visible={focusedField === "note"}
                />
                <div className="flex h-11 items-center gap-3 rounded-xl border border-border/80 bg-card/90 px-3 focus-within:border-ring transition-colors">
                  <AlignLeft className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Note / Description"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onFocus={() => {
                      setShowNumpad(false);
                      setFocusedField("note");
                    }}
                    className="bg-transparent border-none outline-none text-foreground text-sm font-medium w-full min-w-0 placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <AutocompletePills
                  type="tag"
                  currentValue={tags}
                  onSelect={(val) => setTags(val)}
                  visible={focusedField === "tags"}
                />
                <div className="flex h-11 items-center gap-3 rounded-xl border border-border/80 bg-card/90 px-3 focus-within:border-ring transition-colors">
                  <Tags className="w-4 h-4 text-chart-5 shrink-0" />
                  <input
                    type="text"
                    placeholder="Tags (comma-separated)"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    onFocus={() => {
                      setShowNumpad(false);
                      setFocusedField("tags");
                    }}
                    className="bg-transparent border-none outline-none text-foreground text-sm font-medium w-full min-w-0 placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advanced options: one collapsed row (40px). Currency, split and business live inside. */}
        <div className="shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-card/60">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex h-10 w-full items-center justify-between px-3 text-left text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2">
              <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Advanced Options</span>
              {(splitEnabled || isBusiness) && <span className="w-2 h-2 rounded-full bg-primary" />}
            </span>
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showAdvanced && (
            <div className="p-3 space-y-4 border-t border-border/80 animate-in fade-in duration-200">
              {/* Currency (Expense & Income); defaults to the account's currency */}
              {txType !== "Transfer" && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Coins className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium text-foreground">Currency</span>
                  </div>
                  <Select value={currency} onValueChange={(v) => setCurrencyChoice(v ?? "")}>
                    <SelectTrigger aria-label="Currency" size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Split Transaction Option (only for Expense/Income) */}
              {txType !== "Transfer" && (
                <SplitSection
                  enabled={splitEnabled}
                  onToggle={setSplitEnabled}
                  rows={splitRows}
                  onChangeRows={setSplitRows}
                  categories={filteredCategories}
                  totalAmount={parsedAmount}
                  currency={selectedAcc?.currency || displayCurrency}
                  onOpenCategorySelector={(idx) => {
                    setActiveSplitIndex(idx);
                    setShowCatSelector(true);
                  }}
                />
              )}

              {/* Business Expense Flag */}
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    Business Transaction
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Tag for business accounting and tax reporting
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBusiness}
                    onChange={(e) => setIsBusiness(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Rule suggestion (Expense/Income, payee + category set) */}
        {ruleEligible && (
          <label className="shrink-0 flex items-start gap-3 p-3 rounded-2xl border border-info/30 bg-info/10 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoCreateRule}
              onChange={(e) => setAlsoCreateRule(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">Also create a rule for next time</span>
              <span className="text-xs text-muted-foreground">
                Payee contains &ldquo;{payee.trim()}&rdquo; → {selectedCat?.name}
              </span>
            </span>
          </label>
        )}
      </main>

      {/* Save (48px), pinned below the scroll region. Hidden while the numpad is open. */}
      {!showNumpad && (
        <div className="shrink-0 px-4 pb-3 pt-2">
          <Button
            type="button"
            disabled={saving || done}
            onClick={handleSave}
            className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 active:bg-primary/80 text-primary-foreground rounded-2xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : done ? (
              "Saved"
            ) : (
              `Save ${txType}`
            )}
          </Button>
        </div>
      )}

      {/* Numpad: docks at the safe-area bottom (the tab bar is hidden on this route) */}
      {showNumpad && (
        <div className="fixed inset-x-0 z-40 bg-background animate-in slide-in-from-bottom duration-200 max-md:bottom-[var(--sab,0px)] md:bottom-4 md:left-1/2 md:right-auto md:w-[min(28rem,100vw)] md:-translate-x-1/2">
          <Numpad
            value={amount}
            onChange={setAmount}
            onConfirm={() => setShowNumpad(false)}
          />
        </div>
      )}

      {/* Bottom Sheets */}
      <CategorySelector
        open={showCatSelector}
        onOpenChange={setShowCatSelector}
        categories={filteredCategories}
        selectedCategoryId={
          activeSplitIndex !== null
            ? splitRows[activeSplitIndex]?.categoryId
            : categoryId
        }
        onSelect={handleCategorySelect}
      />

      <AccountSelector
        open={showAccSelector}
        onOpenChange={setShowAccSelector}
        accounts={activeAccounts}
        selectedAccountId={accountId}
        title={txType === "Transfer" ? "Select Source Account" : "Select Account"}
        onSelect={(id) => {
          setAccountId(id);
          setCurrencyChoice("");
        }}
      />

      <AccountSelector
        open={showToAccSelector}
        onOpenChange={setShowToAccSelector}
        accounts={activeAccounts.filter((a) => String(a.id) !== accountId)}
        selectedAccountId={toAccountId}
        title="Select Destination Account"
        onSelect={setToAccountId}
      />

      <DateTimePickerSheet
        open={showDatePicker}
        onOpenChange={setShowDatePicker}
        date={date}
        time={time}
        onConfirm={(d, t) => {
          setDate(d);
          setTime(t);
        }}
      />
    </div>
  );
}
