"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/mobile/list-row";
import { Badge } from "@/components/ui/badge";
import { BookTemplate, FileText, Pencil, Trash2 } from "lucide-react";
import type { ImportTemplate } from "@/lib/import-templates";
import { EditTemplateDialog } from "./edit-template-dialog";

interface TemplateManagerProps {
  templates: ImportTemplate[];
  accounts: string[];
  onDeleted: (id: number) => void;
  onUpdated: (template: ImportTemplate) => void;
}

export function TemplateManager({ templates, accounts, onDeleted, onUpdated }: TemplateManagerProps) {
  const [editing, setEditing] = useState<ImportTemplate | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const deleteTemplate = async (id: number) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/import/templates/${id}`, { method: "DELETE" });
      if (res.ok) onDeleted(id);
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <BookTemplate className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No saved templates yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a CSV and click &quot;Save as Template&quot; to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle icon={FileText} tone="muted">Saved Templates ({templates.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            {templates.map((t) => (
              <ListRow
                key={t.id}
                title={t.name}
                subtitle={
                  <>
                    {t.fileHeaders.length} headers
                    {t.defaultAccount && <> · {t.defaultAccount}</>}
                    {t.isDefault && <> · <Badge variant="secondary" className="text-xs px-1 py-0">default</Badge></>}
                  </>
                }
                actions={
                  <>
                    <Button aria-label="Edit template" iconOnly variant="ghost" className="h-7 w-7" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button aria-label="Delete template"
                      iconOnly
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => deleteTemplate(t.id)}
                      disabled={deleting === t.id}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </>
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <EditTemplateDialog
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        template={editing}
        accounts={accounts}
        onSaved={(updated) => {
          onUpdated(updated);
          setEditing(null);
        }}
      />
    </>
  );
}
