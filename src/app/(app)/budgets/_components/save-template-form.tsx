"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { Budget } from "./budget-types";

/** Save the month's current budget rows as a named template. Rendered by /budgets/templates/new. */
export function SaveTemplateForm({ budgets, onSaved }: { budgets: Budget[]; onSaved: () => void }) {
  const [templateName, setTemplateName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSaveTemplate() {
    if (!templateName.trim() || budgets.length === 0) return;
    setSubmitting(true);
    try {
      for (const b of budgets) {
        await fetch("/api/budget-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: templateName.trim(),
            categoryId: b.categoryId,
            amount: b.amount,
          }),
        });
      }
      setTemplateName("");
      onSaved();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSaveTemplate();
      }}
    >
      <Field
        label="Template Name"
        value={templateName}
        onChange={(e) => setTemplateName(e.target.value)}
        placeholder="e.g. Monthly Essentials"
      />
      <p className="text-sm text-muted-foreground">
        This will save all {budgets.length} budget items as a reusable template.
      </p>
      <Button type="submit" className="w-full" disabled={!templateName.trim() || submitting}>
        Save Template
      </Button>
    </form>
  );
}
