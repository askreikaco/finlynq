"use client";

import { useState, useEffect, useRef } from "react";
import {
  ChevronDown,
  LogOut,
  Plus,
  Lock,
  LogOutIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hardReload, clearPerUserStorage } from "@/lib/client/hard-reload";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface Account {
  userId: string;
  email: string;
  displayName: string;
  isAdmin?: boolean;
  active: boolean;
  status: "active" | "switchable" | "locked";
}

export interface AccountSwitcherProps {
  compact?: boolean;
}

/**
 * Account switcher menu: shows current account and allows switching between
 * inactive accounts, adding a new account, and signing out.
 */
export const MAX_ACCOUNTS = 5;
const CAP_MESSAGE =
  "You can have a maximum of 5 accounts. Sign out of one to add another.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

function initialsOf(a: Pick<Account, "displayName" | "email">): string {
  const src = (a.displayName || a.email || "").trim();
  const out = src
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => Array.from(n)[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return out || "?";
}

export function AccountSwitcher({ compact = false }: AccountSwitcherProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Synchronous double-submit guard (state updates are async; two clicks in
  // the same tick would both pass a state check).
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/accounts");
        if (res.ok) {
          const data: Account[] = await res.json();
          if (!cancelled && Array.isArray(data)) setAccounts(data);
        }
      } catch {
        // menu simply stays hidden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(t);
  }, [message]);

  const activeAccount = accounts.find((a) => a.active);
  const inactiveAccounts = accounts.filter((a) => !a.active);
  const atCap = accounts.length >= MAX_ACCOUNTS;

  /** Run one action at a time; clears busy unless the action navigates. */
  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setMessage(null);
    let navigated = false;
    try {
      navigated = await fn();
    } catch {
      setMessage(GENERIC_ERROR);
    } finally {
      // After a navigation keep the guard held so a second click cannot fire
      // while the page unloads.
      if (!navigated) {
        busyRef.current = false;
        setBusy(null);
      }
      setOpen(false);
    }
  };

  /** add-intent, then the normal login page in add mode. Returns navigated. */
  const startAddFlow = async (email?: string): Promise<boolean> => {
    const res = await fetch("/api/auth/add-intent", { method: "POST" });
    if (res.ok) {
      hardReload(
        email ? `/cloud?add=1&email=${encodeURIComponent(email)}` : "/cloud?add=1",
      );
      return true;
    }
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      if (data?.error === "account_cap" || data?.status === "account_cap") {
        setMessage(CAP_MESSAGE);
        return false;
      }
    }
    setMessage(GENERIC_ERROR);
    return false;
  };

  const handleSwitch = (account: Account) =>
    run(`switch:${account.userId}`, async () => {
      if (account.status === "locked") {
        // Known to need a password again; skip the doomed switch call.
        return startAddFlow(account.email);
      }
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: account.userId }),
      });
      if (res.ok) {
        hardReload("/dashboard");
        return true;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data?.status === "needs_login") {
          return startAddFlow(typeof data.email === "string" ? data.email : account.email);
        }
      }
      setMessage(
        res.status === 404
          ? "That account is no longer available. Sign in again to add it."
          : GENERIC_ERROR,
      );
      return false;
    });

  const handleAdd = () => run("add", () => startAddFlow());

  const handleSignOut = (all: boolean) =>
    run(all ? "signout-all" : "signout", async () => {
      const res = await fetch(all ? "/api/auth/logout?all=1" : "/api/auth/logout", {
        method: "POST",
      });
      // 401 = session already gone; treat as signed out.
      if (!res.ok && res.status !== 401) {
        setMessage(GENERIC_ERROR);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const ids = all ? accounts.map((a) => a.userId) : activeAccount ? [activeAccount.userId] : [];
      for (const id of ids) clearPerUserStorage(id);
      hardReload(!all && res.ok && data?.activeUserId ? "/dashboard" : "/");
      return true;
    });

  const alert = message ? (
    <div
      role="alert"
      className="fixed bottom-4 left-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-lg border border-destructive/30 bg-popover px-3 py-2 text-sm text-destructive shadow-md"
    >
      <span className="break-words">{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setMessage(null)}
        className="shrink-0 text-xs underline"
      >
        Dismiss
      </button>
    </div>
  ) : null;

  if (!activeAccount) {
    return null;
  }

  const initials = initialsOf(activeAccount);
  const itemCls = "flex items-center gap-2 cursor-pointer min-h-10 md:min-h-0";

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          aria-label="Account menu"
          title="Account menu"
          className={cn(
            "group/account relative flex items-center gap-2 rounded-lg transition-all duration-200 bg-transparent border-0",
            compact
              ? "px-0 py-2 justify-center"
              : "px-3 py-2 w-full text-left hover:bg-white/[0.05]",
          )}
        >
          <div
            aria-hidden="true"
            className="flex items-center justify-center rounded-full bg-primary/20 font-medium text-primary shrink-0 h-8 w-8 text-xs"
          >
            {initials}
          </div>
          {!compact && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">
                {activeAccount.displayName || "Account"}
              </div>
              <div className="text-xs text-sidebar-foreground/60 truncate">
                {activeAccount.email}
              </div>
            </div>
          )}
          {!compact && (
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 text-sidebar-foreground/40 group-hover/account:text-sidebar-foreground/60 transition-colors"
            />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side={compact ? "right" : "bottom"}
          align={compact ? "end" : "start"}
          className="min-w-64 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Signed in as
            </DropdownMenuLabel>
            <div className="flex items-center gap-2 px-1.5 py-1 min-w-0">
              <div
                aria-hidden="true"
                className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-medium shrink-0"
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {activeAccount.displayName || "Account"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {activeAccount.email}
                </div>
              </div>
              {activeAccount.isAdmin && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium shrink-0">
                  Admin
                </span>
              )}
            </div>
          </DropdownMenuGroup>

          {inactiveAccounts.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                  Other accounts
                </DropdownMenuLabel>
                {inactiveAccounts.map((account) => (
                  <DropdownMenuItem
                    key={account.userId}
                    onClick={() => handleSwitch(account)}
                    disabled={busy !== null}
                    className={itemCls}
                  >
                    <div
                      aria-hidden="true"
                      className="flex items-center justify-center h-6 w-6 rounded-full bg-sidebar-accent/20 text-sidebar-foreground text-xs font-medium shrink-0"
                    >
                      {initialsOf(account)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {account.displayName || "Account"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {account.email}
                      </div>
                    </div>
                    {account.isAdmin && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium shrink-0">
                        Admin
                      </span>
                    )}
                    {account.status === "locked" && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        Sign in again
                      </span>
                    )}
                    {busy === `switch:${account.userId}` && (
                      <span className="text-xs text-muted-foreground shrink-0">Switching...</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleAdd}
            disabled={busy !== null || atCap}
            title={atCap ? CAP_MESSAGE : undefined}
            className={itemCls}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add another account</span>
            {atCap && (
              <span className="ml-auto text-xs text-muted-foreground">(max {MAX_ACCOUNTS})</span>
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => handleSignOut(false)}
            disabled={busy !== null}
            className={itemCls}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign out of this account</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => handleSignOut(true)}
            disabled={busy !== null}
            variant="destructive"
            className={itemCls}
          >
            <LogOutIcon className="h-4 w-4" aria-hidden="true" />
            <span>Sign out of all accounts</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {alert}
    </>
  );
}
