"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { mutate as globalMutate } from "swr";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/currency";
import {
  ArrowLeft,
  Wallet,
  Pencil,
  Coins,
  Plus,
  Trash2,
  Inbox,
  FileCog,
  Receipt,
  TrendingUp,
  ChevronDown,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  MoreHorizontal,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccountDialog } from "../_components/account-dialog";
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
import { ModePicker } from "@/components/inbox/mode-picker";
import { ImportPrefsPicker } from "@/components/inbox/import-prefs-picker";
import { isMode, type Mode } from "@/components/inbox/modes";
import { NetWorthHistoryChart } from "@/components/net-worth-history-chart";
import {
  TransactionDialog,
  type DialogAccount,
  type DialogCategory,
  type DialogHolding,
} from "@/components/transactions/transaction-dialog";
import { TransactionsWorkspace } from "../../transactions/_components/transactions-workspace";
import { PageHeader, HEADER_DESKTOP_ONLY } from "@/components/mobile";

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

type CashSleeve = {
  id: number;
  currency: string;
  name: string | null;
  /** Total tx count referencing this sleeve — server-side from /api/portfolio's currentShares is a sum, not a count, so we derive client-side from a separate fetch. */
  txCount?: number;
};

type AccountBalance = {
  accountId: number;
  balance: number;
  cashFlowBasis?: number;
  holdingsValue?: number;
  holdingsCostBasis?: number;
};

/** Edit-dialog tab ids. `#reconciliation-mode` / `#import-prefs` deep-links
 *  map onto the reconciliation / import tabs (FINLYNQ-227). */
type EditTab = "details" | "reconciliation" | "import" | "sleeves";

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
  const [account, setAccount] = useState<Account | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  /** The account lookup finished and produced nothing (missing id, not yours,
   *  or the request failed) — as opposed to "still in flight". */
  const [loadFailed, setLoadFailed] = useState(false);
  // The list of transactions is rendered by the embedded <TransactionsWorkspace>
  // below (its own SWR fetch); we fetch the transaction count but don't display it anymore.
  const [balance, setBalance] = useState<number | null>(null);
  const [cashFlowBasis, setCashFlowBasis] = useState<number | null>(null);
  const [holdingsValue, setHoldingsValue] = useState<number | null>(null);

  // Edit dialog (Details / Reconciliation / Import / Cash sleeves tabs). The
  // form + save logic live in the shared <AccountDialog> (FINLYNQ-206 follow-up);
  // this page only owns open/tab + the extra-tab content.
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState<EditTab>("details");

  // Generic "New transaction" dialog (normal accounts only) — embeds the shared
  // TransactionDialog seeded with this account pre-selected (FINLYNQ-227).
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txDialogType, setTxDialogType] = useState<"income" | "expense" | "transfer" | null>(null);
  const [dialogCategories, setDialogCategories] = useState<DialogCategory[]>([]);
  const [dialogHoldings, setDialogHoldings] = useState<DialogHolding[]>([]);

  // Actions sheet (mobile) / dropdown (desktop)
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);

  // Invisible toggle state
  const [invisible, setInvisible] = useState(account?.invisible === true);
  const [savingInvisible, setSavingInvisible] = useState(false);

  // Cash sleeves panel — list + create + delete, surfaced inside the Edit
  // dialog (FINLYNQ-227). Cash sleeves are explicit `portfolio_holdings.is_cash`
  // rows, one per (account, currency); users provision them before recording
  // Buy/Sell/FX operations.
  const [sleeves, setSleeves] = useState<CashSleeve[]>([]);
  const [sleevesLoading, setSleevesLoading] = useState(false);
  const [newSleeveOpen, setNewSleeveOpen] = useState(false);
  const [newSleeveCurrency, setNewSleeveCurrency] = useState<string>("");
  const [newSleeveSaving, setNewSleeveSaving] = useState(false);
  const [newSleeveError, setNewSleeveError] = useState("");
  const sleeveCurrencyOptions = useActiveCurrencies(newSleeveCurrency);
  // Sleeve-delete confirm (shared ConfirmDialog, replaces window.confirm).
  const [deleteSleeveId, setDeleteSleeveId] = useState<number | null>(null);
  const [deletingSleeve, setDeletingSleeve] = useState(false);
  const [deleteSleeveError, setDeleteSleeveError] = useState("");

  // Group suggestions: the user's existing group names across all accounts.
  const existingGroups = useMemo(
    () =>
      Array.from(
        new Set(accounts.map((a) => (a.group || "").trim()).filter(Boolean)),
      ),
    [accounts],
  );

  async function refreshSleeves() {
    if (!id) return;
    setSleevesLoading(true);
    try {
      const res = await fetch("/api/portfolio");
      if (!res.ok) return;
      const all: Array<{
        id: number;
        accountId: number | null;
        currency: string;
        isCash: boolean;
        name: string | null;
      }> = await res.json();
      const mine = all.filter(
        (h) => h.accountId === Number(id) && h.isCash === true,
      );
      // Pull tx count per sleeve for the "Delete" gating.
      const withCounts = await Promise.all(
        mine.map(async (h) => {
          const r = await fetch(
            `/api/transactions?portfolioHoldingId=${h.id}&limit=1`,
          );
          const j = await r.json();
          return {
            id: h.id,
            currency: h.currency,
            name: h.name,
            txCount: Number(j.total ?? 0),
          };
        }),
      );
      setSleeves(withCounts);
    } finally {
      setSleevesLoading(false);
    }
  }

  useEffect(() => {
    void refreshSleeves();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function openNewSleeve() {
    setNewSleeveCurrency(account?.currency ?? "USD");
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
      await refreshSleeves();
    } catch {
      setNewSleeveError("Failed to create sleeve");
    } finally {
      setNewSleeveSaving(false);
    }
  }

  const sleeveToDelete = sleeves.find((s) => s.id === deleteSleeveId) ?? null;

  async function confirmDeleteSleeve() {
    if (deleteSleeveId == null) return;
    setDeletingSleeve(true);
    setDeleteSleeveError("");
    const res = await fetch(
      `/api/portfolio/holdings/cash-sleeve?id=${deleteSleeveId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteSleeveError(data.error ?? "Failed to delete sleeve");
      setDeletingSleeve(false);
      return;
    }
    setDeletingSleeve(false);
    setDeleteSleeveId(null);
    await refreshSleeves();
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

  function openEdit(tab: EditTab = "details") {
    if (!account) return;
    setEditTab(tab);
    setEditOpen(true);
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

  // Lazily fetch categories + holdings the first time the user opens the
  // generic transaction dialog (normal accounts only).
  function openTxDialog(type?: "income" | "expense") {
    setTxDialogType(type ?? null);
    setTxDialogOpen(true);
    if (dialogCategories.length === 0) {
      fetch("/api/categories")
        .then((r) => (r.ok ? r.json() : []))
        .then((c) => setDialogCategories(Array.isArray(c) ? c : []))
        .catch(() => {});
    }
    if (dialogHoldings.length === 0) {
      fetch("/api/portfolio")
        .then((r) => (r.ok ? r.json() : []))
        .then((h) => setDialogHoldings(Array.isArray(h) ? h : []))
        .catch(() => {});
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
  }, [account]);

  // Sync invisible state when account loads
  useEffect(() => {
    if (account) {
      setInvisible(account.invisible === true);
    }
  }, [account?.id]);

  if (!account && loadFailed) return (
    <div className="space-y-6">
      <Link href="/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
      <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      <div className="h-8 w-64 bg-muted animate-pulse rounded-lg" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
      </div>
    </div>
  );

  const displayBalance = balance ?? 0;
  const isInvestment = account.isInvestment === true;

  // Build a `/portfolio/new?op=<key>&account=<id>[&accountField=…]` href for an
  // op launched from THIS account. The accountField tells Deposit/Withdrawal
  // which of their two account sides this account fills.
  function opHref(op: string): string {
    const params = new URLSearchParams({ op, account: String(account!.id) });
    if (isInvestment) {
      // Investment account: it is the brokerage side. For Deposit that's the
      // DEST; for everything else (incl. Withdrawal source) it's the default.
      if (op === "deposit") params.set("accountField", "dest");
    } else {
      // Normal account: it is the cash side. Deposit source is the default;
      // Withdrawal dest needs the override.
      if (op === "withdrawal") params.set("accountField", "dest");
    }
    return `/portfolio/new?${params.toString()}`;
  }

  // Normal accounts can only deposit to / withdraw from a brokerage.
  const normalInvestmentOps = INVESTMENT_OPS.filter(
    (o) => o.op === "deposit" || o.op === "withdrawal",
  );

  const dialogAccount: DialogAccount = {
    id: account.id,
    name: account.name,
    currency: account.currency,
    type: account.type,
    isInvestment: account.isInvestment,
  };

  return (
    <div className="space-y-6">
      <Link href="/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Accounts
      </Link>

      <PageHeader
        className="flex flex-wrap items-center justify-between gap-3"
        title={account.name}
        titleClassName="text-2xl font-bold tracking-tight"
        actionsClassName="flex flex-wrap items-center gap-1.5 w-full sm:w-auto"
        lead={
          <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold ${account.type === "A" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {(account.name ?? "?").charAt(0)}
          </div>
        }
        belowTitle={
            <div className="flex flex-wrap gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px]">{account.currency}</Badge>
              <Badge variant={account.type === "A" ? "default" : "destructive"} className="text-[10px]">
                {account.type === "A" ? "Asset" : "Liability"}
              </Badge>
              {isInvestment && (
                <Badge variant="secondary" className="text-[10px]">Investment</Badge>
              )}
              {account.archived === true && (
                <Badge variant="secondary" className="text-[10px]">Archived</Badge>
              )}
              {account.invisible === true && (
                <Badge
                  variant="secondary"
                  className="text-[10px]"
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
            <Button size="sm" onClick={() => openTxDialog()}>
              <Receipt className="h-3.5 w-3.5 mr-1.5" /> <span className="max-md:hidden">New transaction</span><span className="md:hidden">Add</span>
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
            <p className={`text-3xl font-bold tracking-tight mt-2 ${displayBalance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
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
              onClick={(_e) => openTxDialog("income")}
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
              onClick={(_e) => openTxDialog("expense")}
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
              onClick={() => {
                setTxDialogType("transfer");
                setTxDialogOpen(true);
                fetch("/api/categories")
                  .then((r) => (r.ok ? r.json() : []))
                  .then((c) => setDialogCategories(Array.isArray(c) ? c : []))
                  .catch(() => {});
                fetch("/api/portfolio")
                  .then((r) => (r.ok ? r.json() : []))
                  .then((h) => setDialogHoldings(Array.isArray(h) ? h : []))
                  .catch(() => {});
              }}
              className="flex flex-col items-center justify-center gap-2 flex-1 p-3 rounded-lg hover:bg-muted transition-colors"
              title="Transfer between accounts"
            >
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-center">Transfer</span>
            </button>

            {/* More */}
            <div className="md:hidden">
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

            {/* Desktop More dropdown */}
            <div className="hidden md:block flex-1">
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <button className="flex flex-col items-center justify-center gap-2 w-full p-3 rounded-lg hover:bg-muted transition-colors">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-medium text-center">More</span>
                  </button>
                } />
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => openEdit("details")}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit account
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push(`/import?accountId=${account.id}`)}>
                      <Receipt className="h-4 w-4 mr-2" /> Import statement
                    </DropdownMenuItem>
                    {account.mode && (
                      <DropdownMenuItem onClick={() => openEdit("reconciliation")}>
                        <Inbox className="h-4 w-4 mr-2" /> Import mode
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => router.push(`/reports?accountId=${account.id}`)}>
                      <TrendingUp className="h-4 w-4 mr-2" /> View in Reports
                    </DropdownMenuItem>
                    {account.archived ? (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditOpen(true);
                          setEditTab("details");
                        }}
                      >
                        <Wallet className="h-4 w-4 mr-2" /> Unarchive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          setEditOpen(true);
                          setEditTab("details");
                        }}
                      >
                        <Wallet className="h-4 w-4 mr-2" /> Archive
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this account? This action cannot be undone.")) {
                          fetch(`/api/accounts/${account.id}`, { method: "DELETE" })
                            .then((r) => {
                              if (r.ok) router.push("/accounts");
                            })
                            .catch(() => {});
                        }
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete account
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">Information</h3>
            <Button
              size="sm"
              variant="ghost"
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
                  <Badge variant="default" className="text-[10px]">Asset</Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">Liability</Badge>
                )}
                {isInvestment && (
                  <Badge variant="secondary" className="text-[10px]">Investment</Badge>
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
                <Badge variant="secondary" className="text-[10px]">Archived</Badge>
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

      {/* Reconciliation mode, Import preferences, and Cash sleeves moved into
          the Edit dialog (FINLYNQ-227) — they declutter the main page and are
          reachable via the Edit button (or the #reconciliation-mode /
          #import-prefs deep-links, which open the dialog to the right tab). */}

      {/* Transactions — the FULL transactions surface (multi-select bulk
          update/delete, filters, per-column customize, sort, CSV export)
          reused verbatim from the /transactions page (DRY), scoped to this
          account. `lockedAccountId` forces + hides the account filter and
          disables URL sync; the other filter options stay available.
          `onDataChange` keeps the header tiles (balance + tx count) in sync
          after a bulk/inline edit. Wrapped in Suspense for its useSearchParams. */}
      <Suspense fallback={<div className="h-40 bg-muted animate-pulse rounded-xl" />}>
        <TransactionsWorkspace
          lockedAccountId={account.id}
          showHeader={false}
          onDataChange={refreshBalanceAndTxns}
        />
      </Suspense>

      {/* Generic transaction dialog — normal accounts only, seeded with THIS
          account pre-selected (FINLYNQ-227). For the Transfer action, we use
          transfer-create mode instead. */}
      <TransactionDialog
        open={txDialogOpen}
        onOpenChange={setTxDialogOpen}
        accounts={[dialogAccount]}
        categories={dialogCategories}
        holdings={dialogHoldings}
        initialState={
          txDialogType === "transfer" ? { kind: "transfer-create" } : {
            kind: "transaction-prefill",
            values: { accountId: String(account.id), currency: account.currency },
          }
        }
        onSaved={() => {
          setTxDialogOpen(false);
          // Refresh the header tiles (balance + count) and revalidate the
          // embedded workspace's SWR list so the new row shows immediately.
          refreshBalanceAndTxns();
          void globalMutate(
            (key) => typeof key === "string" && key.startsWith("/api/transactions"),
          );
        }}
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

      {/* Cash-sleeve delete confirmation (shared ConfirmDialog). */}
      <ConfirmDialog
        open={deleteSleeveId != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSleeveId(null);
            setDeleteSleeveError("");
          }
        }}
        title="Delete cash sleeve"
        description={
          <>
            Delete the {sleeveToDelete?.currency} cash sleeve? This is only
            allowed when no transactions reference it.
            {deleteSleeveError && (
              <span className="mt-2 block text-destructive">{deleteSleeveError}</span>
            )}
          </>
        }
        confirmLabel="Delete sleeve"
        busy={deletingSleeve}
        onConfirm={() => void confirmDeleteSleeve()}
      />

      {/* Mobile actions sheet */}
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
                  openEdit("details");
                  setActionsSheetOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
              >
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Unarchive</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  openEdit("details");
                  setActionsSheetOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
              >
                <Wallet className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium">Archive</span>
              </button>
            )}
            <button
              onClick={() => {
                if (confirm("Are you sure you want to delete this account? This action cannot be undone.")) {
                  fetch(`/api/accounts/${account.id}`, { method: "DELETE" })
                    .then((r) => {
                      if (r.ok) router.push("/accounts");
                    })
                    .catch(() => {});
                }
                setActionsSheetOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-destructive/10 transition-colors text-left text-destructive"
            >
              <Trash2 className="h-5 w-5" />
              <span className="text-sm font-medium">Delete account</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit account dialog — the shared <AccountDialog> (FINLYNQ-206
          follow-up). Identical form to the Create dialog; only the title and
          footer buttons differ. Reconciliation / Import / Cash sleeves are
          edit-only extra tabs (they act on this account's id). */}
      <AccountDialog
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        account={account}
        existingGroups={existingGroups}
        initialTab={editTab}
        onSaved={() => { reloadAccount(); refreshBalanceAndTxns(); }}
        onRemoved={() => router.push("/accounts")}
        extraTabs={[
          {
            value: "reconciliation",
            label: "Reconciliation",
            content: (
              <>
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-sky-600" />
                  <h3 className="text-sm font-medium">Reconciliation mode</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  How uploads to this account flow through the pipeline. The{" "}
                  <code className="px-1 mx-0.5 rounded bg-muted text-[10px]">/inbox</code>{" "}
                  chip is a per-render lens; this picker is the persisted policy.
                </p>
                <ModePicker
                  accountId={account.id}
                  initialMode={isMode(account.mode) ? account.mode : "manual"}
                  onSaved={(m) => setAccount({ ...account, mode: m })}
                />
              </>
            ),
          },
          {
            value: "import",
            label: "Import",
            content: (
              <>
                <div className="flex items-center gap-2">
                  <FileCog className="h-4 w-4 text-violet-600" />
                  <h3 className="text-sm font-medium">Import preferences</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Whether CSV / OFX / QFX uploads to this account show a
                  field-mapping preview before staging, and which OFX field
                  becomes the payee.
                </p>
                <ImportPrefsPicker
                  accountId={account.id}
                  initialCsvMappingMode={account.csvMappingMode === "auto" ? "auto" : "confirm"}
                  initialOfxPayeeSource={account.ofxPayeeSource === "memo" ? "memo" : "name"}
                  onSaved={(prefs) =>
                    setAccount({
                      ...account,
                      csvMappingMode: prefs.csvMappingMode,
                      ofxPayeeSource: prefs.ofxPayeeSource,
                    })
                  }
                />
              </>
            ),
          },
          {
            value: "sleeves",
            label: "Cash sleeves",
            content: (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-medium">Cash sleeves</h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Per-currency cash positions inside this account. Required
                      before recording buys, sells, or FX conversions in a new
                      currency.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openNewSleeve}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add sleeve
                  </Button>
                </div>
                {sleevesLoading && sleeves.length === 0 ? (
                  <div className="h-12 bg-muted animate-pulse rounded-md" />
                ) : sleeves.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No cash sleeves yet. Add one to start recording trades.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Currency</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs text-right">Transactions</TableHead>
                        <TableHead className="text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sleeves.map((s) => (
                        <TableRow key={s.id} className="hover:bg-muted/30">
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {s.currency}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{s.name ?? `Cash ${s.currency}`}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {s.txCount ?? 0}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={(s.txCount ?? 0) > 0}
                              title={
                                (s.txCount ?? 0) > 0
                                  ? "Sleeve has transactions — delete or reassign them first"
                                  : "Delete sleeve"
                              }
                              onClick={() => {
                                setDeleteSleeveError("");
                                setDeleteSleeveId(s.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
