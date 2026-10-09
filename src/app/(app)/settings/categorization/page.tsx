"use client";

/**
 * /settings/categorization — Category Management ONLY.
 *
 * FINLYNQ-84 (2026-05-21) moved Transaction Rules out of this page into the
 * dedicated `/settings/rules` sub-page. The legacy single-field rule UI
 * (matchField/matchType/matchValue + assignCategoryId/assignTags/renameTo)
 * is gone — the new editor supports multi-condition rules + 7 action kinds.
 * See `pf-app/src/app/(app)/settings/rules/page.tsx` and
 * `pf-app/docs/transaction-rules-v2.md`.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GroupCombobox } from "@/components/ui/group-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag, Plus, AlertTriangle, Pencil, Trash2, Check, X } from "lucide-react";
import { PageHeader } from "@/components/mobile";

const TYPE_LABELS = { E: "Expense", I: "Income", R: "Reconciliation" } as const;
const TYPE_ORDER = ["E", "I", "R"] as const;

type Category = { id: number; type: string; group: string; name: string; note: string };

export default function CategorizationSettingsPage() {
  // Category management
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [catError, setCatError] = useState("");
  const [newCatForm, setNewCatForm] = useState({ name: "", type: "E", group: "" });
  const [newCatErrors, setNewCatErrors] = useState<{ name?: string; group?: string }>({});
  const [showAddCat, setShowAddCat] = useState(false);

  // Load categories
  const loadCategories = useCallback(() => {
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {
        setCategories([]);
        setCatError("Failed to load categories");
      });
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Category CRUD
  async function handleEditCategory(id: number) {
    if (!editName.trim()) return;
    setCatError("");
    try {
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: editName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCatError(data.error || "Failed to update");
        return;
      }
      setEditingId(null);
      setEditName("");
      loadCategories();
    } catch {
      setCatError("Failed to update category");
    }
  }

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

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const errs: { name?: string; group?: string } = {};
    if (!newCatForm.name.trim()) errs.name = "Name is required";
    setNewCatErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setCatError("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatForm.name.trim(), type: newCatForm.type, group: newCatForm.group.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCatError(data.error || "Failed to create");
        return;
      }
      setNewCatForm({ name: "", type: "E", group: "" });
      setNewCatErrors({});
      setShowAddCat(false);
      loadCategories();
    } catch {
      setCatError("Failed to create category");
    }
  }

  // Sections by type (E, I, R); inside each, ungrouped first then groups A-Z.
  const sections = TYPE_ORDER.map((t) => {
    const inType = categories.filter((c) => c.type === t);
    const byGroup = new Map<string, Category[]>();
    inType.forEach((c) => byGroup.set(c.group || "", [...(byGroup.get(c.group || "") ?? []), c]));
    const groups = Array.from(byGroup.entries()).sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : (a ?? "").localeCompare(b ?? "")));
    return { type: t, groups };
  }).filter((s) => s.groups.length > 0);

  // Get unique groups for the add form
  const uniqueGroups = Array.from(new Set(categories.map((c) => c.group).filter(Boolean))).sort((a, b) => (a ?? "").localeCompare(b ?? ""));

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
          title="Categories"
          titleClassName="text-2xl font-bold tracking-tight"
          subtitle={<>Manage transaction categories. Auto-categorization rules live in <a href="/settings/rules" className="underline hover:text-foreground">Rules</a>.</>}
          subtitleClassName="text-sm text-muted-foreground mt-0.5"
        />

      {/* Category Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pos/10 text-pos">
                <Tag className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Category Management</CardTitle>
                <CardDescription>Manage transaction categories</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowAddCat(!showAddCat)}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {catError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {catError}
            </div>
          )}

          {/* Add category form */}
          {showAddCat && (
            <form onSubmit={handleAddCategory} className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Input aria-label="Category name" aria-invalid={!!newCatErrors.name || undefined} className="h-11 md:h-8 text-base md:text-sm" value={newCatForm.name} onChange={(e) => { setNewCatForm({ ...newCatForm, name: e.target.value }); setNewCatErrors({ ...newCatErrors, name: "" }); }} placeholder="Category name" />
                  {newCatErrors.name && <p className="text-xs text-destructive mt-1">{newCatErrors.name}</p>}
                </div>
                <div>
                  <GroupCombobox
                    value={newCatForm.group}
                    onChange={(g) => { setNewCatForm({ ...newCatForm, group: g }); setNewCatErrors({ ...newCatErrors, group: "" }); }}
                    options={uniqueGroups}
                    placeholder="Group"
                    ariaLabel="Group"
                    invalid={!!newCatErrors.group}
                  />
                  {newCatErrors.group && <p className="text-xs text-destructive mt-1">{newCatErrors.group}</p>}
                </div>
                <div>
                  <Select items={TYPE_LABELS} value={newCatForm.type} onValueChange={(v) => setNewCatForm({ ...newCatForm, type: v ?? "E" })}>
                    <SelectTrigger aria-label="Type" className="w-full h-11 md:h-8"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="E">Expense</SelectItem>
                      <SelectItem value="I">Income</SelectItem>
                      <SelectItem value="R">Reconciliation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">Add Category</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setShowAddCat(false); setNewCatErrors({}); }}>Cancel</Button>
              </div>
            </form>
          )}

          {/* Category list: type sections, group sub-headers */}
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
                    {editingId === cat.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleEditCategory(cat.id);
                            if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditCategory(cat.id)} aria-label="Save category name">
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(null); setEditName(""); }} aria-label="Cancel editing">
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm">{cat.name}</span>
                        <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(cat.id); setEditName(cat.name); setCatError(""); }} aria-label="Edit category">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteCategory(cat.id)} aria-label="Delete category">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No categories found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
