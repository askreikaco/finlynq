/**
 * Vietnamese stock price provider (VNDirect primary, TCBS optional, Yahoo fallback).
 *
 * VNDirect (api-finfo.vndirect.com.vn) is a public, unauthenticated API that covers
 * both HOSE and HNX symbols. TCBS (apipubaws.tcbs.com.vn) is an optional provider but
 * may be blocked by Cloudflare. Yahoo Finance is the final fallback for non-.VN symbols
 * and for .VN symbols when the VN provider is unset or fails.
 */

import { marketFetch } from "@/lib/market-fetch";

const QUOTE_FETCH_TIMEOUT_MS = 4000;

// Type imported from price-service: QuoteResult is the return type for both live and historical quotes.
// Defined here so it can be used by vn-quote functions.
export interface QuoteResult {
  symbol: string;
  price: number;
  currency: string;
  name: string;
  change: number;
  changePct: number;
  marketCap?: number;
  previousClose?: number | null;
  quoteType?: string | null;
}

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
    // TCBS returns closes with most recent first (index 0)
    const price = closes[0];
    if (typeof price !== "number" || !(price > 0)) return null;

    // TCBS prices are already in VND (not thousands).
    // Round using Math.floor(x + 0.5) to avoid banker's rounding
    const priceVnd = Math.floor(price + 0.5);

    let previousClose: number | null = null;
    if (closes.length >= 2) {
      const prevPrice = closes[1];
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
 * Returns an array of { date: "YYYY-MM-DD", close: number (in thousands) }.
 * Used by fetchQuoteAtDate to populate price_cache with a window of history.
 */
export async function vndirectHistory(
  symbol: string,
  fromDate: string,
  toDate: string,
): Promise<Array<{ date: string; close: number }>> {
  try {
    const baseSymbol = symbol.replace(/\.vn$/i, "");
    // VNDirect historical query: q=code:X~date:gte:YYYY-MM-DD&sort=date&size=N
    const url = `https://api-finfo.vndirect.com.vn/v4/stock_prices?q=code:${encodeURIComponent(baseSymbol)}~date:gte:${fromDate}&sort=date&size=500`;
    const res = await marketFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(QUOTE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const bars = data.data ?? [];
    if (!Array.isArray(bars)) return [];

    const out: Array<{ date: string; close: number }> = [];
    for (const bar of bars) {
      const date = bar.date as string;
      const price = bar.close as number;
      if (typeof date === "string" && typeof price === "number" && price > 0) {
        // Only include bars within the requested range.
        if (date >= fromDate && date <= toDate) {
          // VNDirect returns prices in thousands; keep as-is for cacheHistoricalWindow.
          out.push({ date, close: price });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
