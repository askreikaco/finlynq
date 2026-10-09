"use client";

/**
 * Shared types, helpers and data loading for the /settings/investments surface
 * (list page + the create/edit/link/prices pages under ./securities, ./accounts,
 * ./cash-sleeves). Pure helpers live here so every route resolves the same
 * labels and the same validated return target.
 */

import { useCallback, useEffect, useState } from "react";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { resolveTickerAdvisory } from "@/lib/securities/ticker-advisories";

export type SecurityAccount = {
  accountId: number;
  accountName: string | null;
  isInvestment: boolean;
  positionId: number;
  isCash: boolean;
};

export type Security = {
  id: number;
  symbol: string | null;
  name: string | null;
  assetType: string;
  currency: string;
  isCash: boolean;
  isCrypto: boolean;
  // Manual / custom pricing (excluded from the Yahoo/CoinGecko API; valued off
  // the user's price marks). `latestPrice` is the newest mark for the status cell.
  priceSource: "auto" | "manual";
  latestPrice: { date: string; price: number } | null;
  // Server-detected: this held, auto-priced ticker has never produced a single
  // price_cache row — no provider recognizes it. Drives the `unpriced` advisory.
  neverPriced?: boolean;
  image: string | null;
  accounts: SecurityAccount[];
};

export type Account = {
  id: number;
  name: string;
  type: string;
  currency: string;
  isInvestment: boolean;
  archived?: boolean;
};

// base-ui Select needs an items value→label map so the trigger shows the label
// (not the raw value). FINLYNQ-201: user-settable asset type for tradable
// securities. Cosmetic — never re-clusters.
export const ASSET_TYPE_LABELS: Record<string, string> = { stock: "Stock", etf: "ETF" };

export const INVESTMENTS_HOME = "/settings/investments";

export type InvestmentsTab = "securities" | "by-security" | "by-account";
const TABS: readonly InvestmentsTab[] = ["securities", "by-security", "by-account"];

export function parseTab(raw: string | null | undefined): InvestmentsTab {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as InvestmentsTab) : "securities";
}

/** Toast texts keyed by the `notice` query param a route appends after a save. */
export const NOTICES: Record<string, string> = {
  "security-added": "Security added",
  "security-added-manual": "Security added — add a price under “Prices”.",
  "security-updated": "Security updated",
  "ticker-changed": "Ticker changed",
  linked: "Linked",
  "cash-added": "Cash sleeve added",
};

export function noticeText(raw: string | null | undefined): string | null {
  if (!raw || !Object.prototype.hasOwnProperty.call(NOTICES, raw)) return null;
  return NOTICES[raw];
}

/** Back / Cancel target: the validated `returnTo` (same-app relative path), else the list. */
export function backHref(raw: string | null | undefined): string {
  return safeReturnTo(raw, INVESTMENTS_HOME);
}

/** Destination after a successful save: validated returnTo plus the notice code. */
export function returnHref(raw: string | null | undefined, notice: string): string {
  const base = backHref(raw);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}notice=${encodeURIComponent(notice)}`;
}

export function symbolLabel(s: Security): string {
  return s.symbol?.trim() || s.name?.trim() || "—";
}

/** The human display name, only when it's distinct from the ticker code. */
export function descriptionOf(s: Security): string {
  const sym = symbolLabel(s);
  const nm = s.name?.trim() ?? "";
  return nm && nm.toUpperCase() !== sym.toUpperCase() ? nm : "";
}

/**
 * The pricing advisory for a security: a curated entry (POL → MATIC …) if one
 * exists, else the server-detected "we've never priced this ticker" warning.
 */
export function advisoryFor(s: Security) {
  return resolveTickerAdvisory(s.symbol, { neverPriced: s.neverPriced });
}

/** Loads the catalog + accounts. Bespoke fetch/useState (no SWR), same as the list. */
export function useInvestmentData() {
  const [securities, setSecurities] = useState<Security[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sRes, aRes] = await Promise.all([fetch("/api/securities"), fetch("/api/accounts")]);
      if (!sRes.ok) throw new Error("Failed to load securities");
      const json: { data: Security[] } = await sRes.json();
      setSecurities(json.data ?? []);
      setAccounts(aRes.ok ? ((await aRes.json()) as Account[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { securities, accounts, loading, error, reload: load };
}
