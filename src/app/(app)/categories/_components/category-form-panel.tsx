"use client";

/**
 * CategoryFormPanel: THE category + budget form. /categories/new and /categories/[id]/edit render it as a page; the
 * /categories split view renders it `embedded` in the pane. One component, so fields, requests, the offline queue and
 * the delete confirm are the same code in both (`embedded` only changes chrome, see FormPage).
 *
 * A GROUP (parent, id `g-E-housing`) has no row of its own: its edit form renames the group on every category in it.
 * The panel loads its own data (categories, the month's budgets) cache-first, so a route page and the pane need no props
 * besides the callbacks.
 */

import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { FormPage, type FormPageEmbedded } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDisplayCurrency } from "@/components/currency-provider";
import { useCacheFirstJson } from "@/lib/data/use-cache-first";
import { applyPendingBudgets } from "@/lib/budgets/pending-overlay";
import { discardQueuedCreate, isLocalWriteQueueActive, queueOfflineBudgetDelete, usePendingBudgets } from "@/lib/data/local-write-queue";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";
import { localDateISO } from "@/lib/utils/date";
import { groupSelId, isGroupSelId, resolveGroupSelId } from "@/lib/categories/group-key";
import type { LoadState, LoadStatus } from "@/lib/forms/load-state";
import type { Budget } from "../../budgets/_components/budget-types";
import { CategoryBudgetForm, type FormCategory } from "./category-budget-form";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface CategoryFormPanelProps {
  mode: "create" | "edit";
  /** Pane only: the category id or group id (the routes read it from the URL). */
  id?: string;
  embedded?: boolean;
  /** The month the budget field is for. Default: ?month= of the address, else this month. */
  month?: string;
  /** Spending / Income preselected for a new category. */
  defaultType?: "E" | "I";
  /** Saved (edit: the id; create: the new category's id). */
  onSaved?: (id?: number | string, warning?: string) => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

interface FormExtra {
  categories: FormCategory[];
  budgets: Budget[];
  month: string;
  currency: string;
  clearBudget: (b: Budget) => Promise<boolean>;
}

/** Server row of a budget (no overlay fields) as the offline queue's baseline. */
function serverRowOf(b: Budget) {
  return { id: b.id, categoryId: b.categoryId, month: b.month, amount: b.amount, currency: b.currency ?? null, updatedAt: b.updatedAt ?? null, categoryName: b.categoryName, categoryGroup: b.categoryGroup };
}

function useFormLoad(monthProp: string | undefined) {
  return function useCategoryFormLoad({ params }: { params: Record<string, string | undefined> }): LoadState<FormCategory | "group", FormExtra> {
    const searchParams = useSearchParams();
    const { displayCurrency, isLoading: currencyLoading } = useDisplayCurrency();
    const urlMonth = searchParams.get("month");
    const month = monthProp ?? (urlMonth && MONTH_RE.test(urlMonth) ? urlMonth : localDateISO().slice(0, 7));
    const catsRes = useCacheFirstJson<FormCategory[]>("/api/categories");
    const budgetsRes = useCacheFirstJson<Budget[]>(
      currencyLoading ? null : `/api/budgets?month=${month}&currency=${encodeURIComponent(displayCurrency)}`,
      { keepPrevious: true },
    );
    const budgetsReload = budgetsRes.reload;
    const pending = usePendingBudgets(() => budgetsReload());
    const categories = useMemo(() => (Array.isArray(catsRes.data) ? catsRes.data : []), [catsRes.data]);
    const serverBudgets = useMemo(() => (Array.isArray(budgetsRes.data) ? budgetsRes.data : []), [budgetsRes.data]);
    const budgets = useMemo(() => applyPendingBudgets(serverBudgets, pending, month), [serverBudgets, pending, month]);

    /** Remove a budget (server or queued on this device). False = failed. */
    const clearBudget = useCallback(async (b: Budget): Promise<boolean> => {
      if (b.pendingSync?.kind === "create") return await discardQueuedCreate(b.pendingSync.opId);
      try {
        const res = await fetch(`/api/budgets?id=${b.id}`, { method: "DELETE" });
        return res.ok;
      } catch (netErr) {
        const serverRow = serverBudgets.find((x) => x.id === b.id) ?? b;
        return isLocalWriteQueueActive() && isNetworkFailure(netErr) ? await queueOfflineBudgetDelete(serverRowOf(serverRow)) : false;
      }
    }, [serverBudgets]);

    const idParam = params.id;
    let status: LoadStatus;
    let record: FormCategory | "group" | undefined;
    if (!idParam) {
      status = catsRes.data === undefined && !catsRes.error ? "loading" : "ready";
    } else if (catsRes.data === undefined) {
      status = catsRes.error ? "error" : "loading";
    } else if (isGroupSelId(idParam)) {
      record = resolveGroupSelId(idParam, categories) ? "group" : undefined;
      status = record ? "ready" : "notFound";
    } else {
      record = categories.find((c) => c.id === Number(idParam));
      status = record ? "ready" : "notFound";
    }
    return {
      status,
      record,
      extra: { categories, budgets, month, currency: displayCurrency, clearBudget },
      retry: () => { catsRes.reload(); budgetsReload(); },
    };
  };
}

/** Group edit: one name, applied as the Group of every category in it. */
function GroupRenameForm({ groupId, categories, onSaved, onCancel }: {
  groupId: string;
  categories: FormCategory[];
  /** The group's new id (its name changed). */
  onSaved: (newId: string) => void;
  onCancel: () => void;
}) {
  const g = resolveGroupSelId(groupId, categories);
  const members = g ? categories.filter((c) => c.type === g.type && c.group === g.name) : [];
  const [name, setName] = useState(g?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next) { setError("Name required"); return; }
    if (next === g?.name) { onCancel(); return; }
    setBusy(true);
    setError("");
    try {
      for (const c of members) {
        const res = await fetch("/api/categories", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: c.id, name: c.name, group: next }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error || "Couldn't save");
          return;
        }
      }
      onSaved(groupSelId(g!.type, next));
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-form="category-group" className="space-y-4">
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <Input aria-label="Group name" className="h-11 text-base regular:pointer-fine:text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" />
      <p className="text-xs text-muted-foreground">
        Renames the group on its {members.length} categor{members.length === 1 ? "y" : "ies"}. Move a single category by editing it.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function toEmbedded(p: CategoryFormPanelProps): FormPageEmbedded | undefined {
  return p.embedded
    ? { id: p.id, onSaved: () => p.onSaved?.(p.id), onCancel: p.onCancel, onDeleted: p.onDeleted }
    : undefined;
}

export function CategoryFormPanel(props: CategoryFormPanelProps) {
  const useLoad = useMemo(() => useFormLoad(props.month), [props.month]);
  const routeParams = useParams<{ id?: string }>();
  const idValue = props.embedded ? props.id : routeParams?.id;
  const edit = props.mode === "edit";
  const [warning, setWarning] = useState("");
  return (
    <FormPage<unknown, FormCategory | "group", unknown, FormExtra>
      id={edit ? "category-edit" : "category-new"}
      entity="category"
      embedded={toEmbedded(props)}
      title={(rec) => (!edit ? "New category" : rec === "group" ? "Edit group" : "Edit category")}
      fallbackReturn={(params) => (edit && params.id ? `/categories/${params.id}` : "/categories")}
      form="external"
      useLoad={useLoad}
      header={{ actions: null }}
      states={{
        loading: { chrome: false, variant: "cards", rows: 1 },
        error: { chrome: false, title: "Couldn't load categories", message: "Please try again.", retry: "reload" },
        notFound: { chrome: true, kind: "text", message: "This category no longer exists.", linkLabel: "Back to categories" },
      }}
    >
      {(ctx) => {
        const x = ctx.extra;
        if (!x) return null;
        if (warning) {
          return (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">Saved, but the budget did not: {warning}</p>
              <Button type="button" onClick={() => ctx.router.push(ctx.returnTo)}>Continue</Button>
            </div>
          );
        }
        if (ctx.record === "group") {
          return <GroupRenameForm groupId={idValue ?? ""} categories={x.categories} onSaved={(newId) => (ctx.embedded ? props.onSaved?.(newId) : ctx.router.push(`/categories/${newId}`))} onCancel={ctx.cancel} />;
        }
        return (
          <CategoryBudgetForm
            key={`${typeof ctx.record === "object" ? ctx.record.id : "new"}-${x.budgets.length}-${x.categories.length}`}
            category={typeof ctx.record === "object" ? ctx.record : null}
            categories={x.categories}
            budgets={x.budgets}
            month={x.month}
            currency={x.currency}
            defaultType={props.defaultType ?? "E"}
            flush
            onSaved={(w, newId) => {
              props.onSaved?.(newId ?? (typeof ctx.record === "object" ? ctx.record.id : undefined), w);
              if (ctx.embedded) return;
              if (w) setWarning(w);
              else ctx.router.push(newId && !edit ? `/categories/${newId}` : ctx.returnTo);
            }}
            onCancel={ctx.cancel}
            onDeleted={() => { props.onDeleted?.(); if (!ctx.embedded) ctx.router.push("/categories"); }}
            onClearBudget={x.clearBudget}
          />
        );
      }}
    </FormPage>
  );
}
