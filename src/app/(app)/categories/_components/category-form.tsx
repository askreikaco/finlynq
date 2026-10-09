"use client";

/**
 * Category create / rename as a full page (owner rule: create/edit flows are
 * pages, not modals). Shared by the merged categories hub and the legacy
 * /settings/categorization screen, which both link here.
 *   create: POST /api/categories { name, type, group }   (payload unchanged)
 *   rename: PUT  /api/categories { id, name }            (payload unchanged)
 * Back / Cancel / save go to `returnTo` (same-app path only, see safeReturnTo).
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupCombobox } from "@/components/ui/group-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";

export const CATEGORY_RETURN_FALLBACK = "/categories?tab=manage";

const TYPE_LABELS = { E: "Expense", I: "Income", R: "Reconciliation" } as const;

type Category = { id: number; type: string; group: string; name: string; note: string };

export function CategoryForm({
  mode,
  categoryId,
}: {
  mode: "create" | "rename";
  /** Required when mode is "rename". */
  categoryId?: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), CATEGORY_RETURN_FALLBACK);
  const isRename = mode === "rename";

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [type, setType] = useState("E");
  const [nameError, setNameError] = useState("");
  const [groupError, setGroupError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d) => {
        if (cancelled) return;
        const list: Category[] = Array.isArray(d) ? d : [];
        setCategories(list);
        if (isRename) {
          const found = list.find((c) => c.id === categoryId);
          if (found) setName(found.name);
          else setLoadError("Category not found");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError("Failed to load categories");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isRename, categoryId]);

  const uniqueGroups = Array.from(new Set(categories.map((c) => c.group).filter(Boolean))).sort((a, b) =>
    (a ?? "").localeCompare(b ?? "")
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setNameError("Name is required");
      return;
    }
    setNameError("");
    setSubmitting(true);
    try {
      const res = isRename
        ? await fetch("/api/categories", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: categoryId, name: name.trim() }),
          })
        : await fetch("/api/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name.trim(), type, group: group.trim() }),
          });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const fallback = isRename ? "Failed to update" : "Failed to create";
        setFormError(data?.error || fallback);
        return;
      }
      router.push(returnTo);
    } catch {
      setFormError(isRename ? "Failed to update category" : "Failed to create category");
    } finally {
      setSubmitting(false);
    }
  }

  const title = isRename ? "Rename category" : "New category";
  const submitLabel = isRename ? "Save" : "Add Category";

  if (!loading && isRename && loadError) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <PageHeader title={title} backHref={returnTo} backLabel="Back" className="flex items-center justify-between" />
        <p className="mt-6 text-sm text-destructive">{loadError}</p>
      </div>
    );
  }

  return (
    <div data-testid="category-form-root" className="mx-auto w-full max-w-xl">
      <PageHeader title={title} backHref={returnTo} backLabel="Back" className="flex items-center justify-between" />
      <form onSubmit={handleSubmit} noValidate className="mt-3 space-y-4 pb-[calc(var(--sab,0px)+1.5rem)]">
        {formError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {formError}
          </div>
        )}

        <div>
          <Input
            aria-label="Category name"
            aria-invalid={!!nameError || undefined}
            className="h-11 text-base regular:text-sm"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError("");
            }}
            placeholder="Category name"
            disabled={loading}
          />
          {nameError && <p className="text-xs text-destructive mt-1">{nameError}</p>}
        </div>

        {!isRename && (
          <>
            <div>
              <GroupCombobox
                value={group}
                onChange={(g) => {
                  setGroup(g);
                  setGroupError("");
                }}
                options={uniqueGroups}
                placeholder="Group"
                ariaLabel="Group"
                invalid={!!groupError}
              />
              {groupError && <p className="text-xs text-destructive mt-1">{groupError}</p>}
            </div>
            <div>
              <Select items={TYPE_LABELS} value={type} onValueChange={(v) => setType(v ?? "E")}>
                <SelectTrigger aria-label="Type" className="w-full h-11">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="E">Expense</SelectItem>
                  <SelectItem value="I">Income</SelectItem>
                  <SelectItem value="R">Reconciliation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => router.push(returnTo)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || loading}>
            {submitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
