"use client";

/**
 * ListDetailLayout: the split view of every list page that has an edit/create form (and, optionally, a detail page).
 *
 * It wraps the WHOLE page body (everything under the top bar: toolbar, metric cards, charts, lists), not just the list.
 * wide (>= 1024px, desktop and tablet landscape): a two-column grid, page 3fr | pane 1fr (pane 25%). The pane is a column of the
 * entire page height: sticky below the top bar (offset = header height + safe area + 1rem), as tall as the viewport minus
 * that offset, scrolling inside itself, to the right of everything on the page. The pane renders the SAME form component the
 * /x/new and /x/[id]/edit routes render (`embedded`), selected by `?sel=<id>` / `?sel=new` in the URL.
 * Below wide (phones, portrait tablets): no pane, `list` only; a row tap keeps opening the sheet / edit route as before and ?sel is ignored.
 *
 * DETAIL FIRST (opt-in per page): pass `renderDetail(id, api)`. Then `?sel=<id>` shows the item's DETAIL page content in the pane
 * (the same embeddable component its /x/[id] route renders, `embedded`), under a pane header: title, Edit, close (X).
 * Edit sets `?mode=edit` and the pane shows the form (`renderForm`, or the older `pane`); Save / Cancel go back to the detail view.
 * `?sel=new` always shows the form. Without `renderDetail` the pane shows the form for `?sel=<id>` as before (fallback).
 *
 * Props: renderForm(api) | pane(api) = form body (create or edit; renderForm wins). renderDetail(id, api) = detail body, its
 * presence turns detail-first on. detailTitle = header title until the detail calls usePaneTitle(name) (default "Details").
 * detailHref(id) = "Open page" link to the full route in the header.
 * api (ListDetailPaneApi): sel, selectedId, isNew, mode ("view" | "edit"), edit(), view(), select(), selectNew(), clear(),
 * afterSaved(id?) (create: select the new item on its detail; edit: back to the detail view with fresh data), afterDeleted(),
 * cancel() (create: close; edit: back to the detail view when there is one, else close).
 */
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, MousePointerClick, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoundIconButton } from "@/components/ui/round-icon-button";
import { cn } from "@/lib/utils";
import { useAppSizeClass } from "@/components/adaptive/size-class-context";
import { PHONE_PRIMARY_CLASS } from "./page-header";
import { PANE_CLASS, SPLIT_GRID_CLASS, parseMode, parseSel, withMode, withSel, type ListSelection, type PaneMode } from "@/lib/list-detail/selection";

export interface ListDetailApi {
  /** True from the wide size class up (>= 1024px: desktop, tablet landscape): the pane exists and rows select instead of navigating. */
  split: boolean;
  sel: ListSelection;
  /** The selected item id, or null (none / new). */
  selectedId: string | null;
  isNew: boolean;
  select: (id: string | number) => void;
  selectNew: () => void;
  /** "edit" when the selected item's edit form is open (?mode=edit), else "view" (its detail page). Always "view" without an item. */
  mode: PaneMode;
  /** Open the selected item's edit form (adds a history entry). */
  edit: () => void;
  /** Back to the selected item's detail view (history entry replaced). */
  view: () => void;
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
  const mode = React.useMemo<PaneMode>(
    () => (sel.kind === "item" ? parseMode(searchParams?.get("mode")) : "view"),
    [sel, searchParams],
  );
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
    mode,
    edit: () => router.push(`${pathname}${withMode(search, "edit")}`, { scroll: false }),
    view: () => router.replace(`${pathname}${withMode(search, "view")}`, { scroll: false }),
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

/** What the pane callbacks receive: the selection api plus the after-save / after-delete behaviour. */
export interface ListDetailPaneApi extends ListDetailApi {
  /**
   * Edit: fresh data; back to the detail view when the page has one, else stay on the form. Create: select the new item
   * (its detail view) when its id is known, else close the pane (the new row is in the list).
   */
  afterSaved: (id?: string | number) => void;
  /** Close the pane. */
  afterDeleted: () => void;
  /** Cancel the form: create closes the pane; edit goes back to the detail view when the page has one, else closes the pane. */
  cancel: () => void;
}

export interface ListDetailLayoutProps {
  /** The whole page body under the top bar (toolbar, cards, lists). It becomes the left 3/4 column at wide. */
  children: React.ReactNode;
  /** The form body (create, or edit) for a selection (rendered at wide only). Keyed by the selection so a new item remounts it. */
  renderForm?: (api: ListDetailPaneApi) => React.ReactNode;
  /** Older name of `renderForm`. */
  pane?: (api: ListDetailPaneApi) => React.ReactNode;
  /** The detail body of an item. Present = detail-first: `?sel=<id>` shows it, Edit opens the form. */
  renderDetail?: (id: string, api: ListDetailPaneApi) => React.ReactNode;
  /** Pane header title until the detail sets its own via usePaneTitle. Default "Details". */
  detailTitle?: string;
  /** Full detail route of an item: shows an "Open page" link in the pane header. */
  detailHref?: (id: string) => string;
  /** Label of the New button in the empty pane. */
  newLabel: string;
  entity?: string;
  className?: string;
  /** false: render the list alone (e.g. an account-scoped embed of the same list). Default true. */
  enabled?: boolean;
}

const PaneChromeContext = React.createContext<{ setTitle: (t: string | null) => void } | null>(null);

/** Called by an embedded detail: sets the pane header title (e.g. the account name). No-op outside a pane. */
export function usePaneTitle(title: string | null | undefined): void {
  const ctx = React.useContext(PaneChromeContext);
  const setTitle = ctx?.setTitle;
  React.useEffect(() => {
    setTitle?.(title ?? null);
  }, [setTitle, title]);
}

export function ListDetailLayout({
  children, renderForm, pane, renderDetail, detailTitle = "Details", detailHref, newLabel, entity, className, enabled = true,
}: ListDetailLayoutProps) {
  const api = useListDetail();
  const [rev, setRev] = React.useState(0);
  const selKey = api.sel.kind === "new" ? "new" : api.sel.kind === "item" ? api.sel.id : "";
  // The title is tied to the selection it was set for, so a new selection never shows the previous item's name while it loads.
  const [titleState, setTitleState] = React.useState<{ key: string; title: string | null }>({ key: "", title: null });
  const chrome = React.useMemo(() => ({ setTitle: (t: string | null) => setTitleState({ key: selKey, title: t }) }), [selKey]);
  const title = titleState.key === selKey ? titleState.title : null;
  if (!api.split || !enabled) return <>{children}</>;
  const hasDetail = !!renderDetail;
  const showDetail = hasDetail && api.sel.kind === "item" && api.mode !== "edit";
  const paneApi: ListDetailPaneApi = {
    ...api,
    afterSaved: (id) => {
      if (api.sel.kind === "new") {
        if (id !== undefined && id !== null) api.replaceWith(id);
        else api.clear();
      } else {
        setRev((n) => n + 1);
        if (hasDetail && api.mode === "edit") api.view();
      }
    },
    afterDeleted: api.clear,
    cancel: () => (hasDetail && api.sel.kind === "item" ? api.view() : api.clear()),
  };
  const form = renderForm ?? pane;
  return (
    <div data-slot="list-detail" data-entity={entity} className={cn(SPLIT_GRID_CLASS, className)}>
      <div data-slot="list-detail-main" className="min-w-0 space-y-6">
        {children}
      </div>
      <aside
        data-slot="list-detail-pane"
        data-testid="list-detail-pane"
        data-pane-view={showDetail ? "detail" : api.sel.kind === "none" ? "empty" : "form"}
        aria-label="Details"
        className={cn(PANE_CLASS, "min-w-0 rounded-xl border bg-card p-4")}
      >
        {api.sel.kind === "none" ? (
          <ListDetailEmptyPane newLabel={newLabel} entity={entity} />
        ) : showDetail && api.sel.kind === "item" ? (
          <PaneChromeContext.Provider value={chrome}>
            <div data-slot="list-detail-pane-header" className="flex items-center justify-between gap-2 pb-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">{title ?? detailTitle}</h2>
                {detailHref ? (
                  <Link href={detailHref(api.sel.id)} className="inline-flex items-center gap-1 text-xs text-primary underline">
                    Open page <ExternalLink className="size-3" aria-hidden />
                  </Link>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <RoundIconButton aria-label="Edit" title="Edit" data-slot="list-detail-edit" onClick={api.edit}>
                  <Pencil className="size-4" />
                </RoundIconButton>
                <RoundIconButton aria-label="Close" title="Close" data-slot="list-detail-close" onClick={api.clear}>
                  <X className="size-4" />
                </RoundIconButton>
              </div>
            </div>
            <React.Fragment key={`${api.sel.id}:${rev}`}>{renderDetail!(api.sel.id, paneApi)}</React.Fragment>
          </PaneChromeContext.Provider>
        ) : (
          <React.Fragment key={`${api.sel.kind === "new" ? "new" : api.sel.id}:${api.mode}:${rev}`}>{form?.(paneApi)}</React.Fragment>
        )}
      </aside>
    </div>
  );
}
