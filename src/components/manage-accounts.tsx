"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AccountAlert } from "@/components/account-switcher";
import { initialsOf, useAccountActions, MAX_ACCOUNTS, CAP_MESSAGE, type Account } from "@/lib/client/use-account-actions";
import { cn } from "@/lib/utils";

/** /manage-accounts: per-device show/hide, remove, add, sign out of all. */
export function ManageAccounts() {
  const a = useAccountActions();
  const [removing, setRemoving] = useState<Account | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  return (
    <div className="mx-auto max-w-xl space-y-4" data-testid="manage-accounts">
      <h1 className="text-3xl font-bold tracking-tight">Manage accounts</h1>
      <p className="text-sm text-muted-foreground">
        Accounts signed in on this device. Hidden accounts stay signed in but are left out of the account menu.
      </p>

      {a.accounts.map((acc) => {
        const shown = acc.active || !a.hidden.includes(acc.userId);
        return (
          <div key={acc.userId} data-testid="manage-account-card" className="rounded-2xl border border-border bg-card p-3">
            <div className="flex min-h-11 items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium",
                  acc.active && "bg-primary/20 text-primary ring-2 ring-primary",
                )}
              >
                {initialsOf(acc)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {acc.displayName || "Account"}
                  {acc.active && <span className="ml-2 text-xs text-primary">Current</span>}
                </div>
                <div className="truncate text-xs text-muted-foreground">{acc.email}</div>
              </div>
              <Switch
                checked={shown}
                disabled={acc.active}
                onCheckedChange={(on) => a.setHidden(acc.userId, !on)}
                aria-label={`Show ${acc.email} in account menu`}
              />
            </div>
            <div className="mt-1 flex min-h-11 items-center">
              <button
                type="button"
                disabled={a.busy !== null || (!acc.active && acc.status === "locked")}
                onClick={() => setRemoving(acc)}
                aria-label={`Remove ${acc.email} from this device`}
                className="min-h-11 px-1 text-sm text-destructive underline-offset-2 hover:underline disabled:opacity-50"
              >
                Remove from this device
              </button>
            </div>
          </div>
        );
      })}

      <Button
        variant="outline"
        className="min-h-11 w-full"
        disabled={a.busy !== null || a.atCap}
        title={a.atCap ? CAP_MESSAGE : undefined}
        onClick={a.handleAdd}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add another account
        {a.atCap && <span className="text-xs text-muted-foreground">(max {MAX_ACCOUNTS})</span>}
      </Button>

      <Button
        variant="destructive"
        className="min-h-11 w-full"
        disabled={a.busy !== null}
        onClick={() => setConfirmAll(true)}
      >
        Sign out of all accounts
      </Button>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove from this device"
        description={`Sign out ${removing?.email ?? ""} and remove it from this device?`}
        confirmLabel="Remove"
        busyLabel="Removing..."
        busy={a.busy?.startsWith("remove:") ?? false}
        onConfirm={() => removing && a.handleRemove(removing)}
      />
      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Sign out of all accounts"
        description="Every account on this device will be signed out. You will need to sign in again."
        confirmLabel="Sign out of all"
        busyLabel="Signing out..."
        busy={a.busy === "signout-all"}
        onConfirm={a.handleSignOutAll}
      />
      <AccountAlert message={a.message} onDismiss={() => a.setMessage(null)} />
    </div>
  );
}
