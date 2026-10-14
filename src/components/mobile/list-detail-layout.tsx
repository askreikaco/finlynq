"use client";

/**
 * ListDetailLayout: the split view of every list page that has an edit/create form.
 *
 * It wraps the WHOLE page body (everything under the top bar: toolbar, metric cards, charts, lists), not just the list.
 * wide (>= 1024px, desktop and tablet landscape): a two-column grid, page 2fr | pane 1fr. The pane is a column of the
 * entire page height: sticky below the top bar (offset = header height + safe area + 1rem), as tall as the viewport minus
 * that offset, scrolling inside itself, to the right of everything on the page. The pane renders the SAME form component the
 * /x/new and /x/[id]/edit routes render (`embedded`), selected by `?sel=<id>` / `?sel=new` in the URL.
 * Below wide (phones, portrait tablets): no pane, `list` only; a row tap keeps opening the sheet / edit route as before and ?sel is ignored.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MousePointerClick, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSizeClass } from "@/components/adaptive/size-class-context";
import { PHONE_PRIMARY_CLASS } from "./page-header";
import { PANE_CLASS, SPLIT_GRID_CLASS, parseSel, withSel, type ListSelection } from "@/lib/list-detail/selection";

export interface ListDetailApi {
  /** True from the wide size class up (>= 1024px: desktop, tablet landscape): the pane exists and rows select instead of navigating. */
  split: boolean;
  sel: ListSelection;
  /** The selected item id, or null (none / new). */
  selectedId: string | null;
  isNew: boolean;
  select: (id: string | number) => void;
  selectNew: () => void;
  /** Clear the selection (history entry replaced, so Back does not re-open a deleted item). */
  clear: () => void;
  /** Keep the pane on `id` without adding a history entry (after creating an item). */
  replaceWith: (id: string | number) => void;
}

export function useListDetail(): ListDetailApi {
  const sizeClass = useAppSizeClass();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Wide (>= 1024px), not regular (>= 640px): a 1/3 column at 640-1023px is 190-290px, too narrow for a form.
  const split = sizeClass === "wide";
  const sel = React.useMemo<ListSelection>(
    () => (split ? parseSel(searchParams?.get("sel")) : { kind: "none" }),
    [split, searchParams],
  );
  const search = searchParams?.toString() ?? "";
  const go = React.useCallback(
    (id: string | number | null, replace: boolean) => {
      const href = `${pathname}${withSel(search, id)}`;
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router, search],
  );
  return {
    split,
    sel,
    selectedId: sel.kind === "item" ? sel.id : null,
    isNew: sel.kind === "new",
    select: (id) => go(id, false),
    selectNew: () => go("new", false),
    clear: () => go(null, true),
    replaceWith: (id) => go(id, true),
  };
}

/** The page's primary New action: sets ?sel=new in the split view, still navigates to `href` on phones. */
export function ListDetailNewButton({
  href,
  label,
  className,
  size,
  variant,
  children,
  primary = true,
}: {
  /** The page header's primary action (icon-only cell on phones). false: an ordinary in-page button. */
  primary?: boolean;
  href: string;
  label: string;
  /** Replaces the default "+ label" content (e.g. a label with a screen-reader-only tail). */
  children?: React.ReactNode;
  className?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const { split, selectNew } = useListDetail();
  return (
    <Button
      className={cn(primary && PHONE_PRIMARY_CLASS, className)}
      size={size}
      variant={variant}
      aria-label={label}
      data-slot="list-detail-new"
      render={<Link href={href} />}
      onClick={(e: React.MouseEvent) => {
        if (!split) return;
        e.preventDefault();
        selectNew();
      }}
    >
      {children ?? (
        <>
          <Plus className="mr-1 h-4 w-4" />
          {label}
        </>
      )}
    </Button>
  );
}

export function ListDetailEmptyPane({ newLabel, entity }: { newLabel: string; entity?: string }) {
  const { selectNew } = useListDetail();
  return (
    <div
      data-testid="list-detail-empty"
      data-entity={entity}
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center"
    >
      <MousePointerClick className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">Select an item to edit, or create a new one</p>
      <Button type="button" size="sm" onClick={selectNew}>
        <Plus className="mr-1 h-4 w-4" />
        {newLabel}
      </Button>
    </div>
  );
}

/** What the pane callback receives: the selection api plus the after-save / after-delete behaviour. */
export interface ListDetailPaneApi extends ListDetailApi {
  /**
   * Edit: keep the pane on the item and reload its form from fresh data. Create: select the new item when its id is
   * known, else close the pane (the new row is in the list).
   */
  afterSaved: (id?: string | number) => void;
  /** Close the pane. */
  afterDeleted: () => void;
}

export interface ListDetailLayoutProps {
  /** The whole page body under the top bar (toolbar, cards, lists). It becomes the left 2/3 column at wide. */
  children: React.ReactNode;
  /** The pane body for a selection (rendered at wide only). Keyed by the selection so a new item remounts the form. */
  pane: (api: ListDetailPaneApi) => React.ReactNode;
  /** Label of the New button in the empty pane. */
  newLabel: string;
  entity?: string;
  className?: string;
  /** false: render the list alone (e.g. an account-scoped embed of the same list). Default true. */
  enabled?: boolean;
}

export function ListDetailLayout({ children, pane, newLabel, entity, className, enabled = true }: ListDetailLayoutProps) {
  const api = useListDetail();
  const [rev, setRev] = React.useState(0);
  if (!api.split || !enabled) return <>{children}</>;
  const paneApi: ListDetailPaneApi = {
    ...api,
    afterSaved: (id) => {
      if (api.sel.kind === "new") {
        if (id !== undefined && id !== null) api.replaceWith(id);
        else api.clear();
      } else setRev((n) => n + 1);
    },
    afterDeleted: api.clear,
  };
  return (
    <div data-slot="list-detail" data-entity={entity} className={cn(SPLIT_GRID_CLASS, className)}>
      <div data-slot="list-detail-main" className="min-w-0 space-y-6">
        {children}
      </div>
      <aside
        data-slot="list-detail-pane"
        data-testid="list-detail-pane"
        aria-label="Details"
        className={cn(PANE_CLASS, "min-w-0 rounded-xl border bg-card p-4")}
      >
        {api.sel.kind === "none" ? (
          <ListDetailEmptyPane newLabel={newLabel} entity={entity} />
        ) : (
          <React.Fragment key={`${api.sel.kind === "new" ? "new" : api.sel.id}:${rev}`}>{pane(paneApi)}</React.Fragment>
        )}
      </aside>
    </div>
  );
}
