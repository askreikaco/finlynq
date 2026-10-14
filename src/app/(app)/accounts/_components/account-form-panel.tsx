"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormPage } from "@/components/templates/form-page";
import { useDisplayCurrency } from "@/components/currency-provider";
import { useReturnTo } from "@/lib/forms/use-return-to";
import type { LoadState } from "@/lib/forms/load-state";
import { Inbox, FileCog, Coins, Plus, Trash2, Wallet, ExternalLink } from "lucide-react";
import { PageHeader, OverflowMenu, ListRow, type OverflowAction } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModePicker } from "@/components/inbox/mode-picker";
import { ImportPrefsPicker } from "@/components/inbox/import-prefs-picker";
import { isMode, type Mode } from "@/components/inbox/modes";
import { TW } from "@/lib/design/tokens";
import { AccountForm, type AccountFormAccount } from "./account-form";

/** Root class of every state (loading, not found, loaded): the form width token. */
const ROOT_CLASS = "w-full";

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

/** Split-view pane mode: the callbacks replace every navigation (see AccountFormPanel). */
export interface AccountPanelEmbedded {
  onSaved?: (id?: number | string) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

function AccountEditView({ accountId, returnTo, embedded }: { accountId: number; returnTo: string; embedded?: AccountPanelEmbedded }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Back / Cancel / success go to returnTo (same-app path only), else the account's detail page. The pane calls back instead.
  const destination = returnTo || `/accounts/${accountId}`;
  const leaveSaved = () => (embedded ? embedded.onSaved?.(accountId) : router.push(destination));
  const leaveCancel = () => (embedded ? embedded.onCancel?.() : router.push(destination));
  const leaveDeleted = () => (embedded ? embedded.onDeleted?.() : router.push("/accounts"));

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
        leaveDeleted();
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
        leaveDeleted();
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
      leaveSaved();
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

  const header = embedded ? (
    <div data-slot="form-pane-header" className="flex items-center justify-between gap-2 pb-3">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-foreground">Edit account</h2>
        <Link href={`/accounts/${accountId}`} className="inline-flex items-center gap-1 text-xs text-primary underline">
          Open account page <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>
      {overflow.length > 0 ? <OverflowMenu items={overflow} /> : null}
    </div>
  ) : (
    <PageHeader
      title="Edit account"
      backHref={destination}
      backLabel="Back"
      overflow={overflow.length > 0 ? overflow : undefined}
      className="flex items-center justify-between"
    />
  );
  const rootProps = { "data-testid": "account-edit-root", "data-form": "account", "data-embedded": embedded ? "true" : undefined } as const;
  const bodyClass = embedded ? "" : `mt-3 ${TW.form} ${TW.formPad}`;

  if (!loaded) {
    return (
      <div {...rootProps} className={ROOT_CLASS}>
        {header}
        <div className={`${embedded ? "" : "mt-3 "}h-40 animate-shimmer ${TW.group}`} />
      </div>
    );
  }

  if (!account) {
    return (
      <div {...rootProps} className={ROOT_CLASS}>
        {header}
        <p className="mt-3 text-sm text-muted-foreground">Account not found.</p>
      </div>
    );
  }

  return (
    <div {...rootProps} className={ROOT_CLASS}>
      {header}
      <div className={bodyClass}>
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
              onCancel={leaveCancel}
              onComplete={leaveSaved}
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
              <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] rounded-xl border border-border/50 bg-card px-3">
                {sleeves.map((s) => (
                  <ListRow
                    key={s.id}
                    title={
                      <span className="inline-flex max-w-full items-center gap-2 align-middle">
                        <Badge variant="outline" className="text-xs font-mono shrink-0">
                          {s.currency}
                        </Badge>
                        <span className="truncate">{s.name ?? `Cash ${s.currency}`}</span>
                      </span>
                    }
                    subtitle={`${s.txCount ?? 0} transaction${(s.txCount ?? 0) === 1 ? "" : "s"}`}
                    value={
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
                    }
                  />
                ))}
              </div>
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

type AccountRow = { id: number; name: string | null; alias: string | null; group: string | null };

type AccountsExtra = {
  accounts: AccountRow[];
  groups: string[];
  /** Only a present, valid returnTo overrides the post-create destination (fallback "" = none). */
  createdReturnTo: string;
};

/** Same wording and rule as the Create dialog had: name or alias clashes with another account. */
function aliasClash(list: AccountRow[], alias: string, excludeId: number | null): string {
  const a = alias.trim().toLowerCase();
  if (!a) return "";
  const clash = list.find((acc) => {
    if (acc.id === excludeId) return false;
    const otherAlias = (acc.alias ?? "").trim().toLowerCase();
    const otherName = (acc.name ?? "").trim().toLowerCase();
    return otherAlias === a || otherName === a;
  });
  return clash
    ? `Another account ("${clash.name}") already uses this name or alias — matches may be ambiguous.`
    : "";
}

/**
 * Existing accounts (archived included) feed the group suggestions and the alias-clash warning.
 * The form renders at once with empty suggestions, so the status is always "ready".
 */
function useAccountsLoad(): LoadState<unknown, AccountsExtra> {
  // Only a present, valid returnTo overrides the post-create destination (fallback "" = none).
  const createdReturnTo = useReturnTo("");

  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts?includeArchived=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled && Array.isArray(d)) setAccounts(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(
    () => Array.from(new Set(accounts.map((a) => (a.group ?? "").trim()).filter(Boolean))),
    [accounts],
  );

  return { status: "ready", extra: { accounts, groups, createdReturnTo }, retry: () => undefined };
}


export interface AccountFormPanelProps {
  mode: "create" | "edit";
  /** Pane only: the account id (the routes read it from the URL). */
  id?: string;
  embedded?: boolean;
  /** Edit: the account id. Create: the new account's id (the pane then stays on it). */
  onSaved?: (id?: number | string) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

function CreateAccount(props: AccountFormPanelProps) {
  const { displayCurrency } = useDisplayCurrency();
  return (
    <FormPage
      id="account-new"
      entity="account"
      embedded={props.embedded ? { onCancel: props.onCancel } : undefined}
      title="New account"
      fallbackReturn="/accounts"
      form="external"
      useLoad={useAccountsLoad}
      header={{ actions: null }}
    >
      {(ctx) => (
        <AccountForm
          mode="create"
          variant="rows"
          defaultCurrency={displayCurrency}
          existingGroups={ctx.extra?.groups ?? []}
          aliasWarning={(alias, excludeId) => aliasClash(ctx.extra?.accounts ?? [], alias, excludeId)}
          onCancel={ctx.cancel}
          onCreated={(created) =>
            ctx.embedded ? props.onSaved?.(created.id) : ctx.router.push(ctx.extra?.createdReturnTo || `/accounts/${created.id}`)
          }
        />
      )}
    </FormPage>
  );
}

function EditAccount(props: AccountFormPanelProps) {
  const params = useParams<{ id: string }>();
  const urlReturnTo = useReturnTo("");
  const embedded = props.embedded ? { onSaved: props.onSaved, onCancel: props.onCancel, onDeleted: props.onDeleted } : undefined;
  const accountId = Number(props.embedded ? props.id : params.id);
  const returnTo = props.embedded ? "" : urlReturnTo;
  return <AccountEditView accountId={accountId} returnTo={returnTo} embedded={embedded} />;
}

/**
 * AccountFormPanel: THE account create / edit form. /accounts/new and /accounts/[id]/edit render it as a page; the
 * /accounts split view renders it `embedded` in the pane. Same fields, requests, offline queue and archive/delete
 * confirm in both (marker `data-form="account"`).
 */
export function AccountFormPanel(props: AccountFormPanelProps) {
  return props.mode === "edit" ? <EditAccount {...props} /> : <CreateAccount {...props} />;
}
