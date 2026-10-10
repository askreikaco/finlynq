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
 *     summary={(goals) => [{ label: "Total Target", value: 1, currency: "USD" }]}
 *     empty={{ title: "Set your first goal", body: "Goals help you ..." }}
 *     cards={({ records, openDelete }) => <GoalCards ... />}
 *     list={({ records, openDelete }) => <GoalTable ... />}
 *     deleteFlow={{ confirmTitle: "Delete goal", describe: (g) => g.name, request: (g) => fetch(...) }}
 *   />
 */
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader, PHONE_PRIMARY_CLASS } from "@/components/mobile/page-header";
import { MetricGrid, type MetricItem } from "@/components/mobile/metric-grid";
import { DataView } from "@/components/adaptive/data-view";
import { ViewModeToggle, type ViewKey } from "@/components/adaptive/view-mode";
import { useApi } from "@/lib/data/use-api";
import { useDeleteFlow } from "@/lib/forms/use-delete-flow";

/** What a view renderer receives. `openDelete` starts the confirm for a row. */
export interface ListPageContext<T> {
  records: T[];
  openDelete: (record: T) => void;
  /** Re-fetch the list (after a page-level write such as a status toggle). */
  reload: () => void;
}

export type ListPageView<T> = ReactNode | ((ctx: ListPageContext<T>) => ReactNode);

export interface ListPageProps<T, D = T[]> {
  /** Root testid prefix: the root renders as `data-testid="<id>-root"`. */
  id: string;
  title: string;
  subtitle?: string;
  /** Primary Add action in the header (phone: PHONE_PRIMARY_CLASS). The page also feeds the FAB from its route entry. */
  add?: { label: string; href: string };
  /** Summary stat cards. A function gets the loaded records; the grid is hidden while the list is empty. */
  summary?: MetricItem[] | ((records: T[]) => MetricItem[]);
  viewKey: ViewKey;
  /** Cards view (phone default). Only the selected view is mounted. */
  cards: ListPageView<T>;
  /** List view (table). Only the selected view is mounted. */
  list: ListPageView<T>;
  /** SWR key for the list. `select` picks the records out of the response (default: the array itself). */
  load: { key: string | null; select?: (data: D) => T[] };
  /** Shown in place of the views when there are no records. */
  empty: { title: string; body: string; cta?: { label: string; href: string } };
  /** Skeleton shape while loading. Default "cards". */
  skeleton?: "cards" | "list";
  /** Error copy. Retry re-fetches the list. */
  error?: { title?: string; message?: string };
  /** Controls rendered left of the ViewModeToggle (filters, search). */
  toolbar?: ReactNode;
  /** Confirm-then-delete for a row. `label` is the confirm button text. */
  deleteFlow?: {
    label: string;
    confirmTitle: string;
    describe: (record: T) => ReactNode;
    request: (record: T) => Promise<Response>;
    fallback?: string;
  };
}

function defaultSelect<T, D>(data: D): T[] {
  return Array.isArray(data) ? (data as unknown as T[]) : [];
}

export function ListPage<T, D = T[]>({
  id,
  title,
  subtitle,
  add,
  summary,
  viewKey,
  cards,
  list,
  load,
  empty,
  skeleton = "cards",
  error,
  toolbar,
  deleteFlow,
}: ListPageProps<T, D>) {
  const swr = useApi<D>(load.key);
  const select = load.select ?? defaultSelect<T, D>;
  const records: T[] = swr.data === undefined ? [] : select(swr.data);
  const loading = swr.data === undefined && swr.error === undefined;
  const failed = swr.data === undefined && swr.error !== undefined;

  const reload = () => {
    void swr.mutate();
  };

  const del = useDeleteFlow<T>({
    request: (rec) => (deleteFlow ? deleteFlow.request(rec) : Promise.reject(new Error("no deleteFlow"))),
    onDeleted: () => reload(),
    fallback: deleteFlow?.fallback,
  });

  const ctx: ListPageContext<T> = { records, openDelete: (rec) => del.open(rec), reload };
  const renderView = (view: ListPageView<T>): ReactNode => (typeof view === "function" ? view(ctx) : view);
  const summaryMetrics = typeof summary === "function" ? summary(records) : summary;

  let body: ReactNode;
  if (loading) {
    body = <PageSkeleton variant={skeleton} rows={3} />;
  } else if (failed) {
    body = (
      <ErrorState
        title={error?.title ?? `Couldn't load ${title.toLowerCase()}`}
        message={error?.message ?? "We couldn't load this list. Please try again."}
        onRetry={reload}
      />
    );
  } else if (records.length === 0) {
    body = (
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
    body = (
      <>
        {summaryMetrics && summaryMetrics.length > 0 && <MetricGrid metrics={summaryMetrics} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
          <ViewModeToggle viewKey={viewKey} />
        </div>
        <DataView viewKey={viewKey} cards={() => renderView(cards)} list={() => renderView(list)} />
      </>
    );
  }

  return (
    <Suspense fallback={<PageSkeleton variant={skeleton} rows={3} />}>
      <div data-testid={`${id}-root`} className="space-y-6">
        <PageHeader
          className="flex flex-wrap items-center justify-between gap-3"
          title={title}
          subtitle={subtitle}
          actionsClassName="contents"
          actions={
            add ? (
              <Button className={PHONE_PRIMARY_CLASS} aria-label={add.label} render={<Link href={add.href} />}>
                <Plus className="mr-1 h-4 w-4" />
                {add.label}
              </Button>
            ) : undefined
          }
        />

        {body}

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
                {del.error && (
                  <p role="alert" className="mt-2 text-destructive">
                    {del.error}
                  </p>
                )}
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
