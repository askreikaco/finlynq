"use client";

import { Fragment, Suspense, useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InvisibleMark } from "@/components/invisible-mark";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/currency";
import {
  Wallet,
  Pencil,
  Trash2,
  Inbox,
  Receipt,
  TrendingUp,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  MoreHorizontal,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxItemShape } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { useActiveCurrencies } from "@/lib/hooks/useActiveCurrencies";
import type { Mode } from "@/components/inbox/modes";
import { NetWorthHistoryChart } from "@/components/net-worth-history-chart";
import { MetricCard } from "@/components/metric-card";
import { deriveBalanceMonthly, type BalanceMonthly } from "@/lib/accounts/balance-series";
import { TransactionsWorkspace } from "../../transactions/_components/transactions-workspace";
import {
  PageHeader, HEADER_DESKTOP_ONLY, CustomizeCardsSheet, ListRow, SectionCard, useCardLayout, usePageCustomize,
} from "@/components/mobile";
import type { PageCard } from "@/lib/card-layout";
import { usePageFab } from "@/components/mobile/page-fab";

type Account = {
  id: number;
  type: string;
  group: string;
  name: string;
  currency: string;
  alias?: string | null;
  note?: string | null;
  archived?: boolean;
  isInvestment?: boolean;
  /** Hidden from every metric/total (net worth, reports…). */
  invisible?: boolean;
  mode?: Mode;
  /** Statement-upload field-mapping prefs (2026-06-04). */
  csvMappingMode?: "confirm" | "auto";
  ofxPayeeSource?: "name" | "memo";
};

type AccountBalance = {
  accountId: number;
  balance: number;
  cashFlowBasis?: number;
  holdingsValue?: number;
  holdingsCostBasis?: number;
};

/** All 8 portfolio ops for the investment-account quick-actions menu. The op
 *  keys match the `/portfolio/new?op=<key>` route (hyphenated, NOT underscore). */
const INVESTMENT_OPS: { op: string; label: string }[] = [
  { op: "buy", label: "Buy" },
  { op: "sell", label: "Sell" },
  { op: "swap", label: "Swap" },
  { op: "transfer", label: "In-kind transfer" },
  { op: "deposit", label: "Deposit" },
  { op: "withdrawal", label: "Withdrawal" },
  { op: "income-expense", label: "Income / expense" },
  { op: "fx-conversion", label: "FX conversion" },
];

/** Cards of the account detail page, default order (Customize). The page header and the dialogs are not cards. */
const ACCOUNT_DETAIL_CARDS: readonly PageCard[] = [
  { id: "balance", title: "Balance" },
  { id: "actions", title: "Quick actions" },
  { id: "information", title: "Information" },
  { id: "history", title: "Balance over time" },
  { id: "transactions", title: "Transactions" },
];

export default function AccountDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { displayCurrency } = useDisplayCurrency();
  const [account, setAccount] = useState<Account | null>(null);
  const [, setAccounts] = useState<Account[]>([]);
  /** The account lookup finished and produced nothing (missing id, not yours,
   *  or the request failed) — as opposed to "still in flight". */
  const [loadFailed, setLoadFailed] = useState(false);
  // The list of transactions is rendered by the embedded <TransactionsWorkspace>
  // below (its own SWR fetch); we fetch the transaction count but don't display it anymore.
  const [balance, setBalance] = useState<number | null>(null);
  const [cashFlowBasis, setCashFlowBasis] = useState<number | null>(null);
  const [holdingsValue, setHoldingsValue] = useState<number | null>(null);
  // Monthly balance history for the Balance card's chart + "vs last month" (native currency of the account).
  const [balanceMonthly, setBalanceMonthly] = useState<BalanceMonthly | null>(null);

  // Actions sheet (mobile) / dropdown (desktop)
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);

  // Delete / archive from the More menu. Delete goes through the shared
  // ConfirmDialog and DELETE /api/accounts?id=; a 409 (records still linked)
  // is shown instead of failing silently.
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountActionError, setAccountActionError] = useState<string | null>(null);

  // Invisible toggle state
  const [invisible, setInvisible] = useState(account?.invisible === true);
  const [savingInvisible, setSavingInvisible] = useState(false);

  const [newSleeveOpen, setNewSleeveOpen] = useState(false);
  const [newSleeveCurrency, setNewSleeveCurrency] = useState<string>("");
  const [newSleeveSaving, setNewSleeveSaving] = useState(false);
  const [newSleeveError, setNewSleeveError] = useState("");
  const sleeveCurrencyOptions = useActiveCurrencies(newSleeveCurrency);

  function openNewSleeve() {
    setNewSleeveCurrency(account?.currency ?? displayCurrency);
    setNewSleeveError("");
    setNewSleeveOpen(true);
  }

  async function handleCreateSleeve(e: React.FormEvent) {
    e.preventDefault();
    setNewSleeveSaving(true);
    setNewSleeveError("");
    try {
      const res = await fetch("/api/portfolio/holdings/cash-sleeve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: Number(id),
          currency: newSleeveCurrency,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setNewSleeveError(data.error ?? "Failed to create sleeve");
        return;
      }
      setNewSleeveOpen(false);
    } catch {
      setNewSleeveError("Failed to create sleeve");
    } finally {
      setNewSleeveSaving(false);
    }
  }

  // Re-fetch the computed balance + transaction count (the opening balance
  // feeds both). Mirrors the initial load effect. Passed as the workspace's
  // `onDataChange` so the header tiles stay in sync after a bulk/inline edit.
  function refreshBalanceAndTxns() {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        const b = d.balances?.find((x: AccountBalance) => x.accountId === Number(id));
        setBalance(b?.balance ?? 0);
        setCashFlowBasis(b?.cashFlowBasis ?? null);
        setHoldingsValue(b?.holdingsValue ?? null);
      })
      .catch(() => {});
    void (async () => {
      try {
        const r = await fetch(`/api/net-worth-history?period=1y&accountId=${id}&basis=native`);
        if (!r || !r.ok) return;
        const json = await r.json();
        if (Array.isArray(json?.series)) setBalanceMonthly(deriveBalanceMonthly(json.series));
      } catch {
        /* the card still shows the balance without a chart */
      }
    })();

    fetch(`/api/transactions?accountId=${id}&limit=1&scope=all`)
      .then((r) => r.json())
      .catch(() => {});
  }

  // Edit account is a full page now (Details / Reconciliation / Import / Cash sleeves tabs).
  function openEdit(tab: "details" | "reconciliation" | "import" = "details") {
    if (!account) return;
    router.push(`/accounts/${account.id}/edit?tab=${tab}`);
  }

  // Re-fetch this account fresh (decrypted name/alias) after a save — avoids
  // depending on the PUT response shape and keeps `accounts` in sync.
  // `includeArchived=1` is load-bearing here as well as on the initial load:
  // archiving from this page's own Edit dialog re-runs this, and without it the
  // account the user just archived would vanish from under them.
  function reloadAccount() {
    fetch("/api/accounts?includeArchived=1")
      .then((r) => r.json())
      .then((accts: Account[]) => {
        if (!Array.isArray(accts)) return;
        setAccounts(accts);
        const found = accts.find((a) => a.id === Number(id));
        if (found) setAccount(found);
      })
      .catch(() => {});
  }

  async function toggleArchived() {
    if (!account) return;
    setAccountActionError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, archived: !account.archived }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAccountActionError(body.error ?? "Couldn't update the account.");
        return;
      }
      reloadAccount();
    } catch {
      setAccountActionError("Couldn't update the account.");
    }
  }

  async function deleteThisAccount() {
    if (!account) return;
    setDeletingAccount(true);
    setAccountActionError(null);
    try {
      const res = await fetch(`/api/accounts?id=${account.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteAccountOpen(false);
        router.push("/accounts");
        return;
      }
      const body = await res.json().catch(() => ({}));
      setDeleteAccountOpen(false);
      setAccountActionError(body.error ?? "Couldn't delete the account.");
    } catch {
      setDeleteAccountOpen(false);
      setAccountActionError("Couldn't delete the account.");
    } finally {
      setDeletingAccount(false);
    }
  }

  async function handleInvisibleToggle(newValue: boolean) {
    if (!account) return;
    setInvisible(newValue);
    setSavingInvisible(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, invisible: newValue }),
      });
      if (!res.ok) {
        setInvisible(!newValue);
      } else {
        reloadAccount();
      }
    } catch {
      setInvisible(!newValue);
    } finally {
      setSavingInvisible(false);
    }
  }

  useEffect(() => {
    // `includeArchived=1`: GET /api/accounts hides archived accounts by default
    // (it is the lists/pickers source), but THIS page is the detail view — and
    // the only place the Unarchive button lives. Without the flag an archived
    // account was never found, `account` stayed null, and the render guard
    // below sat on its loading skeleton forever: the account became both
    // unviewable and permanently un-unarchivable from the web UI.
    setLoadFailed(false);
    fetch("/api/accounts?includeArchived=1")
      .then((r) => r.json())
      .then((accts: Account[]) => {
        setAccounts(Array.isArray(accts) ? accts : []);
        const found = Array.isArray(accts)
          ? accts.find((a: Account) => a.id === Number(id))
          : undefined;
        setAccount(found ?? null);
        // Distinguish "still loading" from "no such account". Both used to
        // render the same endless skeleton, so a bad/foreign id looked
        // identical to a slow network.
        if (!found) setLoadFailed(true);
      })
      .catch(() => setLoadFailed(true));

    // Fetch the computed balance from the dashboard API. For investment
    // accounts, balance = market value of holdings; cashFlowBasis is the
    // transaction sum surfaced separately.
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        const acctBalance = d.balances?.find((b: AccountBalance) => b.accountId === Number(id));
        setBalance(acctBalance?.balance ?? 0);
        setCashFlowBasis(acctBalance?.cashFlowBasis ?? null);
        setHoldingsValue(acctBalance?.holdingsValue ?? null);
      });

    fetch(`/api/transactions?accountId=${id}&limit=1&scope=all`)
      .then((r) => r.json())
      .catch(() => {});
  }, [id]);

  // Deep-link preservation (FINLYNQ-227): `/accounts/[id]#reconciliation-mode`
  // (from the /inbox lens-chip gear) and `#import-prefs` now open the Edit
  // dialog on the matching tab instead of scrolling to a (removed) card. Runs
  // once the account has loaded so openEdit has data to seed the form.
  useEffect(() => {
    if (!account) return;
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash === "#reconciliation-mode") openEdit("reconciliation");
    else if (hash === "#import-prefs") openEdit("import");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  // The Edit account page's "Add sleeve" lands here (?addSleeve=1): open the create-sleeve dialog.
  useEffect(() => {
    if (!account) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("addSleeve") === "1") openNewSleeve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  // Sync invisible state when account loads
  useEffect(() => {
    if (account) {
      setInvisible(account.invisible === true);
    }
  }, [account?.id]);

  // Mobile FAB: normal account adds a transaction; investment account buys.
  const fabIsInvestment = account?.isInvestment === true;
  const fabAdd = () => {
    if (!account) return;
    if (account.isInvestment === true) router.push(`/portfolio/new?op=buy&account=${account.id}`);
    else router.push(`/transactions/new?account=${account.id}`);
  };
  usePageFab("accounts.detail.add", fabAdd, fabIsInvestment ? { label: "Buy", icon: TrendingUp } : {});

  // Customize: the page's cards (hidden cards are not rendered). Registered once the account has loaded.
  const cardLayout = useCardLayout("account-detail", ACCOUNT_DETAIL_CARDS);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  usePageCustomize(account ? { onOpen: () => setCustomizeOpen(true) } : null);

  if (!account && loadFailed) return (
    <div className="w-full space-y-6">
      <PageHeader title="Account" backHref="/accounts" backLabel="Back to Accounts" />
      <ErrorState
        title="Account not found"
        message="This account doesn't exist, or it isn't one of yours."
      />
    </div>
  );

  if (!account) return (
    <div className="w-full space-y-6">
      <PageHeader title="Account" backHref="/accounts" backLabel="Back to accounts" />
      <div className="grid grid-cols-1 regular:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-shimmer rounded-xl" />)}
      </div>
    </div>
  );

  const displayBalance = balance ?? 0;
  const isInvestment = account.isInvestment === true;

  // Build a `/portfolio/new?op=<key>&account=<id>[&accountField=…]` href for an
  // op launched from THIS account. The accountField tells Deposit/Withdrawal
  // which of their two account sides this account fills.
  function opHref(op: string): string {
    const params = new URLSearchParams({ account: String(account!.id) });
    if (isInvestment) {
      // Investment account: it is the brokerage side. For Deposit that's the
      // DEST; for everything else (incl. Withdrawal source) it's the default.
      if (op === "deposit") params.set("accountField", "dest");
    } else {
      // Normal account: it is the cash side. Deposit source is the default;
      // Withdrawal dest needs the override.
      if (op === "withdrawal") params.set("accountField", "dest");
    }
    const slug = op === "transfer" ? "in-kind-transfer" : op;
    return `/portfolio/new/${slug}?${params.toString()}`;
  }

  // Normal accounts can only deposit to / withdraw from a brokerage.
  const normalInvestmentOps = INVESTMENT_OPS.filter(
    (o) => o.op === "deposit" || o.op === "withdrawal",
  );

  return (
    <div className="w-full space-y-6">
      {/* The back control is PageHeader's automatic back (level 2 under /accounts). */}
      <PageHeader
        className="flex flex-wrap items-center justify-between gap-3"
        title={account.name}
        lead={
          <div className={`${HEADER_DESKTOP_ONLY} h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold ${account.type === "A" ? "bg-pos/10 text-pos" : "bg-destructive/10 text-destructive"}`}>
            {(account.name ?? "?").charAt(0)}
          </div>
        }
        belowTitle={
            <div className="flex max-w-full flex-wrap justify-center gap-2 mt-0.5 regular:justify-start">
              <Badge variant="outline" className="text-xs">{account.currency}</Badge>
              <Badge variant={account.type === "A" ? "default" : "destructive"} className="text-xs">
                {account.type === "A" ? "Asset" : "Liability"}
              </Badge>
              {isInvestment && (
                <Badge variant="secondary" className="text-xs">Investment</Badge>
              )}
              {account.archived === true && (
                <Badge variant="secondary" className="text-xs">Archived</Badge>
              )}
              {account.invisible === true && <InvisibleMark />}
            </div>
        }
        overflow={[
          ...(isInvestment ? INVESTMENT_OPS : normalInvestmentOps).map((o) => ({
            label: o.label,
            onSelect: () => router.push(opHref(o.op)),
          })),
          { label: "Edit", icon: Pencil, onSelect: () => openEdit("details") },
        ]}
        actions={
        <>
          {!isInvestment && (
            <Button size="sm" aria-label="New transaction" onClick={() => router.push(`/transactions/new?account=${account.id}`)}>
              <Receipt className="h-3.5 w-3.5 mr-1.5" /> Add<span className="max-regular:sr-only"> transaction</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className={HEADER_DESKTOP_ONLY}>
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" /> Investment transaction
                  <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {isInvestment ? "Investment operations" : "Brokerage cash move"}
                </DropdownMenuLabel>
                {(isInvestment ? INVESTMENT_OPS : normalInvestmentOps).map((o) => (
                  <DropdownMenuItem
                    key={o.op}
                    onClick={() => router.push(opHref(o.op))}
                  >
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className={HEADER_DESKTOP_ONLY} onClick={() => openEdit("details")}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
        </>
        }
      />

      {/* Reconciliation mode, Import preferences and Cash sleeves live on the
          Edit account page (its tabs). Reached via the Edit button, or the
          #reconciliation-mode / #import-prefs deep-links (see the hash effect). */}

      {accountActionError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {accountActionError}
        </p>
      )}
      <ConfirmDialog
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        title="Delete this account?"
        description="This can't be undone. An account that still has transactions or other linked records can't be deleted; archive it instead."
        confirmLabel="Delete account"
        onConfirm={() => void deleteThisAccount()}
        busy={deletingAccount}
      />

      {(() => {
        const shown = cardLayout.layout.order.filter((id) => !cardLayout.layout.hidden.includes(id));
        // Account cards in the user's saved order (Customize). Each id renders once.
        const nodes: Record<string, ReactNode> = {
          balance: (
      <MetricCard
        label={holdingsValue && holdingsValue > 0 ? "Market value" : "Balance"}
        icon={Wallet}
        tone={displayBalance >= 0 ? "emerald" : "rose"}
        value={displayBalance}
        currency={account.currency}
        valueClassName={displayBalance >= 0 ? "text-pos" : "text-destructive"}
        sparkData={balanceMonthly?.sparkData}
        sparkLabels={balanceMonthly?.sparkLabels}
        sparkColor={displayBalance >= 0 ? "#10b981" : "#f43f5e"}
        badgePct={balanceMonthly?.changePct ?? null}
        invertTone={account.type === "L"}
        sub={balanceMonthly?.changePct != null ? "vs last month" : ""}
        note={
          holdingsValue && holdingsValue > 0 && cashFlowBasis !== null ? (
            <>
              Cash flow:{" "}
              <span className="font-medium text-foreground">{formatCurrency(cashFlowBasis, account.currency)}</span>
            </>
          ) : undefined
        }
      />
),
          actions: (
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => router.push(`/transactions/new?kind=income&account=${account.id}`)}
              className="flex flex-col items-center justify-center gap-2 flex-1 p-3 rounded-lg hover:bg-muted transition-colors"
              title="Record income"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <ArrowDownLeft className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-center">In</span>
            </button>

            <button
              onClick={() => router.push(`/transactions/new?kind=expense&account=${account.id}`)}
              className="flex flex-col items-center justify-center gap-2 flex-1 p-3 rounded-lg hover:bg-muted transition-colors"
              title="Record expense"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-center">Out</span>
            </button>

            <button
              onClick={() => router.push(`/transactions/new?kind=transfer&account=${account.id}`)}
              className="flex flex-col items-center justify-center gap-2 flex-1 p-3 rounded-lg hover:bg-muted transition-colors"
              title="Transfer between accounts"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-center">Transfer</span>
            </button>

            <button
              onClick={() => setActionsSheetOpen(true)}
              className="flex flex-col items-center justify-center gap-2 flex-1 p-3 rounded-lg hover:bg-muted transition-colors"
              title="More actions"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-center">More</span>
            </button>
          </div>
        </CardContent>
      </Card>
),
          information: (
        <SectionCard
          data-slot="account-information"
          label="Information"
          padded={false}
          className="divide-y divide-border/50 px-3"
          action={
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:w-11 pointer-coarse:px-0"
          onClick={() => openEdit("details")}
          title="Edit account"
          aria-label="Edit account"
        >
          <Pencil className="h-4 w-4" />
        </Button>
          }
        >
            <ListRow title="Account number" value={account.alias || "—"} />
            <ListRow title="Group" value={account.group || "—"} />
            <ListRow
              title="Type"
              value={
                <span className="flex gap-1">
                  {account.type === "A" ? (
                    <Badge variant="default" className="text-xs">Asset</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">Liability</Badge>
                  )}
                  {isInvestment && <Badge variant="secondary" className="text-xs">Investment</Badge>}
                </span>
              }
            />
            <ListRow title="Currency" value={<span className="font-mono">{account.currency}</span>} />
            {account.mode && <ListRow title="Import mode" value={<span className="capitalize">{account.mode}</span>} />}
            {account.note && <ListRow title="Note" subtitle={undefined} value={<span className="whitespace-normal text-muted-foreground">{account.note}</span>} />}
            <ListRow
              title="Invisible"
              subtitle="Hidden from net worth, totals, reports and metrics"
              value={
                <Switch
                  checked={invisible}
                  onCheckedChange={handleInvisibleToggle}
                  disabled={savingInvisible}
                  role="switch"
                />
              }
            />
            {account.archived === true && <ListRow title="Status" value={<Badge variant="secondary" className="text-xs">Archived</Badge>} />}
        </SectionCard>
      ),
          history: (
            <NetWorthHistoryChart
        accountId={account.id}
        title="Balance Over Time"
        accountCurrency={account.currency}
      />
),
          transactions: (
            <Suspense fallback={<div className="h-40 animate-shimmer rounded-xl" />}>
        <TransactionsWorkspace
          lockedAccountId={account.id}
          showHeader={false}
          onDataChange={refreshBalanceAndTxns}
        />
      </Suspense>
),
        };
        return shown.map((id) => <Fragment key={id}>{nodes[id]}</Fragment>);
      })()}

      <CustomizeCardsSheet
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        title="Customize account"
        description="Show, hide and reorder the cards on this account."
        cards={ACCOUNT_DETAIL_CARDS}
        layout={cardLayout.layout}
        onSave={cardLayout.save}
        onReset={cardLayout.reset}
      />

      {/* Create cash sleeve dialog */}
      <Dialog open={newSleeveOpen} onOpenChange={setNewSleeveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add cash sleeve</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSleeve} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates a per-currency cash position inside <b>{account.name}</b>.
              Only one sleeve per currency is allowed.
            </p>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Combobox
                value={newSleeveCurrency}
                onValueChange={(v) => setNewSleeveCurrency(v || "")}
                items={sleeveCurrencyOptions.map(
                  (c): ComboboxItemShape => ({ value: c, label: c }),
                )}
                placeholder="Pick a currency"
                searchPlaceholder="Search…"
                emptyMessage="No matches"
                className="w-full"
              />
            </div>
            {newSleeveError && (
              <p className="text-sm text-destructive">{newSleeveError}</p>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setNewSleeveOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={newSleeveSaving || !newSleeveCurrency}
              >
                {newSleeveSaving ? "Creating…" : "Create sleeve"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Actions sheet: opened by More at every size (owner D8). */}
      <Sheet open={actionsSheetOpen} onOpenChange={setActionsSheetOpen}>
        <SheetContent side="bottom" className="px-0">
          <SheetHeader className="px-4 mb-4">
            <SheetTitle>Actions</SheetTitle>
          </SheetHeader>
          <div className="space-y-0">
            <button
              onClick={() => {
                openEdit("details");
                setActionsSheetOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
            >
              <Pencil className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Edit account</span>
            </button>
            <button
              onClick={() => {
                router.push(`/import?accountId=${account.id}`);
                setActionsSheetOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
            >
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">Import statement</span>
            </button>
            {account.mode && (
              <button
                onClick={() => {
                  openEdit("reconciliation");
                  setActionsSheetOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
              >
                <Inbox className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Import mode</span>
              </button>
            )}
            <button
              onClick={() => {
                router.push(`/reports?accountId=${account.id}`);
                setActionsSheetOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
            >
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">View in Reports</span>
            </button>
            {account.archived ? (
              <button
                onClick={() => {
                  setActionsSheetOpen(false);
                  void toggleArchived();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
              >
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Unarchive</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setActionsSheetOpen(false);
                  void toggleArchived();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
              >
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Archive</span>
              </button>
            )}
            <button
              onClick={() => {
                setActionsSheetOpen(false);
                setAccountActionError(null);
                setDeleteAccountOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-destructive/10 transition-colors text-left text-destructive"
            >
              <Trash2 className="h-5 w-5" />
              <span className="text-sm font-medium">Delete account</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  );
}
