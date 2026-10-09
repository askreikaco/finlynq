"use client";

/**
 * Category list: type sections, group sub-headers, delete. Add and rename are
 * full pages (/categories/new, /categories/[id]/edit), not inline forms.
 * Used by the merged categories hub (Manage tab) and /settings/categorization.
 * `returnTo` is where the create/rename pages send the user back to.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tag, Plus, AlertTriangle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

const TYPE_LABELS = { E: "Expense", I: "Income", R: "Reconciliation" } as const;
const TYPE_ORDER = ["E", "I", "R"] as const;

type Category = { id: number; type: string; group: string; name: string; note: string };

export function CategoryManagement({ returnTo }: { returnTo: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [catError, setCatError] = useState("");

  const loadCategories = useCallback(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {
        setCategories([]);
        setCatError("Failed to load categories");
      });
  }, []);

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos/10 text-pos">
                <Tag className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Categories</CardTitle>
                <CardDescription>Manage transaction categories</CardDescription>
              </div>
            </div>
            <Link href={newHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Link>
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
              <div className="space-y-2">
                {groups.map(([group, cats]) => (
                  <div key={group || "__none"}>
                    {group && <h4 className="text-xs text-muted-foreground/80 px-3 mb-1">{group}</h4>}
                    <div className="space-y-1">
                      {cats.map((cat) => (
                        <div key={cat.id} className="flex items-center justify-between rounded-lg px-3 py-2 min-h-11 md:min-h-0 hover:bg-muted/50 transition-colors group">
                          <span className="text-sm">{cat.name}</span>
                          <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <Link
                              href={`/categories/${cat.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                              aria-label="Edit category"
                              className={buttonVariants({ variant: "ghost", size: "icon", className: "h-7 w-7" })}
                            >
                              <Pencil className="h-3 w-3" />
                            </Link>
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
    </div>
  );
}
