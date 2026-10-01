"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Lock, UserCog, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCOUNT_PAGE_HREF, MANAGE_ACCOUNTS_HREF } from "@/lib/client/account-page";
import {
  useAccountActions,
  initialsOf,
  MAX_ACCOUNTS,
  CAP_MESSAGE,
  type Account,
} from "@/lib/client/use-account-actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type { Account };
export { MAX_ACCOUNTS };

export interface AccountSwitcherProps {
  compact?: boolean;
  /**
   * "dropdown" (default, desktop sidebar): current-user trigger opens a menu.
   * "list" (More page): rows rendered in place, no overlay.
   * Same items, same order: visible accounts (current first), Add another
   * account, Manage accounts.
   */
  variant?: "dropdown" | "list";
}

export function AccountAlert({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-lg border border-destructive/30 bg-popover px-3 py-2 text-sm text-destructive shadow-md"
    >
      <span className="break-words">{message}</span>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="shrink-0 text-xs underline">
        Dismiss
      </button>
    </div>
  );
}

const rowCls =
  "flex w-full min-h-11 items-center gap-3 px-3 py-1.5 text-left text-base font-medium text-foreground transition-colors hover:bg-muted/40 active:bg-muted/60 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const itemCls = "flex items-center gap-2 cursor-pointer min-h-11 md:min-h-0";

function Avatar({ account, ring }: { account: Pick<Account, "displayName" | "email">; ring?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium",
        ring ? "bg-primary/20 text-primary ring-2 ring-primary" : "bg-muted text-foreground",
      )}
    >
      {initialsOf(account)}
    </span>
  );
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60"
    >
      {children}
    </span>
  );
}

function AccountBody({ account, busy }: { account: Account; busy: string | null }) {
  return (
    <>
      <Avatar account={account} ring={account.active} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{account.displayName || "Account"}</span>
        <span className="block truncate text-xs text-muted-foreground">{account.email}</span>
      </span>
      {account.isAdmin && (
        <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          Admin
        </span>
      )}
      {account.active && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
          <Check className="h-3 w-3" aria-hidden="true" />
          Current
        </span>
      )}
      {account.status === "locked" && !account.active && (
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Sign in again
        </span>
      )}
      {busy === `switch:${account.userId}` && (
        <span className="shrink-0 text-xs text-muted-foreground">Switching...</span>
      )}
    </>
  );
}

export function AccountSwitcher({ compact = false, variant = "dropdown" }: AccountSwitcherProps) {
  const router = useRouter();
  const a = useAccountActions();

  if (!a.active) return null;

  const onAccount = (acc: Account) =>
    acc.active ? router.push(ACCOUNT_PAGE_HREF) : a.handleSwitch(acc);
  const addDisabled = a.busy !== null || a.atCap;
  const addExtra = a.atCap ? (
    <span className="shrink-0 text-xs text-muted-foreground">(max {MAX_ACCOUNTS})</span>
  ) : null;
  const alert = <AccountAlert message={a.message} onDismiss={() => a.setMessage(null)} />;

  if (variant === "list") {
    return (
      <>
        {a.visible.map((acc) => (
          <button
            key={acc.userId}
            type="button"
            onClick={() => onAccount(acc)}
            disabled={a.busy !== null}
            aria-current={acc.active ? "true" : undefined}
            className={rowCls}
            data-testid="account-row"
          >
            <AccountBody account={acc} busy={a.busy} />
          </button>
        ))}
        <button
          type="button"
          onClick={a.handleAdd}
          disabled={addDisabled}
          title={a.atCap ? CAP_MESSAGE : undefined}
          className={rowCls}
        >
          <IconTile><Plus className="h-[18px] w-[18px]" /></IconTile>
          <span className="flex-1">Add another account</span>
          {addExtra}
        </button>
        <Link href={MANAGE_ACCOUNTS_HREF} className={rowCls}>
          <IconTile><UserCog className="h-[18px] w-[18px]" /></IconTile>
          <span className="flex-1">Manage accounts</span>
        </Link>
        {alert}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          title="Account menu"
          className={cn(
            "group/account relative flex items-center gap-2 rounded-lg transition-all duration-200 bg-transparent border-0",
            compact ? "px-0 py-2 justify-center" : "px-3 py-2 w-full text-left hover:bg-white/[0.05]",
          )}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary ring-2 ring-primary"
          >
            {initialsOf(a.active)}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-sidebar-foreground">
                  {a.active.displayName || "Account"}
                </span>
                <span className="block truncate text-xs text-sidebar-foreground/60">{a.active.email}</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-sidebar-foreground/40 transition-colors group-hover/account:text-sidebar-foreground/60"
              />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={compact ? "right" : "bottom"}
          align={compact ? "end" : "start"}
          className="min-w-64 max-w-[calc(100vw-2rem)]"
        >
          {a.visible.map((acc) => (
            <DropdownMenuItem
              key={acc.userId}
              onClick={() => onAccount(acc)}
              disabled={a.busy !== null}
              className={itemCls}
            >
              <AccountBody account={acc} busy={a.busy} />
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={a.handleAdd}
            disabled={addDisabled}
            title={a.atCap ? CAP_MESSAGE : undefined}
            className={itemCls}
          >
            <IconTile><Plus className="h-4 w-4" /></IconTile>
            <span className="flex-1">Add another account</span>
            {addExtra}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(MANAGE_ACCOUNTS_HREF)} className={itemCls}>
            <IconTile><UserCog className="h-4 w-4" /></IconTile>
            <span className="flex-1">Manage accounts</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {alert}
    </>
  );
}
