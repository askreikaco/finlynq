/**
 * In-process cache for GET /api/family/overview (the heaviest page in the app).
 *
 * An entry is valid for the calendar day it was built on (auto-refresh daily) and can be
 * bypassed with ?refresh=1 (the page's Refresh button). The key covers everything that
 * decides WHAT the viewer may see — viewer, period, display currency, DEK presence (locked
 * viewers never get a cached unlocked payload) and every active share's id + granted
 * sections — so a revoke or a narrowed grant changes the key and is never served from cache.
 * Entries live only in this server process's memory (never on disk, never shared between
 * viewers) and are capped so memory stays bounded.
 */
import { createHash } from "node:crypto";

type Entry = { body: unknown; day: string; generatedAt: string };

const MAX_ENTRIES = 200;

/** Production only (tests mutate data between calls); FAMILY_OVERVIEW_CACHE=off disables it. */
export function overviewCacheEnabled(): boolean {
  return process.env.NODE_ENV === "production" && process.env.FAMILY_OVERVIEW_CACHE !== "off";
}
const entries = new Map<string, Entry>();

export type OverviewCacheKeyInput = {
  viewerId: string;
  period: string;
  display: string;
  unlocked: boolean;
  shares: { id: string; allSections: unknown; sections: unknown; mustShareBack: unknown; requiredBackSections: unknown }[];
};

export function overviewCacheKey(k: OverviewCacheKeyInput): string {
  const shares = k.shares
    .map((s) => JSON.stringify([s.id, s.allSections, s.sections, s.mustShareBack, s.requiredBackSections]))
    .sort()
    .join("|");
  const sharesHash = createHash("sha256").update(shares).digest("hex");
  return `${k.viewerId}:${k.period}:${k.display}:${k.unlocked ? 1 : 0}:${sharesHash}`;
}

export function getCachedOverview(key: string, today: string): Entry | null {
  const e = entries.get(key);
  if (!e) return null;
  if (e.day !== today) {
    entries.delete(key);
    return null;
  }
  return e;
}

export function setCachedOverview(key: string, today: string, body: unknown): Entry {
  if (entries.size >= MAX_ENTRIES) {
    // Map iterates in insertion order: drop the oldest entry
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  const e: Entry = { body, day: today, generatedAt: new Date().toISOString() };
  entries.delete(key);
  entries.set(key, e);
  return e;
}

/** Drop every cached entry of one viewer (e.g. after a share change). */
export function invalidateViewerOverview(viewerId: string): void {
  for (const key of entries.keys()) if (key.startsWith(`${viewerId}:`)) entries.delete(key);
}

/** Test helper. */
export function clearOverviewCache(): void {
  entries.clear();
}
