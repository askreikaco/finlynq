"use client";

/**
 * Category list: type sections, group sub-headers, delete. Add and rename are
 * full pages (/categories/new, /categories/[id]/edit), not inline forms.
 * Used by the merged categories hub (Manage tab) and /settings/categorization.
 * `returnTo` is where the create/rename pages send the user back to.
 */

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { usePendingEntity } from "@/lib/data/local-write-queue";
import { overlayRows } from "@/lib/data/local-write-queue";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Pencil, Plus, Tag, Tags, Trash2 } from "lucide-react";
import Link from "next/link";
import { ListDetailLayout, ListDetailNewButton, useListDetail } from "@/components/mobile";
import { CategoryFormPanel } from "./category-form-panel";

const TYPE_LABELS = { E: "Expense", I: "Income", R: "Reconciliation" } as const;
const TYPE_ORDER = ["E", "I", "R"] as const;

type Category = { id: number; type: string; group: string; name: string; note: string };

/** The split view reads ?sel from the URL, so the list needs a Suspense boundary wherever it is mounted. */
export function CategoryManagement({ returnTo }: { returnTo: string }) {
  return (
    <Suspense fallback={null}>
      <CategoryManagementInner returnTo={returnTo} />
    </Suspense>
  );
}

function CategoryManagementInner({ returnTo }: { returnTo: string }) {
  const [serverCategories, setServerCategories] = useState<Category[]>([]);
  const [catError, setCatError] = useState("");
  // Split view (regular+): the pencil opens the rename form in the pane (?sel=<id>); phones keep the page links.
  const detail = useListDetail();

  const loadCategories = useCallback(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setServerCategories(Array.isArray(d) ? d : []))
      .catch(() => {
        setServerCategories([]);
        setCatError("Failed to load categories");
      });
  }, []);

  // Offline queue (local-first L3): queued category renames over the server rows. Flag off = the rows as they are.
  const pending = usePendingEntity("category", loadCategories);
  const categories = useMemo(
    () => overlayRows(serverCategories, pending, { patchOf: (f) => ({ ...(f.name != null ? { name: String(f.name) } : {}) }) as Partial<Category> }),
    [serverCategories, pending],
  );

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  async function handleDeleteCategory(id: number) {
    setCatError("");
    try {
      const res = await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setCatError(data.error || "Failed to delete");
        return;
      }
      loadCategories();
    } catch {
      setCatError("Failed to delete category");
    }
  }

  const sections = TYPE_ORDER.map((t) => {
    const inType = categories.filter((c) => c.type === t);
    const byGroup = new Map<string, Category[]>();
    inType.forEach((c) => byGroup.set(c.group || "", [...(byGroup.get(c.group || "") ?? []), c]));
    const groups = Array.from(byGroup.entries()).sort(
      ([a], [b]) => (a === "" ? -1 : b === "" ? 1 : (a ?? "").localeCompare(b ?? ""))
    );
    return { type: t, groups };
  }).filter((s) => s.groups.length > 0);

  const newHref = `/categories/new?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Category Management</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage transaction categories. Auto-categorization rules live in{" "}
          <Link href="/settings/rules" className="underline hover:text-foreground">
            Rules
          </Link>
          .
        </p>
      </div>

      <ListDetailLayout
        entity="category"
        newLabel="Add category"
        list={
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos/10 text-pos">
                    <Tag className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle icon={Tags} tone="indigo">Categories</CardTitle>
                    <CardDescription>Manage transaction categories</CardDescription>
                  </div>
                </div>
                <ListDetailNewButton href={newHref} label="Add" variant="outline" size="sm" primary={false}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </ListDetailNewButton>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {catError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {catError}
                </div>
              )}

              {sections.map(({ type, groups }) => (
                <section key={type} data-testid={`type-section-${type}`} aria-label={TYPE_LABELS[type]}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{TYPE_LABELS[type]}</h3>
                  <div data-slot="category-manage-groups" data-split-grid className="grid grid-cols-1 items-start gap-2 regular:grid-cols-2 wide:grid-cols-3">
                    {groups.map(([group, cats]) => (
                      <div key={group || "__none"}>
                        {group && <h4 className="text-xs text-muted-foreground/80 px-3 mb-1">{group}</h4>}
                        <div className="space-y-1">
                          {cats.map((cat) => (
                            <div
                              key={cat.id}
                              data-selected={detail.selectedId === String(cat.id) ? "true" : undefined}
                              className={`flex items-center justify-between rounded-lg px-3 py-2 min-h-row regular:min-h-0 hover:bg-muted/50 transition-colors group${detail.selectedId === String(cat.id) ? " bg-muted" : ""}`}
                            >
                              <span className="text-sm">{cat.name}</span>
                              <div className="flex gap-1 regular:opacity-0 regular:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                {detail.split ? (
                                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit category" onClick={() => detail.select(cat.id)}>
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                ) : (
                                  <Link
                                    href={`/categories/${cat.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                                    aria-label="Edit category"
                                    className={buttonVariants({ variant: "ghost", size: "icon", className: "h-7 w-7" })}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Link>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => handleDeleteCategory(cat.id)}
                                  aria-label="Delete category"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {categories.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No categories found</p>}
            </CardContent>
          </Card>
        }
        pane={(api) => (
          <CategoryFormPanel
            embedded
            mode={api.isNew ? "create" : "edit"}
            id={api.selectedId ?? undefined}
            onSaved={() => { loadCategories(); api.afterSaved(); }}
            onCancel={api.clear}
            onDeleted={() => { loadCategories(); api.afterDeleted(); }}
          />
        )}
      />
    </div>
  );
}
