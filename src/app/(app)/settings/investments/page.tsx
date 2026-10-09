"use client";

/**
 * /settings/investments — the consolidated Investments surface (3 tabs).
 *
 * Tab "Securities"   — the catalog: one row per security (Symbol / Description /
 *   Type / Currency), filterable by column header. "Add security" opens the
 *   full page /settings/investments/securities/new (a bare security with NO
 *   account until linked). Edit / Prices / link / cash are full pages too; this
 *   list only navigates to them, passing returnTo=/settings/investments?tab=…
 *   Delete is offered only for securities not held in any account (confirm dialog).
 * Tab "By security" — collapsible securities → the accounts that hold them, with
 *   "+ Account" (page: securities/[id]/link).
 * Tab "By account"  — the reverse: collapsible investment accounts → the
 *   securities they hold, with "+ Security" (page: accounts/[id]/link) and
 *   "+ Cash" (page: cash-sleeves/new).
 *
 * Unlinking a tx-free position uses DELETE /api/securities?positionId; bare
 * delete uses /api/securities/define. Ticker change and delete stay confirm
 * dialogs. Bespoke fetch/useState (NO SWR). → plan/architecture/securities.md
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSkeleton } from "@/components/page-skeleton";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { parseSaveError } from "@/lib/save-error";
import { formatCurrency } from "@/lib/currency";
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  DollarSign,
} from "lucide-react";
import {
  INVESTMENTS_HOME,
  advisoryFor,
  descriptionOf,
  noticeText,
  parseTab,
  symbolLabel,
  useInvestmentData,
  type Account,
  type InvestmentsTab,
  type Security,
} from "./_components/shared";
import { PageHeader } from "@/components/mobile";

type SortKey = "symbol" | "description" | "type" | "currency";
type SortDir = "asc" | "desc";
type FilterKey = "symbol" | "description" | "type" | "currency";

const EMPTY_FILTERS: Record<FilterKey, string> = {
  symbol: "",
  description: "",
  type: "",
  currency: "",
};

function InvestmentsSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { securities, accounts, loading, error, reload: load } = useInvestmentData();
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Which tab is showing. Routes return here with ?tab=… so the user lands back
  // where they left off.
  const [tab, setTab] = useState<InvestmentsTab>(() => parseTab(searchParams.get("tab")));

  // Tab 1 table controls.
  const [filters, setFilters] = useState<Record<FilterKey, string>>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "symbol", dir: "asc" });

  // Delete confirm (catalog cleanup, unused securities only).
  const [deleteTarget, setDeleteTarget] = useState<Security | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Ticker change (re-cluster) confirm — from the unpriceable-ticker advisory.
  const [tickerTarget, setTickerTarget] = useState<{ security: Security; toSymbol: string } | null>(null);
  const [tickerBusy, setTickerBusy] = useState(false);
  // Which security is mid-flight switching to manual pricing (advisory action).
  const [manualBusyId, setManualBusyId] = useState<number | null>(null);

  // Collapsible expand sets.
  const [expandedSecurities, setExpandedSecurities] = useState<Set<number>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());

  // A route that just saved sends ?notice=<code>; show it once.
  useEffect(() => {
    const text = noticeText(searchParams.get("notice"));
    if (text) showToast("success", text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on arrival
  }, []);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  // ---- Navigation to the full-page flows (returnTo = this list, same tab) ----
  const here = `${INVESTMENTS_HOME}?tab=${tab}`;
  function go(path: string) {
    const sep = path.includes("?") ? "&" : "?";
    router.push(`${path}${sep}returnTo=${encodeURIComponent(here)}`);
  }
  const openAdd = () => go(`${INVESTMENTS_HOME}/securities/new`);
  const openEdit = (s: Security) => go(`${INVESTMENTS_HOME}/securities/${s.id}/edit`);
  const openPrices = (s: Security) => go(`${INVESTMENTS_HOME}/securities/${s.id}/prices`);
  const openLinkAccount = (securityId: number) => go(`${INVESTMENTS_HOME}/securities/${securityId}/link`);
  const openLinkSecurity = (accountId: number) => go(`${INVESTMENTS_HOME}/accounts/${accountId}/link`);
  const openCash = (accountId: number) =>
    go(`${INVESTMENTS_HOME}/cash-sleeves/new?accountId=${accountId}`);

  // ---- Tab 1 rows ----
  const rows = useMemo(() => {
    if (!securities) return [];
    const mapped = securities.map((s) => ({
      s,
      symbol: symbolLabel(s),
      description: descriptionOf(s),
      type: s.assetType,
      currency: s.currency,
    }));
    const filtered = mapped.filter(
      (r) =>
        (!filters.symbol || r.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) &&
        (!filters.description ||
          r.description.toLowerCase().includes(filters.description.toLowerCase())) &&
        (!filters.type || r.type.toLowerCase().includes(filters.type.toLowerCase())) &&
        (!filters.currency ||
          r.currency.toLowerCase().includes(filters.currency.toLowerCase())),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      const av = String(a[sort.key] ?? "").toLowerCase();
      const bv = String(b[sort.key] ?? "").toLowerCase();
      return av.localeCompare(bv) * dir;
    });
    return filtered;
  }, [securities, filters, sort]);

  const hasActiveFilter = Object.values(filters).some((v) => v.trim() !== "");

  // ---- Tab 3 inversion: investment accounts → their securities ----
  const byAccount = useMemo(() => {
    const map = new Map<
      number,
      { account: Account; items: { security: Security; positionId: number; isCash: boolean }[] }
    >();
    for (const a of accounts) {
      if (a.isInvestment && !a.archived) map.set(a.id, { account: a, items: [] });
    }
    for (const s of securities ?? []) {
      for (const a of s.accounts) {
        let entry = map.get(a.accountId);
        if (!entry) {
          const acct = accounts.find((x) => x.id === a.accountId);
          if (!acct) continue;
          entry = { account: acct, items: [] };
          map.set(a.accountId, entry);
        }
        entry.items.push({ security: s, positionId: a.positionId, isCash: a.isCash });
      }
    }
    return Array.from(map.values()).sort((x, y) =>
      (x.account.name ?? "").localeCompare(y.account.name ?? "")
    );
  }, [securities, accounts]);

  // ---- Edit-adjacent confirms (kept as dialogs) ----

  // Ticker change (re-cluster) from the unpriceable-ticker advisory.
  async function confirmTickerChange() {
    if (!tickerTarget) return;
    setTickerBusy(true);
    try {
      const res = await fetch("/api/securities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tickerTarget.security.id, symbol: tickerTarget.toSymbol }),
      });
      if (!res.ok) {
        const msg = await parseSaveError(res, "Failed to change ticker");
        showToast("error", msg);
        return;
      }
      showToast("success", `Ticker changed to ${tickerTarget.toSymbol}`);
      setTickerTarget(null);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to change ticker");
    } finally {
      setTickerBusy(false);
    }
  }

  // Switch an unpriceable ticker to manual pricing. The other half of the
  // `unpriced` advisory's fix (the first being "correct the symbol" on the edit
  // page). Flipping price_source to 'manual' takes the security out of the
  // Yahoo/CoinGecko path entirely — values it off the user's own marks, entered
  // via the "Prices" button that appears on the row once the mode has changed.
  // NB: not named `use…` — that reads as a React Hook to rules-of-hooks.
  async function switchToManualPricing(s: Security) {
    setManualBusyId(s.id);
    try {
      const res = await fetch("/api/securities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, priceSource: "manual" }),
      });
      if (!res.ok) {
        showToast("error", await parseSaveError(res, "Failed to switch to manual pricing"));
        return;
      }
      showToast("success", `${symbolLabel(s)} now uses manual pricing — add a price with "Prices".`);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to switch to manual pricing");
    } finally {
      setManualBusyId(null);
    }
  }

  // ---- Delete (unused securities only) ----
  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/securities/define?id=${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await parseSaveError(res, "Failed to delete security");
        showToast("error", msg);
        return;
      }
      showToast("success", "Security deleted");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function unlinkPosition(positionId: number) {
    try {
      const res = await fetch(`/api/securities?positionId=${positionId}`, { method: "DELETE" });
      if (!res.ok) {
        const msg = await parseSaveError(res, "Failed to unlink");
        showToast("error", msg);
        return;
      }
      showToast("success", "Unlinked");
      await load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Unlink failed");
    }
  }

  function toggleSecurity(id: number) {
    setExpandedSecurities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAccount(id: number) {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---- Render ----
  if (loading && !securities) {
    return (
      <div className="max-w-5xl">
        <PageSkeleton variant="cards" rows={4} />
      </div>
    );
  }
  if (error && !securities) {
    return (
      <div className="max-w-5xl">
        <ErrorState title="Couldn't load investments" message={error} onRetry={load} />
      </div>
    );
  }

  const sortHeader = (k: SortKey, label: string) => {
    const active = sort.key === k;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    );
  };

  const filterInput = (col: FilterKey) => (
    <Input
      value={filters[col]}
      onChange={(e) => setFilters((p) => ({ ...p, [col]: e.target.value }))}
      placeholder="Filter…"
      className="h-7 text-xs"
      aria-label={`Filter by ${col}`}
    />
  );

  const allSecurities = securities ?? [];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="contents">
        <PageHeader
            title="Investments"
            titleClassName="text-2xl font-bold tracking-tight"
            subtitle="Your securities, and how they map to your accounts."
            subtitleClassName="text-sm text-muted-foreground mt-0.5"
          />
      </div>

      {toast && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            toast.type === "success"
              ? "border-pos/30 bg-pos/10 text-pos"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(parseTab(String(v)))} className="w-full">
        <TabsList>
          <TabsTrigger value="securities">Securities</TabsTrigger>
          <TabsTrigger value="by-security">By security</TabsTrigger>
          <TabsTrigger value="by-account">By account</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Securities catalog ─────────────────────────────────── */}
        <TabsContent value="securities" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Every security you hold or track appears once. Filter by any column.
            </p>
            <Button onClick={openAdd} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> Add security
            </Button>
          </div>

          {(() => {
            const flagged = allSecurities.filter((s) => advisoryFor(s));
            if (flagged.length === 0) return null;
            return (
              <Card className="border-warning/30 bg-warning/10">
                <CardContent className="space-y-2 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    {flagged.length === 1 ? "A ticker can't be priced" : "Some tickers can't be priced"}
                  </div>
                  <ul className="space-y-1 text-xs text-warning/90">
                    {flagged.map((s) => {
                      const a = advisoryFor(s)!;
                      return (
                        <li key={s.id} className="flex flex-wrap items-center gap-2">
                          <span>
                            <span className="font-mono font-semibold">{s.symbol}</span>
                            {a.suggestedSymbol && (
                              <>
                                {" → "}
                                <span className="font-mono font-semibold">{a.suggestedSymbol}</span>
                              </>
                            )}
                            {`: ${a.message}`}
                          </span>
                          {a.suggestedSymbol ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 shrink-0 border-warning/30 px-2 text-xs text-warning hover:bg-warning/10"
                              onClick={() => setTickerTarget({ security: s, toSymbol: a.suggestedSymbol! })}
                            >
                              Change to {a.suggestedSymbol}
                            </Button>
                          ) : (
                            // No replacement ticker to suggest (detected/unknown
                            // symbol) — offer the other fix: price it by hand.
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 shrink-0 border-warning/30 px-2 text-xs text-warning hover:bg-warning/10"
                                onClick={() => openEdit(s)}
                              >
                                Fix symbol
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={manualBusyId === s.id}
                                className="h-6 shrink-0 border-warning/30 px-2 text-xs text-warning hover:bg-warning/10"
                                onClick={() => switchToManualPricing(s)}
                              >
                                {manualBusyId === s.id && (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                )}
                                Use manual price
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-warning/80">
                    Until this is resolved these holdings have no market price, so they don&apos;t
                    contribute to your portfolio value.
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {allSecurities.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No securities yet"
              description="Add a security (a ticker, cash, or crypto), then link it to your accounts under “By security” or “By account”."
              action={{ label: "Add security", onClick: openAdd }}
            />
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{sortHeader("symbol", "Symbol")}</TableHead>
                    <TableHead>{sortHeader("description", "Description")}</TableHead>
                    <TableHead>{sortHeader("type", "Type")}</TableHead>
                    <TableHead>{sortHeader("currency", "Currency")}</TableHead>
                    <TableHead>Pricing</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                  <TableRow>
                    <TableHead className="py-1">{filterInput("symbol")}</TableHead>
                    <TableHead className="py-1">{filterInput("description")}</TableHead>
                    <TableHead className="py-1">{filterInput("type")}</TableHead>
                    <TableHead className="py-1">{filterInput("currency")}</TableHead>
                    <TableHead className="py-1" />
                    <TableHead className="py-1" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                        {hasActiveFilter ? "No securities match the current filters." : "No securities."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.s.id}>
                        <TableCell className="text-sm font-mono font-medium">
                          {r.symbol}
                          {r.s.isCash && (
                            <Badge variant="outline" className="ml-1.5 text-xs">
                              cash
                            </Badge>
                          )}
                          {advisoryFor(r.s) && (
                            <span
                              className="ml-1.5 inline-flex align-text-bottom"
                              title={advisoryFor(r.s)!.message}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.description || <span className="text-muted-foreground">--</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {r.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {r.currency}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.s.priceSource === "manual" ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge
                                variant="secondary"
                                className="w-fit text-xs border-warning/30 bg-warning/10 text-warning"
                              >
                                Manual
                              </Badge>
                              {r.s.latestPrice ? (
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {formatCurrency(r.s.latestPrice.price, r.s.currency)} · {r.s.latestPrice.date}
                                </span>
                              ) : (
                                <span className="text-xs text-warning">
                                  No price yet
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Auto
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            {r.s.priceSource === "manual" && (
                              <Button variant="ghost" size="sm" onClick={() => openPrices(r.s)}>
                                <DollarSign className="h-3.5 w-3.5 mr-1" /> Prices
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openEdit(r.s)}>
                              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                            </Button>
                            {r.s.accounts.length === 0 && (
                              <Button aria-label="Delete this unused security"
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteTarget(r.s)}
                                title="Delete this unused security"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {allSecurities.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {rows.length} of {allSecurities.length} securities
              {hasActiveFilter ? " (filtered)" : ""}.
            </p>
          )}
        </TabsContent>

        {/* ── Tab 2: By security → accounts ─────────────────────────────── */}
        <TabsContent value="by-security" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Expand a security to see (and change) which accounts hold it.
          </p>
          {allSecurities.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No securities yet"
              description="Add a security on the Securities tab first."
            />
          ) : (
            <div className="rounded-md border divide-y">
              {allSecurities.map((s) => {
                const open = expandedSecurities.has(s.id);
                return (
                  <div key={s.id}>
                    <button
                      type="button"
                      onClick={() => toggleSecurity(s.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="font-mono text-sm font-medium">{symbolLabel(s)}</span>
                        {descriptionOf(s) && (
                          <span className="truncate text-xs text-muted-foreground">{descriptionOf(s)}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {s.accounts.length} {s.accounts.length === 1 ? "account" : "accounts"}
                      </Badge>
                    </button>
                    {open && (
                      <div className="px-3 pb-3 pl-9 space-y-1.5">
                        {s.accounts.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Not in any account yet.</p>
                        ) : (
                          s.accounts.map((a) => (
                            <div
                              key={a.positionId}
                              className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5"
                            >
                              <span className="text-sm">
                                {a.accountName ?? "(account)"}
                                {a.isCash && (
                                  <span className="ml-1.5 text-xs text-muted-foreground">cash sleeve</span>
                                )}
                              </span>
                              <Button aria-label="Unlink (transaction-free positions only)"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => unlinkPosition(a.positionId)}
                                title="Unlink (transaction-free positions only)"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ))
                        )}
                        <Button variant="outline" size="sm" onClick={() => openLinkAccount(s.id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Account
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Tab 3: By account → securities ────────────────────────────── */}
        <TabsContent value="by-account" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Expand an account to see (and change) which securities it holds.
          </p>
          {byAccount.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No investment accounts"
              description="Create an investment account first, then add securities to it here."
            />
          ) : (
            <div className="rounded-md border divide-y">
              {byAccount.map(({ account, items }) => {
                const open = expandedAccounts.has(account.id);
                return (
                  <div key={account.id}>
                    <button
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-sm font-medium truncate">{account.name}</span>
                        <Badge variant="outline" className="font-mono text-xs shrink-0">
                          {account.currency}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {items.length} {items.length === 1 ? "security" : "securities"}
                      </Badge>
                    </button>
                    {open && (
                      <div className="px-3 pb-3 pl-9 space-y-1.5">
                        {items.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No securities in this account yet.</p>
                        ) : (
                          items.map(({ security, positionId, isCash }) => (
                            <div
                              key={positionId}
                              className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5"
                            >
                              <span className="text-sm font-mono">
                                {symbolLabel(security)}
                                {isCash && (
                                  <span className="ml-1.5 font-sans text-xs text-muted-foreground">
                                    cash sleeve
                                  </span>
                                )}
                              </span>
                              <Button aria-label="Unlink (transaction-free positions only)"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => unlinkPosition(positionId)}
                                title="Unlink (transaction-free positions only)"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          ))
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => openLinkSecurity(account.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Security
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openCash(account.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Cash
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Delete confirm (unused securities only) ────────────────────── */}
      <ConfirmDialog
        open={deleteTarget != null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title="Delete security"
        description={
          deleteTarget
            ? `Remove ${symbolLabel(deleteTarget)} from your catalog? It isn't held in any account. This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={confirmDelete}
      />

      {/* ── Ticker change confirm (re-cluster) ─────────────────────────── */}
      <ConfirmDialog
        open={tickerTarget != null}
        onOpenChange={(o) => { if (!o) setTickerTarget(null); }}
        title="Change ticker"
        description={
          tickerTarget
            ? `Change ${symbolLabel(tickerTarget.security)} to ${tickerTarget.toSymbol}? This re-points the holding (and its full history) to the new ticker — prices will use ${tickerTarget.toSymbol} going forward. Positions, lots, and transactions are unchanged.`
            : ""
        }
        confirmLabel="Change ticker"
        busyLabel="Changing…"
        busy={tickerBusy}
        onConfirm={confirmTickerChange}
      />
    </div>
  );
}

export default function InvestmentsSettingsRoute() {
  return (
    <Suspense fallback={null}>
      <InvestmentsSettingsPage />
    </Suspense>
  );
}
