"use client";

import * as React from "react";
import { Suspense } from "react";
import { BarChart3, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { useRecord } from "@/lib/forms/use-record";
import type { LoadState, LoadStatus, UseLoad } from "@/lib/forms/load-state";
import { PageHeader, type OverflowAction } from "@/components/mobile/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";

export interface ReportLoad<TRaw, T> {
  /** Request URL (useApi key). `null` skips the request. */
  key: string | null;
  /** Picks the report data out of the response. Defaults to the response itself. Returning undefined = no data. */
  select?: (raw: TRaw) => T | undefined;
}

export interface ReportEmptyAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface ReportStates<T> {
  /** Shown while loading. Defaults to a card skeleton. */
  loading?: React.ReactNode;
  /** false = render the loading node bare (no root, no header, no filters). Default true. */
  loadingChrome?: boolean;
  /** Shown on a load error, with a retry that re-requests the key. `chrome: false` = render bare. */
  error?: { title?: string; message?: string; chrome?: boolean };
  /** Shown when the data is empty (`isEmpty`) or `select` found nothing. `action` is EmptyState's action object. */
  empty?: { title: string; description: string; icon?: LucideIcon; action?: ReportEmptyAction };
  /** True when the loaded data has nothing to show. */
  isEmpty?: (data: T) => boolean;
}

/** Report width token: "report" = max-w-report (default), "doc" = max-w-doc, "none" = no max width. */
export type ReportWidth = "report" | "doc" | "none";
/** Vertical rhythm between body blocks: "6" (default), "5", or "4-6" (space-y-4, regular:space-y-6). */
export type ReportStack = "6" | "5" | "4-6";

export interface ReportHeader {
  backHref?: string;
  backLabel?: string;
  overflow?: OverflowAction[];
  actions?: React.ReactNode;
  className?: string;
  actionsClassName?: string;
}

export interface ReportPageProps<TRaw, T> {
  /** Page id. The root element gets `data-testid="<id>-root"`. */
  id: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Period or account filters, rendered under the header. */
  filters?: React.ReactNode;
  /** One useApi request + select. Exclusive with `useLoad`. */
  load?: ReportLoad<TRaw, T>;
  /**
   * Page-owned load hook (multi-fetch, custom unwrap). Exclusive with `load`.
   * Called every render with an empty route (`params: {}`, `returnTo: ""`); a page that needs
   * route params reads them itself (useParams) inside the hook.
   */
  useLoad?: UseLoad<T, unknown>;
  states?: ReportStates<T>;
  /** Report width. Default "report". */
  width?: ReportWidth;
  /** `mx-auto` on the root. Default true. */
  center?: boolean;
  /** Bottom padding for the sticky bar (TW.formPad). Default true. */
  padBottom?: boolean;
  /** Body spacing. Default "6". */
  stack?: ReportStack;
  /** Passed through to PageHeader (back link, overflow menu, actions). */
  header?: ReportHeader;
  /** Renders the report body from the loaded data. */
  children: (data: T) => React.ReactNode;
}

const identity = <TRaw, T>(raw: TRaw) => raw as unknown as T;

const WIDTH: Record<ReportWidth, string | undefined> = {
  report: TW.report,
  doc: TW.doc,
  none: undefined,
};

const STACK: Record<ReportStack, string> = {
  "6": "space-y-6",
  "5": "space-y-5",
  "4-6": "space-y-4 regular:space-y-6",
};

// Stand-in for `useLoad` when the page uses `load`: keeps the hook call unconditional.
const noLoad = <R,>(): LoadState<R, unknown> => ({ status: "loading", retry: () => undefined });

/**
 * Report page chrome: global PageHeader, optional filters slot, one data load with loading, error (retry)
 * and empty states, and the report width (TW.report). The template owns the Suspense boundary.
 */
export function ReportPage<TRaw, T>({
  id,
  title,
  subtitle,
  filters,
  load,
  useLoad,
  states,
  width = "report",
  center = true,
  padBottom = true,
  stack = "6",
  header,
  children,
}: ReportPageProps<TRaw, T>) {
  const select = load?.select ?? identity<TRaw, T>;
  const rec = useRecord<TRaw, T>(useLoad || !load ? null : load.key, select);
  const hook = (useLoad ?? noLoad<T>)({ params: {}, returnTo: "" });

  // Same precedence as the original template: error first, then loading, then notFound/ready.
  let status: LoadStatus;
  let data: T | undefined;
  let retry: () => void;
  if (useLoad) {
    status = hook.status;
    data = hook.record;
    retry = hook.retry;
  } else {
    status = rec.error
      ? "error"
      : rec.record === undefined
        ? rec.notFound
          ? "notFound"
          : "loading"
        : "ready";
    data = rec.record;
    retry = () => {
      void rec.mutate();
    };
  }

  const loadingNode = states?.loading ?? <PageSkeleton variant="cards" rows={3} />;

  if (status === "error" && states?.error?.chrome === false) {
    return <ErrorState title={states.error.title} message={states.error.message} onRetry={retry} />;
  }
  if (status === "loading" && states?.loadingChrome === false) {
    return <>{loadingNode}</>;
  }

  let body: React.ReactNode;
  if (status === "error") {
    body = (
      <ErrorState title={states?.error?.title} message={states?.error?.message} onRetry={retry} />
    );
  } else if (status === "loading") {
    body = loadingNode;
  } else if (status === "notFound" || data === undefined || (states?.isEmpty && states.isEmpty(data))) {
    body = states?.empty ? (
      <EmptyState
        icon={states.empty.icon ?? BarChart3}
        title={states.empty.title}
        description={states.empty.description}
        action={states.empty.action}
      />
    ) : null;
  } else {
    body = children(data);
  }

  return (
    <div
      data-testid={`${id}-root`}
      className={cn(center && "mx-auto", "w-full", STACK[stack], WIDTH[width], padBottom && TW.formPad)}
    >
      <PageHeader
        title={title}
        subtitle={subtitle}
        backHref={header?.backHref}
        backLabel={header?.backLabel}
        overflow={header?.overflow}
        actions={header?.actions}
        className={header?.className}
        actionsClassName={header?.actionsClassName}
      />
      {filters ? <div data-slot="report-filters">{filters}</div> : null}
      <Suspense fallback={loadingNode}>{body}</Suspense>
    </div>
  );
}
