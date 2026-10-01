"use client";

import { useState, useEffect } from "react";
import {
  ChevronDown,
  LogOut,
  Plus,
  Lock,
  LogOutIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hardReload } from "@/lib/client/hard-reload";
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
export function AccountSwitcher({ compact = false }: AccountSwitcherProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Fetch accounts on mount
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/auth/accounts");
        if (res.ok) {
          const data: Account[] = await res.json();
          setAccounts(data);
        }
      } catch {
        // Silently fail; menu will show no accounts
      }
    };
    fetchAccounts();
  }, []);

  const activeAccount = accounts.find((a) => a.active);
  const inactiveAccounts = accounts.filter((a) => !a.active);

  const handleSwitch = async (userId: string) => {
    setSwitching(userId);
    try {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        // Switch successful, hard reload
        hardReload("/dashboard");
        return;
      }

      if (res.status === 409) {
        // Needs login (account locked/expired)
        const data = await res.json();
        if (data.status === "needs_login") {
          const email = encodeURIComponent(data.email || "");
          hardReload(`/cloud?add=1&email=${email}`);
          return;
        }
      }

      // Other errors: silently ignore and close menu
    } catch {
      // Network error: silently ignore
    } finally {
      setSwitching(null);
      setOpen(false);
    }
  };

  const handleAddIntent = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/add-intent", { method: "POST" });
      if (res.ok) {
        // Go to add account flow
        hardReload("/cloud?add=1");
      } else if (res.status === 409) {
        const data = await res.json();
        if (data.status === "account_cap") {
          // Show error: max 5 accounts
          alert("You can have a maximum of 5 accounts. Sign out of one to add another.");
        }
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  const handleSignOut = async (all: boolean = false) => {
    try {
      const url = all ? "/api/auth/logout?all=1" : "/api/auth/logout";
      await fetch(url, { method: "POST" });
      hardReload("/");
    } catch {
      // Silently fail
    }
  };

  if (!activeAccount) {
    return null;
  }

  const initials = (activeAccount.displayName || activeAccount.email)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        aria-label="Account menu"
        title="Account menu"
        className={cn(
          "group/account relative flex items-center gap-2 rounded-lg transition-all duration-200 bg-transparent border-0",
          compact
            ? "px-0 py-2 justify-center"
            : "px-3 py-2 w-full text-left hover:bg-white/[0.05]"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-primary/20 font-medium text-primary shrink-0",
            compact ? "h-8 w-8 text-sm" : "h-8 w-8 text-xs"
          )}
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
          <ChevronDown className="h-4 w-4 text-sidebar-foreground/40 group-hover/account:text-sidebar-foreground/60 transition-colors" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent side={compact ? "right" : "bottom"} align={compact ? "end" : "start"}>
        {/* Current account (header) */}
        {!compact && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                Signed in as
              </DropdownMenuLabel>
              <div className="px-1.5 py-1">
                <div className="text-sm font-medium text-foreground flex items-center gap-2">
                  <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/20 text-primary text-xs font-medium shrink-0">
                    {initials}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{activeAccount.displayName || "Account"}</div>
                    <div className="text-xs text-muted-foreground">{activeAccount.email}</div>
                  </div>
                  {activeAccount.isAdmin && (
                    <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium">
                      Admin
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuGroup>
            {inactiveAccounts.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {/* Other accounts (switchable) */}
        {inactiveAccounts.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/50">
                Other accounts
              </DropdownMenuLabel>
              {inactiveAccounts.map((account) => {
                const accountInitials = (account.displayName || account.email)
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <DropdownMenuItem
                    key={account.userId}
                    onClick={() => handleSwitch(account.userId)}
                    disabled={switching === account.userId}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-sidebar-accent/20 text-sidebar-foreground text-xs font-medium shrink-0">
                      {accountInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {account.displayName || "Account"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {account.email}
                      </div>
                    </div>
                    {account.status === "locked" && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Lock className="h-3 w-3" />
                        <span>Sign in again</span>
                      </div>
                    )}
                    {switching === account.userId && (
                      <span className="text-xs text-muted-foreground">Switching...</span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Add account */}
        <DropdownMenuItem
          onClick={handleAddIntent}
          disabled={loading || accounts.length >= 5}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add another account</span>
          {accounts.length >= 5 && (
            <span className="ml-auto text-xs text-muted-foreground">(max 5)</span>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Sign out options */}
        <DropdownMenuItem
          onClick={() => handleSignOut(false)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out of this account</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleSignOut(true)}
          variant="destructive"
          className="flex items-center gap-2 cursor-pointer"
        >
          <LogOutIcon className="h-4 w-4" />
          <span>Sign out of all accounts</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
