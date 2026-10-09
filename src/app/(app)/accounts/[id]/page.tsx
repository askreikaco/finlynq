"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/currency";
import {
  ArrowLeft,
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
import { TransactionsWorkspace } from "../../transactions/_components/transactions-workspace";
import { PageHeader, HEADER_DESKTOP_ONLY, CompactOnly, FromMd } from "@/components/mobile";
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
    fetch(`/api/transactions?accountId=${id}&limit=1`)
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

    fetch(`/api/transactions?accountId=${id}&limit=1`)
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

  if (!account && loadFailed) return (
    <div className="space-y-6">
      <Link href="/accounts" className="inline-flex pointer-coarse:min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Accounts
      </Link>
      <ErrorState
        title="Account not found"
        message="This account doesn't exist, or it isn't one of yours."
      />
    </div>
  );

  if (!account) return (
    <div className="space-y-6">
      <div className="h-4 w-32 animate-shimmer rounded" />
      <div className="h-8 w-64 animate-shimmer rounded-lg" />
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
    <div className="space-y-6">
      <Link href="/accounts" className="inline-flex pointer-coarse:min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Accounts
      </Link>

      {/* actionsClassName has no w-full: on phones the actions sit in PageHeader's glass capsule, and a
          100%-width capsule ran off the right edge. */}
      <PageHeader
        className="flex flex-wrap items-center justify-between gap-3"
        title={account.name}
        titleClassName="text-2xl font-bold tracking-tight"
        actionsClassName="flex min-w-0 flex-wrap items-center gap-1.5 regular:w-auto"
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
              {account.invisible === true && (
                <Badge
                  variant="secondary"
                  className="text-xs"
                  title="Hidden from net worth, totals, reports and metrics"
                >
                  Invisible
                </Badge>
              )}
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
              <Receipt className="h-3.5 w-3.5 mr-1.5" /> <FromMd as="span">New transaction</FromMd><CompactOnly as="span">Add</CompactOnly>
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
                  {isInvestment ? "Portfolio operations" : "Brokerage cash move"}
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

      {/* Balance Display */}
      <Card className="border-0 bg-gradient-to-br from-muted/50 to-muted/20">
        <CardContent className="pt-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {holdingsValue && holdingsValue > 0 ? "Market value" : "Balance"}
            </p>
            <p className={`text-3xl font-bold tracking-tight mt-2 ${displayBalance >= 0 ? "text-pos" : "text-destructive"}`}>
              {formatCurrency(displayBalance, account.currency)}
            </p>
            {holdingsValue && holdingsValue > 0 && cashFlowBasis !== null ? (
              <p className="text-xs text-muted-foreground mt-3">
                Cash flow:{" "}
                <span className="font-medium text-foreground">
                  {formatCurrency(cashFlowBasis, account.currency)}
                </span>
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Actions Card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between gap-2">
            {/* In */}
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

            {/* Out */}
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

            {/* Transfer */}
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

            {/* More: one control at every size, opens the Actions bottom sheet (owner D8). */}
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

      {/* Information Card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Information</h3>
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
          </div>

          <div className="space-y-0 divide-y">
            {/* Alias / Account Number */}
            <div className="flex items-center justify-between py-3">
              <p className="text-xs font-medium text-muted-foreground">Account number</p>
              <p className="text-sm text-right">{account.alias || "—"}</p>
            </div>

            {/* Group */}
            <div className="flex items-center justify-between py-3">
              <p className="text-xs font-medium text-muted-foreground">Group</p>
              <p className="text-sm text-right">{account.group || "—"}</p>
            </div>

            {/* Type */}
            <div className="flex items-center justify-between py-3">
              <p className="text-xs font-medium text-muted-foreground">Type</p>
              <div className="flex gap-1">
                {account.type === "A" ? (
                  <Badge variant="default" className="text-xs">Asset</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">Liability</Badge>
                )}
                {isInvestment && (
                  <Badge variant="secondary" className="text-xs">Investment</Badge>
                )}
              </div>
            </div>

            {/* Currency */}
            <div className="flex items-center justify-between py-3">
              <p className="text-xs font-medium text-muted-foreground">Currency</p>
              <p className="text-sm font-mono text-right">{account.currency}</p>
            </div>

            {/* Import Mode */}
            {account.mode && (
              <div className="flex items-center justify-between py-3">
                <p className="text-xs font-medium text-muted-foreground">Import mode</p>
                <p className="text-sm text-right capitalize">{account.mode}</p>
              </div>
            )}

            {/* Note */}
            {account.note && (
              <div className="flex items-start justify-between py-3 gap-2">
                <p className="text-xs font-medium text-muted-foreground">Note</p>
                <p className="text-sm text-right text-muted-foreground">{account.note}</p>
              </div>
            )}

            {/* Invisible Toggle */}
            <div className="flex items-center justify-between py-3">
              <div className="flex-1">
                <p className="text-xs font-medium text-muted-foreground">Invisible</p>
                <p className="text-xs text-muted-foreground mt-1">Hidden from net worth, totals, reports and metrics</p>
              </div>
              <Switch
                checked={invisible}
                onCheckedChange={handleInvisibleToggle}
                disabled={savingInvisible}
                role="switch"
              />
            </div>

            {/* Archived Status */}
            {account.archived === true && (
              <div className="flex items-center justify-between py-3">
                <p className="text-xs font-medium text-muted-foreground">Status</p>
                <Badge variant="secondary" className="text-xs">Archived</Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Balance Over Time — accurate daily series (cash live from
          transactions, investments from stored snapshots).
          plan/net-worth-over-time.md Part A. */}
      <NetWorthHistoryChart
        accountId={account.id}
        title="Balance Over Time"
        accountCurrency={account.currency}
      />

      {/* Reconciliation mode, Import preferences and Cash sleeves live on the
          Edit account page (its tabs). Reached via the Edit button, or the
          #reconciliation-mode / #import-prefs deep-links (see the hash effect). */}

      {/* Transactions — the FULL transactions surface (multi-select bulk
          update/delete, filters, per-column customize, sort, CSV export)
          reused verbatim from the /transactions page (DRY), scoped to this
          account. `lockedAccountId` forces + hides the account filter and
          disables URL sync; the other filter options stay available.
          `onDataChange` keeps the header tiles (balance + tx count) in sync
          after a bulk/inline edit. Wrapped in Suspense for its useSearchParams. */}
      <Suspense fallback={<div className="h-40 animate-shimmer rounded-xl" />}>
        <TransactionsWorkspace
          lockedAccountId={account.id}
          showHeader={false}
          onDataChange={refreshBalanceAndTxns}
        />
      </Suspense>

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
