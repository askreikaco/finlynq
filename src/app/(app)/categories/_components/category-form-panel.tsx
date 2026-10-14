"use client";

/**
 * CategoryFormPanel: THE category create / rename form. /categories/new and /categories/[id]/edit render it as a page;
 * the Manage tab's split view renders it `embedded` in the pane. One component (FormPage + CategoryForm): same fields,
 * requests, offline queue and delete confirm in both.
 */
import { FormPage, type FormPageEmbedded } from "@/components/templates/form-page";
import { CategoryForm, CATEGORY_RETURN_FALLBACK } from "./category-form";

type CategoryRow = { id: number; type: string; group: string; name: string; note: string };

export interface CategoryFormPanelProps {
  mode: "create" | "edit";
  /** Pane only: the category id (the routes read it from the URL). */
  id?: string;
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

function toEmbedded(p: CategoryFormPanelProps): FormPageEmbedded | undefined {
  return p.embedded ? { id: p.id, onSaved: p.onSaved, onCancel: p.onCancel, onDeleted: p.onDeleted } : undefined;
}

function CreateCategory(props: CategoryFormPanelProps) {
  return (
    <FormPage
      id="category-form"
      entity="category"
      embedded={toEmbedded(props)}
      title="New category"
      fallbackReturn={CATEGORY_RETURN_FALLBACK}
      form="external"
      padBottom="none"
      header={{ actions: null }}
    >
      {(ctx) => <CategoryForm mode="create" chrome={false} compact={ctx.embedded} onSaved={ctx.embedded ? ctx.finish : undefined} onCancel={ctx.embedded ? ctx.cancel : undefined} />}
    </FormPage>
  );
}

function RenameCategory(props: CategoryFormPanelProps) {
  return (
    <FormPage
      id="category-form"
      entity="category"
      embedded={toEmbedded(props)}
      title="Rename category"
      fallbackReturn={CATEGORY_RETURN_FALLBACK}
      form="external"
      padBottom="none"
      header={{ actions: null }}
      load={{
        key: "/api/categories",
        select: (list: CategoryRow[], id) => (Array.isArray(list) ? list.find((c) => c.id === Number(id)) : undefined),
        notFound: { message: "Category not found", linkLabel: "Back" },
      }}
      // The rename page never had a Delete (the list does); the pane carries it so the pane is the whole row's actions.
      delete={props.embedded ? {
        label: "Delete category",
        headerLabel: "Delete",
        confirmTitle: "Delete category",
        confirmLabel: "Delete category",
        describe: (cat) => <>Delete the category <strong>{cat.name}</strong>? Categories that are in use cannot be deleted.</>,
        request: (cat) => fetch(`/api/categories?id=${cat.id}`, { method: "DELETE" }),
        after: "returnTo",
      } : undefined}
    >
      {(ctx) =>
        ctx.record ? (
          <CategoryForm
            mode="rename"
            categoryId={ctx.record.id}
            chrome={false}
            compact={ctx.embedded}
            onSaved={ctx.embedded ? ctx.finish : undefined}
            onCancel={ctx.embedded ? ctx.cancel : undefined}
          />
        ) : null
      }
    </FormPage>
  );
}

export function CategoryFormPanel(props: CategoryFormPanelProps) {
  return props.mode === "edit" ? <RenameCategory {...props} /> : <CreateCategory {...props} />;
}
