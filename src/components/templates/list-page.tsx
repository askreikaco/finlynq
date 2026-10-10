"use client";

/**
 * ListPage: the chrome of a list screen (spec 2.2, C-07).
 *
 * Owns: Suspense, PageHeader with the primary Add action, the summary MetricGrid,
 * the ViewModeToggle + DataView (cards / list), skeleton, error and empty states,
 * the delete confirm (useDeleteFlow + ConfirmDialog), and the `${id}-root` testid.
 * A page passes its data source, its empty copy and two view renderers.
 *
 *   <ListPage
 *     id="goals"
 *     title="Goals"
 *     add={{ label: "Add Goal", href: "/goals/new" }}
 *     viewKey="goals"
 *     load={{ key: "/api/goals" }}
 *     summary={(goals) => [{ label: "Total Target", value: 1 }]}
 *     empty={{ title: "Set your first goal", body: "Goals help you ..." }}
 *     cards={({ records, openDelete }) => <GoalCards ... />}
 *     list={({ records, openDelete }) => <GoalTable ... />}
 *     deleteFlow={{ confirmTitle: "Delete goal", describe: (g) => g.name, request: (g) => fetch(...) }}
 *   />
 *
 * Variant props (all optional; omitted = the markup above):
 * - `useLoad` replaces `load`: a hook returning LoadState<T[], X> (lib/forms/load-state).
 * - `states.loading|error.chrome: false` renders that state bare (no root, no header).
 * - `summarySlot`, `emptySlot`, `body` replace the summary grid, empty card, and toggle+DataView.
 * - `toolbarPlacement`, `header`, `stack`, `loadingNode`, `skeletonRows`, `suspenseRows`.
 */
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader, PHONE_PRIMARY_CLASS, type OverflowAction } from "@/components/mobile/page-header";
import { MetricGrid, type MetricItem } from "@/components/mobile/metric-grid";
import { DataView } from "@/components/adaptive/data-view";
import { ViewModeToggle, type ViewKey } from "@/components/adaptive/view-mode";
import { useApi } from "@/lib/data/use-api";
import { useDeleteFlow } from "@/lib/forms/use-delete-flow";
import type { LoadState } from "@/lib/forms/load-state";

/** What a view renderer receives. `openDelete` starts the confirm for a row. */
export interface ListPageContext<T, X = unknown> {
  records: T[];
  openDelete: (record: T) => void;
  /** Re-fetch the list (after a page-level write such as a status toggle). */
  reload: () => void;
  /** Extra data from `useLoad` (undefined on the `load` path). */
  extra?: X;
}

export type ListPageView<T, X = unknown> = ReactNode | ((ctx: ListPageContext<T, X>) => ReactNode);

/** `useLoad` hook: lists have no route params, so it takes no arguments. */
export type ListPageLoadHook<T, X = unknown> = () => LoadState<T[], X>;

export interface ListPageProps<T, D = T[], X = unknown> {
  /** Root testid prefix: the root renders as `data-testid="<id>-root"`. */
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Primary Add action in the header (phone: PHONE_PRIMARY_CLASS). The page also feeds the FAB from its route entry. */
  add?: { label: string; href: string };
  /** Summary stat cards. A function gets the loaded records; the grid is hidden while the list is empty. */
  summary?: MetricItem[] | ((records: T[]) => MetricItem[]);
  viewKey: ViewKey;
  /** Cards view (phone default). Only the selected view is mounted. */
  cards: ListPageView<T, X>;
  /** List view (table). Only the selected view is mounted. */
  list: ListPageView<T, X>;
  /** SWR key for the list. `select` picks the records out of the response (default: the array itself). Ignored when `useLoad` is set. */
  load?: { key: string | null; select?: (data: D) => T[] };
  /** Replaces the `load` path: the hook owns the fetch and returns records as `record`. */
  useLoad?: ListPageLoadHook<T, X>;
  /** Shown in place of the views when there are no records. */
  empty: { title: string; body: string; cta?: { label: string; href: string } };
  /** Skeleton shape while loading. Default "cards". */
  skeleton?: "cards" | "list";
  /** Rows in the loading skeleton. Default 3. */
  skeletonRows?: number;
  /** Rows in the Suspense fallback skeleton. Default 3. */
  suspenseRows?: number;
  /** Custom loading node (replaces the skeleton, also as the Suspense fallback). */
  loadingNode?: ReactNode;
  /** Error copy. Retry re-fetches the list. */
  error?: { title?: string; message?: string };
  /** Controls rendered left of the ViewModeToggle (filters, search). */
  toolbar?: ReactNode;
  /**
   * Where the toolbar and toggle sit. "row" (default): toolbar left, toggle right.
   * "end": both right-aligned. "none": no toolbar row and no toggle.
   */
  toolbarPlacement?: "row" | "end" | "none";
  /** Replaces the MetricGrid when records are present. */
  summarySlot?: (records: T[]) => ReactNode;
  /** Replaces the dashed empty Card. */
  emptySlot?: (ctx: ListPageContext<T, X>) => ReactNode;
  /** Replaces ViewModeToggle + DataView (grouped or accordion lists). The toggle is hidden. */
  body?: ListPageView<T, X>;
  /** Header overrides. `actions` replaces the Add button (null hides it). */
  header?: {
    className?: string;
    actionsClassName?: string;
    actions?: ReactNode;
    overflow?: OverflowAction[];
  };
  /** Vertical gap between the root children. Default "6". */
  stack?: "6" | "5" | "4";
  /** Per-state chrome. chrome false = the state node renders bare (no root, no header). */
  states?: {
    loading?: { chrome?: boolean };
    error?: { chrome?: boolean };
  };
  /** Confirm-then-delete for a row. `label` is the confirm button text. */
  deleteFlow?: {
    label: string;
    confirmTitle: string;
    describe: (record: T) => ReactNode;
    request: (record: T) => Promise<Response>;
    fallback?: string;
    /** Close the confirm on failure and keep the error (loans/subscriptions). Default true. */
    keepOpenOnError?: boolean;
    /** Any resolved Response counts as success (goals). Default false. */
    ignoreStatus?: boolean;
    /** Fixed failure copy instead of the parsed server message. */
    errorMessage?: string;
    /** "note" (default) = mt-2 paragraph; "inline" = text-sm paragraph. */
    errorStyle?: "note" | "inline";
  };
}

const STACK_CLASS: Record<"6" | "5" | "4", string> = {
  "6": "space-y-6",
  "5": "space-y-5",
  "4": "space-y-4",
};

function defaultSelect<T, D>(data: D): T[] {
  return Array.isArray(data) ? (data as unknown as T[]) : [];
}

function noLoad<T, X>(): LoadState<T[], X> {
  return { status: "loading", retry: () => {} };
}

export function ListPage<T, D = T[], X = unknown>({
  id,
  title,
  subtitle,
  add,
  summary,
  viewKey,
  cards,
  list,
  load,
  useLoad,
  empty,
  skeleton = "cards",
  skeletonRows = 3,
  suspenseRows = 3,
  loadingNode,
  error,
  toolbar,
  toolbarPlacement = "row",
  summarySlot,
  emptySlot,
  body,
  header,
  stack = "6",
  states,
  deleteFlow,
}: ListPageProps<T, D, X>) {
  const swr = useApi<D>(useLoad ? null : (load?.key ?? null));
  const ext = (useLoad ?? noLoad<T, X>)();
  const select = load?.select ?? defaultSelect<T, D>;
  const swrRecords: T[] = swr.data === undefined ? [] : select(swr.data);
  const records: T[] = useLoad ? (ext.record ?? []) : swrRecords;
  const loading = useLoad ? ext.status === "loading" : swr.data === undefined && swr.error === undefined;
  const failed = useLoad ? ext.status === "error" : swr.data === undefined && swr.error !== undefined;

  const reload = () => {
    if (useLoad) ext.retry();
    else void swr.mutate();
  };

  const del = useDeleteFlow<T>({
    request: (rec) => (deleteFlow ? deleteFlow.request(rec) : Promise.reject(new Error("no deleteFlow"))),
    onDeleted: () => reload(),
    fallback: deleteFlow?.fallback,
    keepOpenOnError: deleteFlow?.keepOpenOnError,
    ignoreStatus: deleteFlow?.ignoreStatus,
    errorMessage: deleteFlow?.errorMessage,
  });

  const ctx: ListPageContext<T, X> = { records, openDelete: (rec) => del.open(rec), reload, extra: ext.extra };
  const renderView = (view: ListPageView<T, X>): ReactNode => (typeof view === "function" ? view(ctx) : view);
  const summaryMetrics = typeof summary === "function" ? summary(records) : summary;
  const skeletonNode = loadingNode ?? <PageSkeleton variant={skeleton} rows={skeletonRows} />;

  const toggleNode = body === undefined && toolbarPlacement !== "none" ? <ViewModeToggle viewKey={viewKey} /> : null;
  let toolbarRegion: ReactNode = null;
  if (toolbarPlacement === "end") {
    toolbarRegion = (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {toolbar}
        {toggleNode}
      </div>
    );
  } else if (toolbarPlacement === "row") {
    toolbarRegion = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
        {toggleNode}
      </div>
    );
  }

  const bareLoading = states?.loading?.chrome === false;
  const bareError = states?.error?.chrome === false;

  let bodyNode: ReactNode;
  if (loading) {
    if (bareLoading) return skeletonNode;
    bodyNode = skeletonNode;
  } else if (failed) {
    const errorNode = (
      <ErrorState
        title={error?.title ?? `Couldn't load ${typeof title === "string" ? title.toLowerCase() : "this list"}`}
        message={error?.message ?? "We couldn't load this list. Please try again."}
        onRetry={reload}
      />
    );
    if (bareError) return errorNode;
    bodyNode = errorNode;
  } else if (records.length === 0) {
    bodyNode = emptySlot ? (
      emptySlot(ctx)
    ) : (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <h3 className="mb-2 text-lg font-semibold">{empty.title}</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">{empty.body}</p>
          {empty.cta && (
            <Button className={PHONE_PRIMARY_CLASS} aria-label={empty.cta.label} render={<Link href={empty.cta.href} />}>
              <Plus className="mr-1 h-4 w-4" />
              {empty.cta.label}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  } else {
    const summaryNode = summarySlot
      ? summarySlot(records)
      : summaryMetrics && summaryMetrics.length > 0 && <MetricGrid metrics={summaryMetrics} />;
    bodyNode = (
      <>
        {summaryNode}
        {toolbarRegion}
        {body !== undefined ? (
          renderView(body)
        ) : (
          <DataView viewKey={viewKey} cards={() => renderView(cards)} list={() => renderView(list)} />
        )}
      </>
    );
  }

  const addNode = add ? (
    <Button className={PHONE_PRIMARY_CLASS} aria-label={add.label} render={<Link href={add.href} />}>
      <Plus className="mr-1 h-4 w-4" />
      {add.label}
    </Button>
  ) : undefined;

  return (
    <Suspense fallback={loadingNode ?? <PageSkeleton variant={skeleton} rows={suspenseRows} />}>
      <div data-testid={`${id}-root`} className={STACK_CLASS[stack]}>
        <PageHeader
          className={header?.className ?? "flex flex-wrap items-center justify-between gap-3"}
          title={title}
          subtitle={subtitle}
          actionsClassName={header?.actionsClassName ?? "contents"}
          actions={header?.actions !== undefined ? header.actions : addNode}
          overflow={header?.overflow}
        />

        {bodyNode}

        {deleteFlow && (
          <ConfirmDialog
            open={del.target !== null}
            onOpenChange={(open) => {
              if (!open) del.close();
            }}
            title={deleteFlow.confirmTitle}
            description={
              <>
                {del.target !== null && deleteFlow.describe(del.target)}
                {del.error &&
                  (deleteFlow.errorStyle === "inline" ? (
                    <p role="alert" className="text-sm text-destructive">
                      {del.error}
                    </p>
                  ) : (
                    <p role="alert" className="mt-2 text-destructive">
                      {del.error}
                    </p>
                  ))}
              </>
            }
            confirmLabel={deleteFlow.label}
            busy={del.deleting}
            onConfirm={() => {
              void del.confirm();
            }}
          />
        )}
      </div>
    </Suspense>
  );
}
