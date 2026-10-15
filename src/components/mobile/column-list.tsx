import * as React from "react";
import { ListRow } from "./list-row";
import { compareValues, type DataTableColumn, type SortDir } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

export interface ColumnListProps<T> {
  /** Same column descriptors the shared DataTable takes. First = row title, last = row value, the rest = subtitle. */
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Row tap (e.g. opens a DetailSheet). Omit for read-only rows. */
  onRowPress?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  emptyState?: React.ReactNode;
  /** Controlled sort (optional). When omitted the list sorts itself. */
  sort?: { key: string; dir: SortDir } | null;
  onSortChange?: (sort: { key: string; dir: SortDir } | null) => void;
  /** Server-side order: render `rows` exactly as given. */
  manualSort?: boolean;
  className?: string;
}

function cellOf<T>(col: DataTableColumn<T>, row: T): React.ReactNode {
  if (col.render) return col.render(row);
  const v = col.accessor(row);
  return v == null ? "—" : String(v);
}

function labelOf<T>(col: DataTableColumn<T>): string {
  return typeof col.header === "string" ? col.header : col.key;
}

/**
 * A DataTable's rows as native ListRows (no <table>), for mobile-style admin and settings lists.
 * Sort is a row of compact pills over the sortable columns; a tap on a pill cycles asc, desc, off.
 */
export function ColumnList<T>({
  columns,
  rows,
  rowKey,
  onRowPress,
  rowClassName,
  emptyState,
  sort: sortProp,
  onSortChange,
  manualSort,
  className,
}: ColumnListProps<T>) {
  const [localSort, setLocalSort] = React.useState<{ key: string; dir: SortDir } | null>(null);
  const controlled = sortProp !== undefined;
  const sort = controlled ? sortProp : localSort;
  const setSort = (next: { key: string; dir: SortDir } | null) => {
    if (controlled) onSortChange?.(next);
    else setLocalSort(next);
  };

  const sorted = React.useMemo(() => {
    if (manualSort || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(col.accessor(a), col.accessor(b)) * dir);
  }, [rows, sort, columns, manualSort]);

  const sortable = columns.filter((c) => c.sortable !== false);
  const [first, ...rest] = columns;
  const last = rest.length > 1 ? rest[rest.length - 1] : null;
  const middle = last ? rest.slice(0, -1) : rest;

  const cycle = (key: string) => {
    if (sort?.key !== key) return setSort({ key, dir: "asc" });
    if (sort.dir === "asc") return setSort({ key, dir: "desc" });
    setSort(null);
  };

  return (
    <div className={cn("space-y-3", className)}>
      {sortable.length > 0 && (
        <div role="group" aria-label="Sort" className="flex flex-wrap gap-2">
          {sortable.map((c) => {
            const active = sort?.key === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => cycle(c.key)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {labelOf(c)}
                {active ? (sort?.dir === "asc" ? "↑" : "↓") : null}
              </button>
            );
          })}
        </div>
      )}
      {rows.length === 0 ? (
        emptyState ?? null
      ) : (
        <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] rounded-xl border border-border/50 bg-card">
          {sorted.map((row) => {
            const subtitle = middle.map((c, i) => (
              <React.Fragment key={c.key}>
                {i > 0 ? " · " : null}
                <span className="whitespace-nowrap">
                  <span className="opacity-70">{labelOf(c)}: </span>
                  {cellOf(c, row)}
                </span>
              </React.Fragment>
            ));
            return (
              <ListRow
                key={rowKey(row)}
                title={first ? cellOf(first, row) : null}
                subtitle={subtitle.length > 0 ? <>{subtitle}</> : undefined}
                value={last ? cellOf(last, row) : undefined}
                onPress={onRowPress ? () => onRowPress(row) : undefined}
                className={rowClassName?.(row)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
