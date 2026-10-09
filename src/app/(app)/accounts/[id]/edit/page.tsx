"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Inbox, FileCog, Coins, Plus, Trash2, Wallet } from "lucide-react";
import { PageHeader, type OverflowAction } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModePicker } from "@/components/inbox/mode-picker";
import { ImportPrefsPicker } from "@/components/inbox/import-prefs-picker";
import { isMode, type Mode } from "@/components/inbox/modes";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { AccountForm, type AccountFormAccount } from "../../_components/account-form";

/** The account as /api/accounts returns it (the reconciliation / import tabs need the extra prefs). */
type EditAccount = AccountFormAccount & {
  mode?: Mode;
  csvMappingMode?: "confirm" | "auto";
  ofxPayeeSource?: "name" | "memo";
};

type CashSleeve = { id: number; currency: string; name: string | null; txCount: number };

/** Tab ids. `?tab=` picks the initial tab; anything else falls back to Details. */
const EDIT_TABS = ["details", "reconciliation", "import", "sleeves"] as const;
type EditTab = (typeof EDIT_TABS)[number];

function parseTab(raw: string | null | undefined): EditTab {
  return (EDIT_TABS as readonly string[]).includes(raw ?? "") ? (raw as EditTab) : "details";
}

function EditAccountPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const accountId = Number(params.id);
  // Back / Cancel / success go to returnTo (same-app path only), else the account's detail page.
  const returnTo = safeReturnTo(searchParams.get("returnTo"), "");
  const destination = returnTo || `/accounts/${accountId}`;

  const [tab, setTab] = useState<EditTab>(() => parseTab(searchParams.get("tab")));
  const [accounts, setAccounts] = useState<EditAccount[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [actionError, setActionError] = useState("");
  // Archive / delete (smart) and the sleeve delete confirm: shared ConfirmDialogs.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Cash sleeves tab: list + delete. Creating a sleeve still happens on the account page.
  const [sleeves, setSleeves] = useState<CashSleeve[]>([]);
  const [sleevesLoading, setSleevesLoading] = useState(false);
  const [deleteSleeveId, setDeleteSleeveId] = useState<number | null>(null);
  const [deletingSleeve, setDeletingSleeve] = useState(false);
  const [deleteSleeveError, setDeleteSleeveError] = useState("");

  // `includeArchived=1`: an archived account must still open here (it is the only place to unarchive it).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts?includeArchived=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setAccounts(Array.isArray(d) ? d : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const account = accounts.find((a) => a.id === accountId) ?? null;

  const existingGroups = useMemo(
    () => Array.from(new Set(accounts.map((a) => (a.group ?? "").trim()).filter(Boolean))),
    [accounts],
  );

  async function refreshSleeves() {
    if (!accountId) return;
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
      const mine = all.filter((h) => h.accountId === accountId && h.isCash === true);
      // Pull tx count per sleeve for the "Delete" gating.
      const withCounts = await Promise.all(
        mine.map(async (h) => {
          const r = await fetch(`/api/transactions?portfolioHoldingId=${h.id}&limit=1`);
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
  }, [accountId]);

  async function confirmDeleteSleeve() {
    if (deleteSleeveId == null) return;
    setDeletingSleeve(true);
    setDeleteSleeveError("");
    const res = await fetch(`/api/portfolio/holdings/cash-sleeve?id=${deleteSleeveId}`, {
      method: "DELETE",
    });
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

  const sleeveToDelete = sleeves.find((s) => s.id === deleteSleeveId) ?? null;

  // Same archive-or-delete rule as the old dialog: a referenced account is archived (409), an empty one deleted.
  async function handleArchiveOrDelete() {
    if (!account) return;
    setRemoving(true);
    setActionError("");
    try {
      const del = await fetch(`/api/accounts?id=${account.id}`, { method: "DELETE" });
      if (del.ok) {
        setRemoveOpen(false);
        router.push("/accounts");
        return;
      }
      if (del.status === 409) {
        const arch = await fetch("/api/accounts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: account.id, archived: true }),
        });
        if (!arch.ok) {
          const d = await arch.json().catch(() => ({}));
          setActionError(d.error ?? "Failed to archive account");
          return;
        }
        setRemoveOpen(false);
        router.push("/accounts");
        return;
      }
      const d = await del.json().catch(() => ({}));
      setActionError(d.error ?? "Failed to remove account");
    } catch {
      setActionError("Failed to remove account");
    } finally {
      setRemoving(false);
    }
  }

  async function handleUnarchive() {
    if (!account) return;
    setRemoving(true);
    setActionError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, archived: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error ?? "Failed to unarchive account");
        return;
      }
      router.push(destination);
    } catch {
      setActionError("Failed to unarchive account");
    } finally {
      setRemoving(false);
    }
  }

  const archived = account?.archived === true;
  const overflow: OverflowAction[] = account
    ? [
        ...(archived ? [{ label: "Unarchive", icon: Wallet, onSelect: () => void handleUnarchive() }] : []),
        {
          label: archived ? "Delete account" : "Archive or delete account",
          icon: Trash2,
          destructive: true,
          onSelect: () => {
            setActionError("");
            setRemoveOpen(true);
          },
        },
      ]
    : [];

  const header = (
    <PageHeader
      title="Edit account"
      backHref={destination}
      backLabel="Back"
      overflow={overflow.length > 0 ? overflow : undefined}
      className="flex items-center justify-between"
    />
  );

  if (!loaded) {
    return (
      <div data-testid="account-edit-root" className="mx-auto w-full max-w-xl">
        {header}
        <div className="mt-3 h-40 animate-shimmer rounded-2xl" />
      </div>
    );
  }

  if (!account) {
    return (
      <div data-testid="account-edit-root" className="mx-auto w-full max-w-xl">
        {header}
        <p className="mt-3 text-sm text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  return (
    <div data-testid="account-edit-root" className="mx-auto w-full max-w-xl">
      {header}
      <div className="mt-3 pb-[calc(var(--sab,0px)+1.5rem)]">
        <Tabs value={tab} onValueChange={(v) => setTab(parseTab(v))}>
          <TabsList className="w-full">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="sleeves">Cash sleeves</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="pt-4">
            <AccountForm
              mode="edit"
              account={account}
              existingGroups={existingGroups}
              variant="rows"
              busy={removing}
              onCancel={() => router.push(destination)}
              onComplete={() => router.push(destination)}
            />
          </TabsContent>

          <TabsContent value="reconciliation" className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-info" />
              <h2 className="text-sm font-medium">Reconciliation mode</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              How uploads to this account flow through the pipeline. The{" "}
              <code className="px-1 mx-0.5 rounded bg-muted text-xs">/inbox</code>{" "}
              chip is a per-render lens; this picker is the persisted policy.
            </p>
            <ModePicker
              accountId={account.id}
              initialMode={isMode(account.mode) ? account.mode : "manual"}
              onSaved={(m) =>
                setAccounts((list) => list.map((a) => (a.id === account.id ? { ...a, mode: m } : a)))
              }
            />
          </TabsContent>

          <TabsContent value="import" className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileCog className="h-4 w-4 text-chart-5" />
              <h2 className="text-sm font-medium">Import preferences</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Whether CSV / OFX / QFX uploads to this account show a field-mapping preview before staging,
              and which OFX field becomes the payee.
            </p>
            <ImportPrefsPicker
              accountId={account.id}
              initialCsvMappingMode={account.csvMappingMode === "auto" ? "auto" : "confirm"}
              initialOfxPayeeSource={account.ofxPayeeSource === "memo" ? "memo" : "name"}
              onSaved={(prefs) =>
                setAccounts((list) =>
                  list.map((a) =>
                    a.id === account.id
                      ? { ...a, csvMappingMode: prefs.csvMappingMode, ofxPayeeSource: prefs.ofxPayeeSource }
                      : a,
                  ),
                )
              }
            />
          </TabsContent>

          <TabsContent value="sleeves" className="pt-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-pos" />
                  <h2 className="text-sm font-medium">Cash sleeves</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Per-currency cash positions inside this account. Required before recording buys, sells, or FX
                  conversions in a new currency.
                </p>
              </div>
              {/* Creating a sleeve is still the account page's dialog; it opens there. */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/accounts/${account.id}?addSleeve=1`)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add sleeve
              </Button>
            </div>
            {sleevesLoading && sleeves.length === 0 ? (
              <div className="h-12 animate-shimmer rounded-md" />
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
                        <Badge variant="outline" className="text-xs font-mono">
                          {s.currency}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{s.name ?? `Cash ${s.currency}`}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{s.txCount ?? 0}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          aria-label="Delete sleeve"
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
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
        {actionError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {actionError}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={(o) => {
          if (!o) setRemoveOpen(false);
        }}
        title="Remove account"
        description={
          <>
            Remove <b>{account.name}</b>? If it still has any transactions or linked records it will be
            <b> archived</b> (hidden from lists and pickers, but its history is kept). If it is completely empty
            it will be <b>permanently deleted</b> — this cannot be undone.
          </>
        }
        confirmLabel="Continue"
        busy={removing}
        onConfirm={() => void handleArchiveOrDelete()}
      />

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
            Delete the {sleeveToDelete?.currency} cash sleeve? This is only allowed when no transactions
            reference it.
            {deleteSleeveError && <span className="mt-2 block text-destructive">{deleteSleeveError}</span>}
          </>
        }
        confirmLabel="Delete sleeve"
        busy={deletingSleeve}
        onConfirm={() => void confirmDeleteSleeve()}
      />
    </div>
  );
}

export default function EditAccountRoute() {
  return (
    <Suspense fallback={null}>
      <EditAccountPage />
    </Suspense>
  );
}
