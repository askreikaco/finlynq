"use client";

import React, { useState, useMemo, useEffect } from "react";
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
} from "lucide-react";
import { useApi } from "@/lib/data/use-api";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Numpad } from "./_components/numpad";
import { CategorySelector, type Category } from "./_components/category-selector";
import { AccountSelector, type Account } from "./_components/account-selector";
import {
  DateTimePickerSheet,
  formatDateTimeDisplay,
} from "./_components/date-time-picker";
import { AutocompletePills } from "./_components/autocomplete-pills";
import { SplitSection, type SplitRow } from "./_components/split-section";
import { readAndClearPrefill } from "@/lib/transactions/prefill";

type TxType = "Expense" | "Income" | "Transfer";

export default function MobileTransactionPage() {
  const router = useRouter();

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
  const [isBusiness, setIsBusiness] = useState(false);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { id: "1", categoryId: "", amount: "", note: "" },
    { id: "2", categoryId: "", amount: "", note: "" },
  ]);

  // Read prefill from sessionStorage once on mount ([] deps)
  useEffect(() => {
    const prefill = readAndClearPrefill(Date.now());
    if (prefill) {
      setAmount(prefill.amount);
      setCategoryId(prefill.categoryId);
      setAccountId(prefill.accountId);
      setPayee(prefill.payee);
      setNote(prefill.note);
      setTags(prefill.tags);
      setIsBusiness(prefill.isBusiness);
      setTxType(prefill.txType);
    } else if (typeof window !== "undefined" && sessionStorage.getItem("finlynq:tx-prefill") === null && new URLSearchParams(window.location.search).has("prefill")) {
      // prefill=1 in URL but no valid data = show notice
      setPrefillNotice("Prefill data expired or invalid. Please fill the form manually.");
    }
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
  const activeAccounts = useMemo(() => {
    return rawAccounts.filter((a) => !a.archived);
  }, [rawAccounts]);

  // Auto-select initial account if available
  useEffect(() => {
    if (!accountId && activeAccounts.length > 0) {
      setAccountId(String(activeAccounts[0].id));
    }
  }, [activeAccounts, accountId]);

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

        const transferPayload = {
          fromAccountId: Number(accountId),
          toAccountId: Number(toAccountId),
          enteredAmount: Math.abs(parsedAmount),
          date,
          note: note.trim() || undefined,
          tags: tags.trim() || undefined,
        };

        const res = await fetch("/api/transactions/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transferPayload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error || `Transfer failed (${res.status})`);
        }

        setSuccessNotice("Transfer recorded successfully!");
        mutate("/api/transactions");
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
        if (Math.abs(splitSum - parsedAmount) > 0.05) {
          throw new Error(`Split sum ($${splitSum.toFixed(2)}) must equal total amount ($${parsedAmount.toFixed(2)})`);
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

      setSuccessNotice(`${txType} saved successfully!`);
      mutate("/api/transactions");
      mutate("/api/accounts");
      setTimeout(() => router.push("/transactions"), 600);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-white">
      {/* Top Nav Bar */}
      <header className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-20">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center text-indigo-400 font-medium active:opacity-70 transition-opacity"
        >
          <ChevronLeft className="w-5 h-5 mr-0.5" />
          Cancel
        </button>
        <h1 className="text-base font-semibold text-white">New {txType}</h1>
        <div className="w-12 flex justify-end">
          {saving && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
        </div>
      </header>

      {/* Segmented Control */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-1">
          {(["Expense", "Income", "Transfer"] as TxType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTxType(type);
                setErrorMessage(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                txType === type
                  ? "bg-zinc-800 text-white shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Notice & Error Banners */}
      <div className="px-4 pt-2 space-y-2">
        {prefillNotice && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-in fade-in">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span className="flex-1 leading-relaxed">{prefillNotice}</span>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="flex-1 leading-relaxed">{errorMessage}</span>
          </div>
        )}
        {successNotice && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span className="flex-1 leading-relaxed">{successNotice}</span>
          </div>
        )}
      </div>

      {/* Main Form Content */}
      <main className="flex-1 flex flex-col gap-4 px-4 py-2 overflow-y-auto pb-44">
        {/* Amount Hero */}
        <div className="flex flex-col items-center justify-center py-5">
          <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">
            Amount
          </span>
          <button
            type="button"
            className="text-5xl font-bold tracking-tight flex items-center justify-center w-full active:scale-[0.98] transition-transform"
            onClick={() => {
              setShowNumpad(true);
              setFocusedField(null);
            }}
          >
            <span className="text-zinc-500 mr-2 text-4xl">$</span>
            <span className={amount ? "text-white" : "text-zinc-600"}>
              {amount || "0.00"}
            </span>
          </button>
        </div>

        {/* Core Form Fields */}
        <div className="space-y-3">
          {/* Combined Date & Time Picker Row */}
          <button
            type="button"
            onClick={() => {
              setShowDatePicker(true);
              setShowNumpad(false);
              setFocusedField(null);
            }}
            className="w-full flex items-center justify-between bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-2xl active:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                <Calendar className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs text-zinc-400 font-medium">Date & Time</span>
                <span className="text-white text-sm font-semibold">
                  {formatDateTimeDisplay(date, time)}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          </button>

          {/* Category Selector (Expense & Income) */}
          {txType !== "Transfer" && (
            <button
              type="button"
              onClick={() => {
                setActiveSplitIndex(null);
                setShowCatSelector(true);
                setShowNumpad(false);
                setFocusedField(null);
              }}
              className="w-full flex items-center justify-between bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-2xl active:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                  <Tags className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-xs text-zinc-400 font-medium">Category</span>
                  <span
                    className={`text-sm font-semibold truncate ${
                      selectedCat ? "text-white" : "text-zinc-500"
                    }`}
                  >
                    {loadingCategories
                      ? "Loading categories..."
                      : selectedCat?.name || "Select Category"}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            </button>
          )}

          {/* Account Selector (Source / Main) */}
          <button
            type="button"
            onClick={() => {
              setShowAccSelector(true);
              setShowNumpad(false);
              setFocusedField(null);
            }}
            className="w-full flex items-center justify-between bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-2xl active:bg-zinc-800 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                <Wallet className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <span className="text-xs text-zinc-400 font-medium">
                  {txType === "Transfer" ? "From Account" : "Account"}
                </span>
                <span
                  className={`text-sm font-semibold truncate ${
                    selectedAcc ? "text-white" : "text-zinc-500"
                  }`}
                >
                  {loadingAccounts
                    ? "Loading accounts..."
                    : selectedAcc?.name || "Select Account"}
                </span>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
          </button>

          {/* Destination Account (Transfer Mode Only) */}
          {txType === "Transfer" && (
            <button
              type="button"
              onClick={() => {
                setShowToAccSelector(true);
                setShowNumpad(false);
                setFocusedField(null);
              }}
              className="w-full flex items-center justify-between bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-2xl active:bg-zinc-800 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                  <ArrowRightLeft className="w-4 h-4 text-sky-400" />
                </div>
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-xs text-zinc-400 font-medium">To Account</span>
                  <span
                    className={`text-sm font-semibold truncate ${
                      selectedToAcc ? "text-white" : "text-zinc-500"
                    }`}
                  >
                    {loadingAccounts
                      ? "Loading accounts..."
                      : selectedToAcc?.name || "Select Destination Account"}
                  </span>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            </button>
          )}

          {/* Payee Input (Expense & Income) with Auto-suggest */}
          {txType !== "Transfer" && (
            <div className="space-y-1.5">
              <AutocompletePills
                type="payee"
                currentValue={payee}
                onSelect={(val) => setPayee(val)}
                visible={focusedField === "payee"}
              />
              <div className="flex items-center bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-2xl focus-within:border-indigo-500 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 mr-3 shrink-0">
                  <User className="w-4 h-4 text-violet-400" />
                </div>
                <input
                  type="text"
                  placeholder="Payee / Merchant"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  onFocus={() => {
                    setShowNumpad(false);
                    setFocusedField("payee");
                  }}
                  className="bg-transparent border-none outline-none text-white text-sm font-medium w-full placeholder:text-zinc-500"
                />
              </div>
            </div>
          )}

          {/* Note Input with Auto-suggest */}
          <div className="space-y-1.5">
            <AutocompletePills
              type="note"
              currentValue={note}
              onSelect={(val) => setNote(val)}
              visible={focusedField === "note"}
            />
            <div className="flex items-center bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-2xl focus-within:border-indigo-500 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 mr-3 shrink-0">
                <AlignLeft className="w-4 h-4 text-zinc-400" />
              </div>
              <input
                type="text"
                placeholder="Note / Description"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onFocus={() => {
                  setShowNumpad(false);
                  setFocusedField("note");
                }}
                className="bg-transparent border-none outline-none text-white text-sm font-medium w-full placeholder:text-zinc-500"
              />
            </div>
          </div>

          {/* Tags Input with Auto-suggest */}
          <div className="space-y-1.5">
            <AutocompletePills
              type="tag"
              currentValue={tags}
              onSelect={(val) => setTags(val)}
              visible={focusedField === "tags"}
            />
            <div className="flex items-center bg-zinc-900/90 border border-zinc-800/80 p-3.5 rounded-2xl focus-within:border-indigo-500 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 mr-3 shrink-0">
                <Tags className="w-4 h-4 text-pink-400" />
              </div>
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                onFocus={() => {
                  setShowNumpad(false);
                  setFocusedField("tags");
                }}
                className="bg-transparent border-none outline-none text-white text-sm font-medium w-full placeholder:text-zinc-500"
              />
            </div>
          </div>

          {/* Collapsible Advanced Options Accordion */}
          <div className="border border-zinc-800/80 bg-zinc-900/60 rounded-2xl overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-zinc-400" />
                <span>Advanced Options</span>
                {(splitEnabled || isBusiness) && (
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-4 pt-1 space-y-4 border-t border-zinc-800/80 animate-in fade-in duration-200">
                {/* Split Transaction Option (only for Expense/Income) */}
                {txType !== "Transfer" && (
                  <SplitSection
                    enabled={splitEnabled}
                    onToggle={setSplitEnabled}
                    rows={splitRows}
                    onChangeRows={setSplitRows}
                    categories={filteredCategories}
                    totalAmount={parsedAmount}
                    onOpenCategorySelector={(idx) => {
                      setActiveSplitIndex(idx);
                      setShowCatSelector(true);
                    }}
                  />
                )}

                {/* Business Expense Flag */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-white">
                      Business Transaction
                    </span>
                    <span className="text-xs text-zinc-500">
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
                    <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Save Action Button */}
        {!showNumpad && (
          <div className="pt-2">
            <Button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="w-full h-12 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                `Save ${txType}`
              )}
            </Button>
          </div>
        )}
      </main>

      {/* Numpad Anchored Bottom */}
      {showNumpad && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 animate-in slide-in-from-bottom duration-200">
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
        onSelect={setAccountId}
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
