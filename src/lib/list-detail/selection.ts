/**
 * Split-view selection lives in the URL: `?sel=<id>` selects an item, `?sel=new` starts a create.
 * Pure helpers (no React) so the parsing and the pane's sticky offsets are unit-tested in one place.
 */

export const SEL_PARAM = "sel";
export const SEL_NEW = "new";

export type ListSelection =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "item"; id: string };

/** An id is a short token (numeric id, uuid or transfer link id). Anything else is ignored. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseSel(raw: string | null | undefined): ListSelection {
  if (!raw) return { kind: "none" };
  if (raw === SEL_NEW) return { kind: "new" };
  return ID_RE.test(raw) ? { kind: "item", id: raw } : { kind: "none" };
}

/** The query string (with leading "?", or "" when empty) for `search` with `sel` set (null removes it). */
export function withSel(search: string | URLSearchParams, sel: string | number | null): string {
  const p = new URLSearchParams(typeof search === "string" ? search : search.toString());
  if (sel === null || sel === "") p.delete(SEL_PARAM);
  else p.set(SEL_PARAM, String(sel));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Pane placement. The pane is a column of the ENTIRE PAGE HEIGHT (a sibling of the whole page body, not of one section).
 * The top bar (PageHeader) is sticky at `top: var(--sat)` and is `--phone-header-h` (3.75rem) tall, so the pane sticks that
 * far down plus a 1rem margin and never sits under it. Its height is the viewport minus the same offset minus 1rem bottom
 * margin (a full-height column even when empty); the pane scrolls inside itself.
 */
export const PANE_TOP_OFFSET = "calc(var(--phone-header-h,3.75rem)+var(--sat,0px)+1rem)";
export const PANE_HEIGHT = "calc(100dvh-var(--phone-header-h,3.75rem)-var(--sat,0px)-2rem)";
// Literal class strings (Tailwind only generates classes it can read verbatim from source).
export const PANE_CLASS =
  "sticky top-[calc(var(--phone-header-h,3.75rem)+var(--sat,0px)+1rem)] h-[calc(100dvh-var(--phone-header-h,3.75rem)-var(--sat,0px)-2rem)] overflow-y-auto";
/** Page body 2/3, pane 1/3. */
export const SPLIT_GRID_CLASS = "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-6";
