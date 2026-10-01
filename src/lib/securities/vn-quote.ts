/**
 * Vietnamese stock price provider (VNDirect primary, TCBS optional, Yahoo fallback).
 *
 * VNDirect (api-finfo.vndirect.com.vn) is a public, unauthenticated API that covers
 * both HOSE and HNX symbols. TCBS (apipubaws.tcbs.com.vn) is an optional provider but
 * may be blocked by Cloudflare. Yahoo Finance is the final fallback for non-.VN symbols
 * and for .VN symbols when the VN provider is unset or fails.
 */

import type { QuoteResult } from "@/lib/price-service";
import { marketFetch } from "@/lib/market-fetch";

const QUOTE_FETCH_TIMEOUT_MS = 4000;

// Per-process memo for full historical ranges, keyed by symbol.
// Stores the full range fetched and a TTL for cache validation.
interface HistoryMemo {
  fetchedAt: number;
  bars: Array<{ date: string; close: number }>;
}
const historyMemo = new Map<string, HistoryMemo>();
const HISTORY_MEMO_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const HISTORY_MEMO_ERROR_TTL_MS = 10 * 60 * 1000; // 10 minutes for errors

/**
 * Check if a symbol is a Vietnamese stock (.VN suffix).
 * Case-insensitive, e.g. "HPG.VN" → true, "AAPL" → false.
 */
export function isVnSymbol(s: string): boolean {
  return /\.vn$/i.test(s);
}

/**
 * Read the Vietnamese price provider setting from process.env.
 * Returns the provider name ("vndirect" or "tcbs") or null if unset or empty.
 * Called at request time so test harnesses can stub process.env dynamically.
 */
export function vnProvider(): "vndirect" | "tcbs" | null {
  const env = process.env.PF_PRICE_PROVIDER_VN;
  if (!env || env.trim() === "") return null;
  const trimmed = env.trim().toLowerCase();
  if (trimmed === "vndirect" || trimmed === "tcbs") return trimmed as "vndirect" | "tcbs";
  return null;
}

/**
 * Fetch a live quote from VNDirect finfo API.
 * Symbol should be without the .VN suffix (e.g. "HPG").
 * Returns QuoteResult with price in VND, or null on error.
 */
export async function vndirectQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const baseSymbol = symbol.replace(/\.vn$/i, "");
    const url = `https://api-finfo.vndirect.com.vn/v4/stock_prices?q=code:${encodeURIComponent(baseSymbol)}&sort=date&size=2`;
    const res = await marketFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(QUOTE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const bars = data.data ?? [];
    if (!Array.isArray(bars) || bars.length === 0) return null;

    const latest = bars[0];
    const price = latest.close;
    if (typeof price !== "number" || !(price > 0)) return null;

    // Price is in thousands of VND, convert to actual VND.
    const priceVnd = Math.round(price * 1000);

    // Get previousClose from the second bar if available.
    let previousClose: number | null = null;
    if (bars.length >= 2) {
      const prev = bars[1];
      const prevPrice = prev.close ?? prev.basicPrice;
      if (typeof prevPrice === "number" && prevPrice > 0) {
        previousClose = Math.round(prevPrice * 1000);
      }
    }

    const change = previousClose !== null ? priceVnd - previousClose : 0;
    const changePct = previousClose !== null && previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol,
      price: priceVnd,
      currency: "VND",
      name: baseSymbol,
      change,
      changePct,
      previousClose: previousClose ?? null,
      quoteType: "EQUITY",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a live quote from TCBS bars-long-term API.
 * Symbol should be without the .VN suffix (e.g. "HPG").
 * Returns QuoteResult with price in VND, or null on error.
 * NOTE: This endpoint is currently blocked by Cloudflare on most networks.
 * Unverified: TCBS bars order and data format behind Cloudflare challenge.
 */
export async function tcbsQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const baseSymbol = symbol.replace(/\.vn$/i, "");
    const now = Math.floor(Date.now() / 1000);
    const url = `https://apipubaws.tcbs.com.vn/tcharts/api/bars-long-term?ticker=${encodeURIComponent(baseSymbol)}&type=stock&resolution=D&to=${now}&countBack=2`;
    const res = await marketFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(QUOTE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const bars = data.t !== undefined ? data : null;
    if (!bars || !Array.isArray(bars.c) || bars.c.length === 0) return null;

    const closes = bars.c as number[];
    if (closes.length === 0) return null;
    // TCBS returns closes in ascending order; take the last (most recent) element
    const price = closes[closes.length - 1];
    if (typeof price !== "number" || !(price > 0)) return null;

    // TCBS prices are already in VND (not thousands).
    // Round using Math.floor(x + 0.5) to avoid banker's rounding
    const priceVnd = Math.floor(price + 0.5);

    let previousClose: number | null = null;
    if (closes.length >= 2) {
      const prevPrice = closes[closes.length - 2];
      if (typeof prevPrice === "number" && prevPrice > 0) {
        previousClose = Math.floor(prevPrice + 0.5);
      }
    }

    const change = previousClose !== null ? priceVnd - previousClose : 0;
    const changePct = previousClose !== null && previousClose > 0 ? (change / previousClose) * 100 : 0;

    return {
      symbol,
      price: priceVnd,
      currency: "VND",
      name: baseSymbol,
      change,
      changePct,
      previousClose: previousClose ?? null,
      quoteType: "EQUITY",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a live VN quote using the configured provider.
 * Dispatches to vndirectQuote or tcbsQuote based on vnProvider() setting.
 * Returns null if no provider is set or if the fetch fails.
 */
export async function fetchVnQuoteLive(symbol: string): Promise<QuoteResult | null> {
  const provider = vnProvider();
  if (!provider) return null;

  if (provider === "vndirect") {
    return vndirectQuote(symbol);
  } else if (provider === "tcbs") {
    return tcbsQuote(symbol);
  }

  return null;
}

/**
 * Fetch historical daily closes from VNDirect for a date range.
 * Uses a per-process memo to fetch the full range (since 2013-01-01) once and serve
 * windowed requests from cache (12-hour TTL). Memoises errors for 10 minutes to avoid
 * hammering the API on transient failures.
 * Returns an array of { date: "YYYY-MM-DD", close: number (in VND) } sorted ascending by date.
 * Used by fetchQuoteAtDate to populate price_cache with a window of history.
 */
export async function vndirectHistory(
  symbol: string,
  fromDate: string,
  toDate: string,
): Promise<Array<{ date: string; close: number }>> {
  try {
    const baseSymbol = symbol.replace(/\.vn$/i, "");
    const now = Date.now();

    // Check memo for this symbol
    const memoEntry = historyMemo.get(baseSymbol);
    if (memoEntry) {
      const age = now - memoEntry.fetchedAt;
      const ttl = memoEntry.bars.length > 0 ? HISTORY_MEMO_TTL_MS : HISTORY_MEMO_ERROR_TTL_MS;
      if (age < ttl) {
        // Return cached data (may be empty array for errors)
        return memoEntry.bars.filter((bar) => bar.date >= fromDate && bar.date <= toDate);
      }
    }

    // Fetch full range: from 2013-01-01 to today. VNDirect returns newest first.
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://api-finfo.vndirect.com.vn/v4/stock_prices?q=code:${encodeURIComponent(baseSymbol)}~date:gte:2013-01-01~date:lte:${today}&sort=date&size=5000`;
    const res = await marketFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(QUOTE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Memoize error (empty array) for 10 minutes
      historyMemo.set(baseSymbol, { fetchedAt: now, bars: [] });
      return [];
    }

    const data = await res.json();
    const bars = data.data ?? [];
    if (!Array.isArray(bars)) {
      historyMemo.set(baseSymbol, { fetchedAt: now, bars: [] });
      return [];
    }

    // Convert to VND (close is in thousands) and sort ascending by date
    const out: Array<{ date: string; close: number }> = [];
    for (const bar of bars) {
      const date = bar.date as string;
      const price = bar.close as number;
      if (typeof date === "string" && typeof price === "number" && price > 0) {
        // Convert from thousands to VND
        out.push({ date, close: Math.round(price * 1000) });
      }
    }
    // VNDirect returns newest first (descending); sort ascending
    out.sort((a, b) => a.date.localeCompare(b.date));

    // Memoize the full range
    historyMemo.set(baseSymbol, { fetchedAt: now, bars: out });

    // Return only the requested window
    return out.filter((bar) => bar.date >= fromDate && bar.date <= toDate);
  } catch {
    // Memoize error (empty array) for 10 minutes to avoid API hammering
    const baseSymbol = symbol.replace(/\.vn$/i, "");
    historyMemo.set(baseSymbol, { fetchedAt: Date.now(), bars: [] });
    return [];
  }
}
