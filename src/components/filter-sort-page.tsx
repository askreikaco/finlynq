"use client";

/**
 * FilterSortPage: the full-page "Filter" screen every list opens from the PageToolbar's funnel button (modelled on
 * the old /transactions/search page). One layout, driven by a FilterSortConfig:
 *   Sort    Date (default), Name, Amount: radio rows, each with an ascending / descending toggle (A-Z / Z-A style)
 *   Filters the list's own fields (segments, selects, amount range, date range, text)
 * Apply and Reset both go back to `returnTo` with the params merged into its query (range, month, q ... are kept).
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountFilter } from "@/app/(app)/reports/_components/account-filter";
import { parseAccountIdsParam, serializeAccountIds } from "@/lib/reports/account-filter";
import { PageHeader } from "@/components/mobile";
import { useReturnTo } from "@/lib/forms/use-return-to";
import { applyToReturnTo } from "@/lib/toolbar/filter-params";
import { FILTER_CONFIGS } from "@/lib/toolbar/list-configs";
import { fieldKeys, type FilterField, type FilterSortConfig } from "@/lib/toolbar/filter-config";
import { Field, type FieldComboboxOption } from "@/components/ui/field";
import { defaultSortKey, dirLabel, naturalDir, parseSort, sortToParams, type SortDir } from "@/lib/toolbar/sort";

type Lookup = { id: number; name: string; alias?: string | null; group?: string };

/** Combobox sentinel for the "all" item (a real option may be called "all"). */
const ALL = "__all__";
const LABEL = "mb-2 block text-xs font-semibold uppercase tracking-normal text-muted-foreground";

export function FilterSortPage({ config }: { config: FilterSortConfig }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = useReturnTo(config.fallbackReturnTo);
  const sorts = useMemo(() => config.sorts ?? [], [config.sorts]);
  const fields = useMemo(() => config.fields.filter((f) => !("hideWhenReturnTo" in f && f.hideWhenReturnTo?.test(returnTo))), [config.fields, returnTo]);
  const ownedKeys = useMemo(() => fields.flatMap(fieldKeys), [fields]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of config.fields) for (const k of fieldKeys(f)) init[k] = searchParams.get(k) ?? "";
    return init;
  });
  const [sortState, setSortState] = useState(() => parseSort((k) => searchParams.get(k), sorts));
  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  // Account / category lookups, fetched only when a field asks for them.
  const needsAccounts = fields.some((f) => f.kind === "select" && f.options === "accounts");
  const needsCategories = fields.some((f) => f.kind === "select" && f.options === "categories");
  const [accounts, setAccounts] = useState<Lookup[]>([]);
  const [categories, setCategories] = useState<Lookup[]>([]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [a, c] = await Promise.all([
          needsAccounts ? fetch("/api/accounts") : null,
          needsCategories ? fetch("/api/categories") : null,
        ]);
        if (a?.ok) {
          const j = await a.json();
          if (live) setAccounts(Array.isArray(j) ? j : j.data || []);
        }
        if (c?.ok) {
          const j = await c.json();
          if (live) setCategories(Array.isArray(j) ? j : j.data || []);
        }
      } catch {
        /* the selects stay at "all" */
      }
    })();
    return () => { live = false; };
  }, [needsAccounts, needsCategories]);

  function go(next: Record<string, string>, sort: typeof sortState) {
    const out: Record<string, string | undefined> = { ...sortToParams(sort, sorts) };
    for (const k of ownedKeys) {
      const raw = next[k] ?? "";
      const f = fields.find((x) => x.kind === "amount" && (x.minKey === k || x.maxKey === k));
      out[k] = f && raw ? String(Math.abs(parseFloat(raw) || 0)) : raw;
    }
    router.push(applyToReturnTo(returnTo, config.fallbackReturnTo, out, [...ownedKeys, "sort", "dir"]));
  }

  const renderField = (f: FilterField) => {
    switch (f.kind) {
      case "segment": {
        return (
          <Field
            control="segmented"
            fill
            aria-label={f.label}
            value={values[f.key] ?? ""}
            onValueChange={(v) => set(f.key, v)}
            options={f.options.map((o) => ({ value: o.value, label: o.label }))}
          />
        );
      }
      case "select": {
        const opts: FieldComboboxOption[] =
          f.options === "accounts"
            ? accounts.map((a) => ({ value: String(a.id), label: a.alias || a.name }))
            : f.options === "categories"
              ? categories.map((c) => ({ value: String(c.id), label: c.group ? `${c.group} — ${c.name}` : c.name }))
              : f.options.map((o) => ({ value: o.value, label: o.label }));
        return (
          <Field
            control="combobox"
            value={values[f.key] ?? ""}
            onValueChange={(v) => set(f.key, v === ALL ? "" : v)}
            options={[{ value: ALL, label: f.allLabel }, ...opts.filter((o) => o.value !== "")]}
            placeholder={f.allLabel}
            searchPlaceholder="Search…"
            emptyMessage="No matches"
            compact
          />
        );
      }
      case "amount":
        return (
          <div className="grid grid-cols-2 gap-3">
            <Field
              control="amount"
              placeholder="From"
              value={values[f.minKey] ?? ""}
              onValueChange={(v) => set(f.minKey, v)}
            />
            <Field
              control="amount"
              placeholder="To"
              value={values[f.maxKey] ?? ""}
              onValueChange={(v) => set(f.maxKey, v)}
            />
          </div>
        );
      case "date":
        return (
          <div className="grid grid-cols-2 gap-3">
            <Field
              control="date"
              aria-label={`${f.label} from`}
              value={values[f.fromKey] ?? ""}
              onChange={(e) => set(f.fromKey, e.target.value)}
            />
            <Field
              control="date"
              aria-label={`${f.label} to`}
              value={values[f.toKey] ?? ""}
              onChange={(e) => set(f.toKey, e.target.value)}
            />
          </div>
        );
      case "accounts":
        return (
          <AccountFilter
            selected={parseAccountIdsParam(values[f.key]) ?? []}
            onChange={(ids) => set(f.key, serializeAccountIds(ids) ?? "")}
          />
        );
      case "text":
        return <Field
          aria-label={f.label}
          placeholder={f.placeholder}
          value={values[f.key] ?? ""}
          onChange={(e) => set(f.key, e.target.value)}
        />;
    }
  };

  const toggleDir = (key: string) => {
    if (sortState.sort !== key) setSortState({ sort: key, dir: naturalDir(key, sorts) === "asc" ? "desc" : "asc" });
    else setSortState({ sort: key, dir: sortState.dir === "asc" ? "desc" : "asc" });
  };

  return (
    <div data-testid="filter-sort-page" className="flex min-h-screen flex-col bg-background pb-[var(--mobile-bar-clearance)]">
      <PageHeader title={config.title ?? "Filter"} backHref={returnTo} backLabel="Back" />

      <div className="flex-1 space-y-5 px-4 py-4">
        {sorts.length > 0 && (
          <section aria-labelledby="fs-sort">
            <h2 id="fs-sort" className={LABEL}>Sort</h2>
            <div role="radiogroup" aria-label="Sort by" className="space-y-1">
              {sorts.map((o) => {
                const on = sortState.sort === o.key;
                const dir: SortDir = on ? sortState.dir : naturalDir(o.key, sorts);
                return (
                  <div key={o.key} className={`flex items-center gap-2 rounded-lg ${on ? "bg-muted" : ""}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setSortState({ sort: o.key, dir: naturalDir(o.key, sorts) })}
                      className="min-h-11 flex-1 rounded-lg px-3 text-left text-sm font-medium"
                    >
                      {o.label}
                      {o.key === defaultSortKey(sorts) && <span className="ml-2 text-xs font-normal text-muted-foreground">Default</span>}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-1.5"
                      aria-label={`${o.label} direction: ${dirLabel(o.key, dir, sorts)}. Switch to ${dirLabel(o.key, dir === "asc" ? "desc" : "asc", sorts)}`}
                      onClick={() => toggleDir(o.key)}
                    >
                      <ArrowDownUp className="h-4 w-4" />
                      <span className="text-xs">{dirLabel(o.key, dir, sorts)}</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {fields.map((f) => (
          <section key={fieldKeys(f).join("|")}>
            <h2 className={LABEL}>{f.label}</h2>
            {renderField(f)}
          </section>
        ))}

      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-background px-4 py-3 pb-[var(--sab)]">
        <Button
          variant="ghost"
          className="h-11 flex-1"
          onClick={() => {
            const cleared = Object.fromEntries(ownedKeys.map((k) => [k, ""]));
            setValues((p) => ({ ...p, ...cleared }));
            const def = parseSort(() => null, sorts);
            setSortState(def);
            go(cleared, def);
          }}
        >
          Reset
        </Button>
        <Button className="h-11 flex-1" onClick={() => go(values, sortState)}>
          Apply
        </Button>
      </div>
    </div>
  );
}

/** Client entry for /filter/[list]: looks the list's config up (configs hold RegExps, so they cannot cross from the server page). */
export function FilterListPage({ list }: { list: string }) {
  const config = FILTER_CONFIGS[list];
  return config ? <FilterSortPage config={config} /> : null;
}
