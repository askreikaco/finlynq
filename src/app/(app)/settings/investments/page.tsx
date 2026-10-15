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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InfoTip } from "@/components/ui/info-tip";
import { Overlay } from "@/components/ui/overlay";
import { Notice } from "@/components/notice";
import { parseSaveError } from "@/lib/save-error";
import { formatCurrency } from "@/lib/currency";
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
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
import { ListRow, SectionCard } from "@/components/mobile";
import { SectionPage } from "@/components/templates";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";

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
  // Securities row tapped open in the detail sheet (Prices / Edit / Delete).
  const [detailId, setDetailId] = useState<number | null>(null);

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
  const allSecurities = securities ?? [];
  // One centred SectionPage column at every width; the shared PageHeader is the top bar in every state.
  const pageProps = {
    id: "settings-investments",
    title: "Investments",
    width: "report" as const,
    center: true,
  };
  if (loading && !securities) {
    return (
      <SectionPage {...pageProps}>
        <Notice variant="skeleton" skeleton="cards" rows={4} />
      </SectionPage>
    );
  }
  if (error && !securities) {
    return (
      <SectionPage {...pageProps}>
        <Notice variant="error" title="Couldn't load investments" retry={load}>{error}</Notice>
      </SectionPage>
    );
  }

  const sortPill = (k: SortKey, label: string) => {
    const active = sort.key === k;
    return (
      <Button
        key={k}
        type="button"
        onClick={() => toggleSort(k)}
        variant="outline" size="sm" shape="round" pressed={active} className="shrink-0"
      >
        {label}
        {active ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </Button>
    );
  };

  const filterInput = (col: FilterKey, label: string) => (
    <Field
      value={filters[col]}
      onChange={(e) => setFilters((p) => ({ ...p, [col]: e.target.value }))}
      placeholder={`${label}…`}
      aria-label={`Filter by ${col}`}
      compact
    />
  );

  const detailSecurity = allSecurities.find((s) => s.id === detailId) ?? null;
  const detailRow = detailSecurity
    ? { s: detailSecurity, symbol: symbolLabel(detailSecurity), description: descriptionOf(detailSecurity), type: detailSecurity.assetType, currency: detailSecurity.currency }
    : null;

  return (
    <SectionPage {...pageProps}>
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
        <div className="flex items-center gap-1">
          <TabsList>
            <TabsTrigger value="securities">Securities</TabsTrigger>
            <TabsTrigger value="by-security">By security</TabsTrigger>
            <TabsTrigger value="by-account">By account</TabsTrigger>
          </TabsList>
          <InfoTip
            label="About this tab"
            text={
              tab === "by-security"
                ? "Expand a security to see and change which accounts hold it."
                : tab === "by-account"
                  ? "Expand an account to see and change which securities it holds."
                  : "Every security you hold or track appears once. Filter by any column. Link securities to accounts under By security or By account."
            }
          />
        </div>

        {/* ── Tab 1: Securities catalog ─────────────────────────────────── */}
        <TabsContent value="securities" className="space-y-4">
          <div className="flex items-center justify-end gap-3">
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
                  <p className="text-xs text-warning/80" data-keep="warning">
                    No market price until resolved; these holdings are excluded from portfolio value.
                  </p>
                </CardContent>
              </Card>
            );
          })()}

          {allSecurities.length === 0 ? (
            <Notice
              variant="empty"
              icon={Briefcase}
              title="No securities yet"
              action={{ label: "Add security", onClick: openAdd }}
            >
              Add one, then link it to accounts.
            </Notice>
          ) : (
            <div className="space-y-3">
              <div role="group" aria-label="Sort securities" className="flex flex-wrap gap-2">
                {sortPill("symbol", "Symbol")}
                {sortPill("description", "Name")}
                {sortPill("type", "Type")}
                {sortPill("currency", "Currency")}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {filterInput("symbol", "Symbol")}
                {filterInput("description", "Name")}
                {filterInput("type", "Type")}
                {filterInput("currency", "Currency")}
              </div>
              <SectionCard list>
                {rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground" data-keep="empty">
                    {hasActiveFilter ? "No matches." : "No securities."}
                  </p>
                ) : (
                  rows.map((r) => {
                    const manual = r.s.priceSource === "manual";
                    return (
                      <ListRow
                        key={r.s.id}
                        title={
                          <>
                            <span className="font-mono">{r.symbol}</span>
                            {r.s.isCash && <Badge variant="outline" className="ml-1.5 text-xs">cash</Badge>}
                            {advisoryFor(r.s) && <AlertTriangle aria-label={advisoryFor(r.s)!.message} className="ml-1.5 inline size-3.5 align-text-bottom text-warning" />}
                          </>
                        }
                        subtitle={[r.description || "--", r.type, r.currency].join(" · ")}
                        value={<Badge variant="outline" className="text-xs">{manual ? "Manual" : "Auto"}</Badge>}
                        secondary={manual ? (r.s.latestPrice ? `${formatCurrency(r.s.latestPrice.price, r.s.currency)} · ${r.s.latestPrice.date}` : "No price yet") : undefined}
                        secondaryTone={manual && !r.s.latestPrice ? "neg" : "muted"}
                        onPress={() => setDetailId(r.s.id)}
                      />
                    );
                  })
                )}
              </SectionCard>
            </div>
          )}
          {allSecurities.length > 0 && (
            <p className="text-xs text-muted-foreground" data-keep="status">
              {rows.length} of {allSecurities.length} securities
              {hasActiveFilter ? " (filtered)" : ""}.
            </p>
          )}
        </TabsContent>

        {/* ── Tab 2: By security → accounts ─────────────────────────────── */}
        <TabsContent value="by-security" className="space-y-2">
          {allSecurities.length === 0 ? (
            <Notice
              variant="empty"
              icon={Briefcase}
              title="No securities yet"
            >
              Add one on the Securities tab.
            </Notice>
          ) : (
            <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] overflow-hidden rounded-xl border border-border/50 bg-card">
              {allSecurities.map((s) => {
                const open = expandedSecurities.has(s.id);
                return (
                  <div key={s.id}>
                    <ListRow
                      leading={open ? <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
                      title={<span className="font-mono">{symbolLabel(s)}</span>}
                      subtitle={descriptionOf(s) || undefined}
                      value={<Badge variant="outline" className="text-xs">{s.accounts.length} {s.accounts.length === 1 ? "account" : "accounts"}</Badge>}
                      chevron={false}
                      onPress={() => toggleSecurity(s.id)}
                    />
                    {open && (
                      <div className="pb-3 pl-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                        {s.accounts.length === 0 ? (
                          <p className="px-4 py-2 text-xs text-muted-foreground" data-keep="empty">Not in any account.</p>
                        ) : (
                          s.accounts.map((a) => (
                            <ListRow
                              key={a.positionId}
                              size="dense"
                              title={a.accountName ?? "(account)"}
                              subtitle={a.isCash ? "cash sleeve" : undefined}
                              trailing={
                                <Button aria-label="Unlink (transaction-free positions only)"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => unlinkPosition(a.positionId)}
                                  title="Unlink (transaction-free positions only)"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              }
                            />
                          ))
                        )}
                        <div className="px-4 pt-2">
                          <Button variant="outline" size="sm" onClick={() => openLinkAccount(s.id)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Account
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

        {/* ── Tab 3: By account → securities ────────────────────────────── */}
        <TabsContent value="by-account" className="space-y-2">
          {byAccount.length === 0 ? (
            <Notice
              variant="empty"
              icon={Briefcase}
              title="No investment accounts"
            >
              Create an investment account first.
            </Notice>
          ) : (
            <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] overflow-hidden rounded-xl border border-border/50 bg-card">
              {byAccount.map(({ account, items }) => {
                const open = expandedAccounts.has(account.id);
                return (
                  <div key={account.id}>
                    <ListRow
                      leading={open ? <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
                      title={account.name}
                      subtitle={account.currency}
                      value={<Badge variant="outline" className="text-xs">{items.length} {items.length === 1 ? "security" : "securities"}</Badge>}
                      chevron={false}
                      onPress={() => toggleAccount(account.id)}
                    />
                    {open && (
                      <div className="pb-3 pl-5 [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                        {items.length === 0 ? (
                          <p className="px-4 py-2 text-xs text-muted-foreground" data-keep="empty">No securities.</p>
                        ) : (
                          items.map(({ security, positionId, isCash }) => (
                            <ListRow
                              key={positionId}
                              size="dense"
                              title={<span className="font-mono">{symbolLabel(security)}</span>}
                              subtitle={isCash ? "cash sleeve" : undefined}
                              trailing={
                                <Button aria-label="Unlink (transaction-free positions only)"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => unlinkPosition(positionId)}
                                  title="Unlink (transaction-free positions only)"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              }
                            />
                          ))
                        )}
                        <div className="flex flex-wrap gap-2 px-4 pt-2">
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
      <Overlay
        variant="confirm"
        open={deleteTarget != null}
        onClose={() => { setDeleteTarget(null); }}
        title="Delete security"
        message={
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
      <Overlay
        variant="confirm"
        open={tickerTarget != null}
        onClose={() => { setTickerTarget(null); }}
        title="Change ticker"
        message={
          tickerTarget
            ? `Change ${symbolLabel(tickerTarget.security)} to ${tickerTarget.toSymbol}? This re-points the holding (and its full history) to the new ticker — prices will use ${tickerTarget.toSymbol} going forward. Positions, lots, and transactions are unchanged.`
            : ""
        }
        confirmLabel="Change ticker"
        busyLabel="Changing…"
        busy={tickerBusy}
        onConfirm={confirmTickerChange}
      />
      {detailRow && (
        <Overlay
          variant="detail"
          open
          onClose={() => setDetailId(null)}
          title={<span className="font-mono">{detailRow.symbol}</span>}
          subtitle={detailRow.description || undefined}
          items={[
            { label: "Type", value: detailRow.type },
            { label: "Currency", value: detailRow.currency },
            {
              label: "Pricing",
              value: detailRow.s.priceSource !== "manual"
                ? "Auto"
                : detailRow.s.latestPrice
                  ? `${formatCurrency(detailRow.s.latestPrice.price, detailRow.s.currency)} · ${detailRow.s.latestPrice.date}`
                  : "Manual, no price yet",
            },
            { label: "Held in", value: `${detailRow.s.accounts.length} ${detailRow.s.accounts.length === 1 ? "account" : "accounts"}` },
          ]}
        >
          {detailRow.s.priceSource === "manual" && (
            <Button variant="outline" onClick={() => { setDetailId(null); openPrices(detailRow.s); }}>
              <DollarSign className="h-4 w-4 mr-1.5" /> Prices
            </Button>
          )}
          <Button variant="outline" onClick={() => { setDetailId(null); openEdit(detailRow.s); }}>
            <Pencil className="h-4 w-4 mr-1.5" /> Edit
          </Button>
          {detailRow.s.accounts.length === 0 && (
            <Button
              variant="outline"
              className="text-destructive"
              aria-label="Delete this unused security"
              onClick={() => { setDetailId(null); setDeleteTarget(detailRow.s); }}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
            </Button>
          )}
        </Overlay>
      )}
    </SectionPage>
  );
}

export default function InvestmentsSettingsRoute() {
  return (
    <Suspense fallback={null}>
      <InvestmentsSettingsPage />
    </Suspense>
  );
}
