"use client";

import { useState, useEffect, useRef } from "react";
import { hardReload, clearPerUserStorage } from "@/lib/client/hard-reload";
import { ACCOUNT_PAGE_HREF } from "@/lib/client/account-page";
import { readHiddenAccounts, writeHiddenAccounts } from "@/lib/client/hidden-accounts";

export interface Account {
  userId: string;
  email: string;
  displayName: string;
  isAdmin?: boolean;
  active: boolean;
  status: "active" | "switchable" | "locked";
}

export const MAX_ACCOUNTS = 5;
export const CAP_MESSAGE =
  "You can have a maximum of 5 accounts. Sign out of one to add another.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

export function initialsOf(a: Pick<Account, "displayName" | "email">): string {
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

/**
 * Shared state + actions for every account UI (More list, desktop dropdown,
 * manage page). Only existing APIs: /api/auth/{accounts,switch,add-intent,logout}.
 */
export function useAccountActions() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHiddenState] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Synchronous double-submit guard (state updates are async).
  const busyRef = useRef(false);

  useEffect(() => {
    setHiddenState(readHiddenAccounts());
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/accounts");
        if (res.ok) {
          const data: Account[] = await res.json();
          if (!cancelled && Array.isArray(data)) setAccounts(data);
        }
      } catch {
        // UI simply stays hidden
      }
      if (!cancelled) setLoaded(true);
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

  const setHidden = (userId: string, hide: boolean) => {
    const next = hide
      ? [...new Set([...readHiddenAccounts(), userId])]
      : readHiddenAccounts().filter((id) => id !== userId);
    writeHiddenAccounts(next);
    setHiddenState(next);
  };

  const active = accounts.find((a) => a.active);
  /** Visible = not hidden on this device; the active account always shows (first). */
  const visible = accounts
    .filter((a) => a.active || !hidden.includes(a.userId))
    .sort((a, b) => Number(b.active) - Number(a.active));
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
    }
  };

  /** add-intent, then the normal login page in add mode. Returns navigated. */
  const startAddFlow = async (email?: string, userId?: string): Promise<boolean> => {
    const res = await fetch(
      "/api/auth/add-intent",
      userId
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          }
        : { method: "POST" },
    );
    if (res.ok) {
      hardReload(email ? `/cloud?add=1&email=${encodeURIComponent(email)}` : "/cloud?add=1");
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

  /** POST /api/auth/switch. "ok" | "navigated" (add flow started) | "failed". */
  const switchTo = async (account: Account): Promise<"ok" | "navigated" | "failed"> => {
    if (account.status === "locked") {
      // Known to need a password again; skip the doomed switch call.
      return (await startAddFlow(account.email, account.userId)) ? "navigated" : "failed";
    }
    const res = await fetch("/api/auth/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: account.userId }),
    });
    if (res.ok) return "ok";
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      if (data?.status === "needs_login") {
        const nav = await startAddFlow(
          typeof data.email === "string" ? data.email : account.email,
          account.userId,
        );
        return nav ? "navigated" : "failed";
      }
    }
    setMessage(
      res.status === 404
        ? "That account is no longer available. Sign in again to add it."
        : GENERIC_ERROR,
    );
    return "failed";
  };

  // The switch API takes no return URL, so navigate after it succeeds. Always
  // a full load (hardReload) so no state leaks between accounts.
  const handleSwitch = (account: Account) =>
    run(`switch:${account.userId}`, async () => {
      const r = await switchTo(account);
      if (r === "ok") hardReload(ACCOUNT_PAGE_HREF);
      return r !== "failed";
    });

  const handleAdd = () => run("add", () => startAddFlow());

  /**
   * Remove one account from this device. The logout API only revokes the
   * ACTIVE account, so a background account is made active first (switch),
   * then logged out; logout promotes the next switchable account.
   */
  const handleRemove = (account: Account) =>
    run(`remove:${account.userId}`, async () => {
      if (!account.active) {
        if (account.status === "locked") {
          setMessage("Sign in again to this account before removing it.");
          return false;
        }
        const r = await switchTo(account);
        if (r !== "ok") return r === "navigated";
      }
      const res = await fetch("/api/auth/logout", { method: "POST" });
      // 401 = session already gone; treat as signed out.
      if (!res.ok && res.status !== 401) {
        setMessage(GENERIC_ERROR);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      clearPerUserStorage(account.userId);
      writeHiddenAccounts(readHiddenAccounts().filter((id) => id !== account.userId));
      hardReload(res.ok && data?.activeUserId ? "/dashboard" : "/");
      return true;
    });

  const handleSignOutAll = () =>
    run("signout-all", async () => {
      const res = await fetch("/api/auth/logout?all=1", { method: "POST" });
      if (!res.ok && res.status !== 401) {
        setMessage(GENERIC_ERROR);
        return false;
      }
      for (const a of accounts) clearPerUserStorage(a.userId);
      hardReload("/");
      return true;
    });

  return {
    accounts, loaded, active, visible, hidden, setHidden, atCap, busy,
    message, setMessage, handleSwitch, handleAdd, handleRemove, handleSignOutAll,
  };
}
