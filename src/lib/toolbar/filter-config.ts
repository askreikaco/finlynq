import type { SortOption } from "./sort";

export type FieldOption = { value: string; label: string };

/** One control on the filter page. `""` always means "no filter". */
export type FilterField =
  | { kind: "segment"; key: string; label: string; options: readonly FieldOption[]; hideWhenReturnTo?: RegExp }
  | { kind: "select"; key: string; label: string; allLabel: string; options: readonly FieldOption[] | "accounts" | "categories"; hideWhenReturnTo?: RegExp }
  | { kind: "amount"; minKey: string; maxKey: string; label: string }
  | { kind: "date"; fromKey: string; toKey: string; label: string }
  | { kind: "text"; key: string; label: string; placeholder?: string }
  /** Multi-account picker; the value is a comma list of account ids ("" = every account). */
  | { kind: "accounts"; key: string; label: string };

export interface FilterSortConfig {
  /** Page title. Default "Filter". */
  title?: string;
  /** Where Apply / Reset / Back go when `returnTo` is missing or unsafe. */
  fallbackReturnTo: string;
  fields: readonly FilterField[];
  /** Sort options (omit or empty = no sort section). Date is the default when present, otherwise Name. */
  sorts?: readonly SortOption[];
}

export function fieldKeys(field: FilterField): string[] {
  switch (field.kind) {
    case "amount": return [field.minKey, field.maxKey];
    case "date": return [field.fromKey, field.toKey];
    default: return [field.key];
  }
}
