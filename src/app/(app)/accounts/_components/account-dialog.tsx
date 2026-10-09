"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AccountForm, type AccountFormAccount } from "./account-form";

export type AccountDialogAccount = AccountFormAccount;

/** An extra tab — Reconciliation / Import / Cash sleeves. Rendered after Details. */
export type AccountDialogTab = { value: string; label: string; content: ReactNode };

export interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account being edited. */
  account?: AccountDialogAccount | null;
  /** group-name suggestions for the GroupField. */
  existingGroups?: string[];
  /** Extra tabs (Reconciliation / Import / Cash sleeves). */
  extraTabs?: AccountDialogTab[];
  /** Which tab to open initially (deep-link support). */
  initialTab?: string;
  /** optional alias-clash warning; excludeId is the account being edited. */
  aliasWarning?: (alias: string, excludeId: number | null) => string;
  onSaved?: (account: AccountDialogAccount) => void;
  onRemoved?: (result: { archived: boolean }) => void;
}

/**
 * Edit-account dialog (account-detail "Edit account"). Creating an account no
 * longer happens here: it has its own page at /accounts/new, which uses the same
 * <AccountForm>. This dialog adds the tabs and the archive / delete actions.
 */
export function AccountDialog({
  open,
  onOpenChange,
  account,
  existingGroups = [],
  extraTabs,
  initialTab = "details",
  aliasWarning,
  onSaved,
  onRemoved,
}: AccountDialogProps) {
  const [tab, setTab] = useState(initialTab);
  const [saveError, setSaveError] = useState("");
  // Archive/delete confirmation.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const showTabs = !!extraTabs && extraTabs.length > 0;
  const archived = account?.archived === true;

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSaveError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleArchiveOrDelete() {
    if (!account) return;
    setRemoving(true);
    setSaveError("");
    try {
      // Try a hard delete first; if the account is still referenced (FK 409),
      // archive it instead (hidden from lists, history kept).
      const del = await fetch(`/api/accounts?id=${account.id}`, { method: "DELETE" });
      if (del.ok) {
        setRemoveOpen(false);
        onRemoved?.({ archived: false });
        onOpenChange(false);
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
          setSaveError(d.error ?? "Failed to archive account");
          return;
        }
        setRemoveOpen(false);
        onRemoved?.({ archived: true });
        onOpenChange(false);
        return;
      }
      const d = await del.json().catch(() => ({}));
      setSaveError(d.error ?? "Failed to remove account");
    } catch {
      setSaveError("Failed to remove account");
    } finally {
      setRemoving(false);
    }
  }

  async function handleUnarchive() {
    if (!account) return;
    setRemoving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: account.id, archived: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSaveError(d.error ?? "Failed to unarchive account");
        return;
      }
      const saved = await res.json();
      onSaved?.(saved);
      onOpenChange(false);
    } catch {
      setSaveError("Failed to unarchive account");
    } finally {
      setRemoving(false);
    }
  }

  // Edit-only account actions: one smart Archive/Delete, or Unarchive + Delete for an archived account.
  const actions = account ? (
    <div className="mt-2 pt-4 border-t space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Account actions</p>
      {archived ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" disabled={removing} onClick={handleUnarchive}>
            Unarchive
          </Button>
          <Button type="button" variant="destructive" className="flex-1" disabled={removing} onClick={() => setRemoveOpen(true)}>
            Delete
          </Button>
        </div>
      ) : (
        <Button type="button" variant="destructive" className="w-full" disabled={removing} onClick={() => setRemoveOpen(true)}>
          Archive or delete account
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        If the account still has transactions or linked records it is archived (hidden from lists and
        pickers, history kept). If it is empty it is permanently deleted.
      </p>
    </div>
  ) : null;

  const editForm = (
    <AccountForm
      mode="edit"
      open={open}
      account={account}
      existingGroups={existingGroups}
      aliasWarning={aliasWarning}
      busy={removing}
      variant="stack"
      onCancel={() => onOpenChange(false)}
      onSaved={onSaved}
      onComplete={() => onOpenChange(false)}
    >
      {actions}
    </AccountForm>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={showTabs ? "sm:max-w-xl" : undefined}>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>

          {showTabs ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v ?? "details")}>
              <TabsList className="w-full">
                <TabsTrigger value="details">Details</TabsTrigger>
                {extraTabs!.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="details" className="pt-4">
                {editForm}
              </TabsContent>
              {extraTabs!.map((t) => (
                <TabsContent key={t.value} value={t.value} className="pt-4 space-y-3">
                  {t.content}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            editForm
          )}
          {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        </DialogContent>
      </Dialog>

      {/* Smart Archive/Delete confirmation. */}
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={(o) => { if (!o) setRemoveOpen(false); }}
        title="Remove account"
        description={
          <>
            Remove <b>{account?.name}</b>? If it still has any transactions or linked records it will be
            <b> archived</b> (hidden from lists and pickers, but its history is kept). If it is completely
            empty it will be <b>permanently deleted</b> — this cannot be undone.
          </>
        }
        confirmLabel="Continue"
        busy={removing}
        onConfirm={handleArchiveOrDelete}
      />
    </>
  );
}
