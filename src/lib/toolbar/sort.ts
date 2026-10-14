/**
 * Shared sort model for the page toolbar's filter page: Date (default), Name, Amount, each with a direction.
 * URL: ?sort=date|name|amount (absent = the list's default) and ?dir=asc|desc (absent = that sort's natural direction).
 */

export type SortDir = "asc" | "desc";

export type SortOption = {
  key: string;
  label: string;
  /** Direction this sort starts in (default: newest date, A-Z, biggest amount). Upcoming dates start soonest-first. */
  dir?: SortDir;
  /** Direction captions (default: per key, see DIR_LABELS). */
  dirLabels?: Record<SortDir, string>;
};

export type SortState = { sort: string; dir: SortDir };

/** Natural direction of each sort: newest date first, A-Z, biggest amount first. */
export const SORT_NATURAL_DIR: Record<string, SortDir> = { date: "desc", name: "asc", amount: "desc" };

export const SORT_LABELS: Record<string, string> = { date: "Date", name: "Name", amount: "Amount" };

export const DIR_LABELS: Record<string, Record<SortDir, string>> = {
  date: { asc: "Oldest first", desc: "Newest first" },
  name: { asc: "A-Z", desc: "Z-A" },
  amount: { asc: "Smallest first", desc: "Biggest first" },
};

export function naturalDir(key: string, options?: readonly SortOption[]): SortDir {
  return options?.find((o) => o.key === key)?.dir ?? SORT_NATURAL_DIR[key] ?? "asc";
}

export function dirLabel(key: string, dir: SortDir, options?: readonly SortOption[]): string {
  return (options?.find((o) => o.key === key)?.dirLabels ?? DIR_LABELS[key] ?? { asc: "A-Z", desc: "Z-A" })[dir];
}

/** Date when the list has one, otherwise Name (then the first option). */
export function defaultSortKey(options: readonly SortOption[]): string {
  const keys = options.map((o) => o.key);
  if (keys.includes("date")) return "date";
  if (keys.includes("name")) return "name";
  return keys[0] ?? "name";
}

export function defaultSortState(options: readonly SortOption[]): SortState {
  const sort = defaultSortKey(options);
  return { sort, dir: naturalDir(sort, options) };
}

/** Read ?sort=&dir= against the list's allowed options (anything else falls back to the default). */
export function parseSort(get: (key: string) => string | null | undefined, options: readonly SortOption[]): SortState {
  const raw = get("sort");
  const sort = raw && options.some((o) => o.key === raw) ? raw : defaultSortKey(options);
  const d = get("dir");
  return { sort, dir: d === "asc" || d === "desc" ? d : naturalDir(sort, options) };
}

export function isDefaultSort(state: SortState, options: readonly SortOption[]): boolean {
  const def = defaultSortState(options);
  return state.sort === def.sort && state.dir === def.dir;
}

/** Query params for a sort state; the default (key and direction) writes nothing. */
export function sortToParams(state: SortState, options: readonly SortOption[]): Record<string, string> {
  const def = defaultSortKey(options);
  const out: Record<string, string> = {};
  if (state.sort !== def) out.sort = state.sort;
  if (state.dir !== naturalDir(state.sort, options)) out.dir = state.dir;
  return out;
}

type Cell = string | number | null | undefined;

/** Name/text compare (locale aware, case-insensitive), numbers numerically. Empty values always sort last. */
export function sortRecords<T>(rows: readonly T[], state: SortState, accessors: Record<string, (row: T) => Cell>): T[] {
  const get = accessors[state.sort];
  if (!get) return [...rows];
  const sign = state.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const ae = a.v == null || a.v === "";
      const be = b.v == null || b.v === "";
      if (ae || be) return ae && be ? a.i - b.i : ae ? 1 : -1;
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), undefined, { sensitivity: "base", numeric: true });
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.row);
}
