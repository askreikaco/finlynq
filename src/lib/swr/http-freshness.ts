/**
 * After a successful write the browser HTTP cache (private, short max-age on metric series) must not answer the
 * revalidation that the write triggers. write-revalidation.ts calls noteWrite(); jsonFetcher then asks the browser
 * to revalidate with the origin ("no-cache" = conditional request, still cheap) for a short window.
 */
export const FRESH_WINDOW_MS = 30_000;
let lastWriteAt = 0;

export function noteWrite(now: number = Date.now()): void {
  lastWriteAt = now;
}

export function fetchInitAfterWrite(now: number = Date.now()): RequestInit | undefined {
  return now - lastWriteAt < FRESH_WINDOW_MS ? { cache: "no-cache" } : undefined;
}

export function resetWriteClock(): void {
  lastWriteAt = 0;
}
