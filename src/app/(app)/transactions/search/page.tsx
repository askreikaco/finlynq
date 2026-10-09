"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { AmountInput } from "@/components/amount-input";
import { PageHeader } from "@/components/mobile";
import { todayISO, addDays } from "@/lib/utils/date";
import type { Account, Category } from "@/app/(app)/transactions/_types";

export default function TransactionSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Only same-app paths: never navigate to an absolute/protocol-relative URL.
  const rawReturn = searchParams.get("returnTo") ?? "";
  const returnTo =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//") && !rawReturn.includes("\\")
      ? rawReturn
      : "/transactions";
  const isAccountPage = returnTo.includes("/accounts/");

  // State for all filter fields
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [direction, setDirection] = useState(searchParams.get("direction") || "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [minAmount, setMinAmount] = useState(searchParams.get("minAmount") || "");
  const [maxAmount, setMaxAmount] = useState(searchParams.get("maxAmount") || "");
  const [accountId, setAccountId] = useState(searchParams.get("accountId") || "");
  const [categoryId, setCategoryId] = useState(searchParams.get("categoryId") || "");

  // Lookups
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch lookups on mount
  useEffect(() => {
    async function fetchLookups() {
      try {
        const [accRes, catRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/categories"),
        ]);
        if (accRes.ok) {
          const accData = await accRes.json();
          setAccounts(accData.data || []);
        }
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.data || []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchLookups();
  }, []);

  // Determine which date preset is active (computed, not state)
  const getActiveDatePreset = (): string => {
    const today = todayISO();
    const sevenDaysAgo = addDays(today, -7);
    const thirtyDaysAgo = addDays(today, -30);
    const sixtyDaysAgo = addDays(today, -60);

    if (!startDate) {
      return "all";
    } else if (startDate === sevenDaysAgo && !endDate) {
      return "7d";
    } else if (startDate === thirtyDaysAgo && !endDate) {
      return "30d";
    } else if (startDate === sixtyDaysAgo && !endDate) {
      return "60d";
    } else {
      return "custom";
    }
  };

  const datePreset = getActiveDatePreset();

  // Handle date preset changes
  const handleDatePresetChange = (preset: string) => {
    const today = todayISO();
    switch (preset) {
      case "7d":
        setStartDate(addDays(today, -7));
        setEndDate("");
        break;
      case "30d":
        setStartDate(addDays(today, -30));
        setEndDate("");
        break;
      case "60d":
        setStartDate(addDays(today, -60));
        setEndDate("");
        break;
      case "custom":
        // Keep existing dates or empty
        break;
      case "all":
        setStartDate("");
        setEndDate("");
        break;
    }
  };

  function handleSearch() {
    const params = new URLSearchParams();

    if (search) params.append("search", search);
    if (direction) params.append("direction", direction);
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    if (minAmount) params.append("minAmount", String(Math.abs(parseFloat(minAmount) || 0)));
    if (maxAmount) params.append("maxAmount", String(Math.abs(parseFloat(maxAmount) || 0)));
    if (accountId) params.append("accountId", accountId);
    if (categoryId) params.append("categoryId", categoryId);

    // Preserve any existing scoping params from returnTo
    const basePath = returnTo.split("?")[0];
    const baseParams = new URLSearchParams(returnTo.split("?")[1] || "");

    // Only keep accountId if it's from the base URL (scoping param)
    if (isAccountPage && baseParams.has("accountId")) {
      params.set("accountId", baseParams.get("accountId")!);
    }

    const finalPath = `${basePath}?${params.toString()}`;
    router.push(finalPath);
  }

  function handleReset() {
    setSearch("");
    setDirection("");
    handleDatePresetChange("all");
    setMinAmount("");
    setMaxAmount("");
    setCategoryId("");
    // Keep accountId if on account page
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background pb-[var(--mobile-bar-clearance)]">
      {/* Header */}
      <PageHeader
        title="Search & filter"
        backHref={returnTo}
        backLabel="Back"
      />

      {/* Form */}
      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Search input */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
            Search
          </label>
          <Input
            placeholder="Payee or note"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10"
          />
        </div>

        {/* Direction */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
            Direction
          </label>
          <div role="radiogroup" aria-label="Direction" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
            {([["", "All"], ["in", "Incoming"], ["out", "Outgoing"]] as const).map(([v, label]) => (
              <button
                key={v || "all"}
                type="button"
                role="radio"
                aria-checked={direction === v}
                onClick={() => setDirection(v)}
                className={`min-h-10 rounded-md text-sm font-medium transition-colors ${
                  direction === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Date presets */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
            Date
          </label>
          <div className="flex flex-wrap gap-2">
            {["all", "7d", "30d", "60d", "custom"].map((preset) => (
              <button
                key={preset}
                onClick={() => handleDatePresetChange(preset)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  datePreset === preset
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {preset === "all"
                  ? "All"
                  : preset === "7d"
                    ? "Last 7d"
                    : preset === "30d"
                      ? "Last 30d"
                      : preset === "60d"
                        ? "Last 60d"
                        : "Custom"}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date range */}
        {datePreset === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
                From
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
                To
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 text-sm"
              />
            </div>
          </div>
        )}

        {/* Amount range */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
            Amount
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <AmountInput
                placeholder="From"
                value={minAmount}
                onValueChange={setMinAmount}
                className="h-10 text-sm"
              />
            </div>
            <div>
              <AmountInput
                placeholder="To"
                value={maxAmount}
                onValueChange={setMaxAmount}
                className="h-10 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Account select (hidden when scoped to an account) */}
        {!isAccountPage && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
              Account
            </label>
            <Combobox
              value={accountId}
              onValueChange={(v) => setAccountId(v === "all" ? "" : v)}
              items={[
                { value: "all", label: "All accounts" },
                ...accounts.map((a): ComboboxItemShape => ({
                  value: String(a.id),
                  label: a.alias || a.name,
                })),
              ]}
              placeholder="All accounts"
              searchPlaceholder="Search accounts…"
              emptyMessage="No matches"
              size="sm"
              className="h-10 w-full text-sm"
            />
          </div>
        )}

        {/* Category select */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-normal text-muted-foreground mb-2 block">
            Category
          </label>
          <Combobox
            value={categoryId}
            onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}
            items={[
              { value: "all", label: "All categories" },
              ...categories.map((c): ComboboxItemShape => ({
                value: String(c.id),
                label: `${c.group} — ${c.name}`,
              })),
            ]}
            placeholder="All categories"
            searchPlaceholder="Search categories…"
            emptyMessage="No matches"
            size="sm"
            className="h-10 w-full text-sm"
          />
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 border-t border-border bg-background px-4 py-3 flex gap-2 pb-[var(--sab)]">
        <Button
          variant="ghost"
          className="flex-1 h-10"
          onClick={handleReset}
        >
          Reset
        </Button>
        <Button
          className="flex-1 h-10"
          onClick={handleSearch}
        >
          Search
        </Button>
      </div>
    </div>
  );
}
