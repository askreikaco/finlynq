"use client";

import * as React from "react";
import { Suspense } from "react";
import { BarChart3, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { useRecord } from "@/lib/forms/use-record";
import { PageHeader } from "@/components/mobile/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";

export interface ReportLoad<TRaw, T> {
  /** Request URL (useApi key). `null` skips the request. */
  key: string | null;
  /** Picks the report data out of the response. Defaults to the response itself. Returning undefined = no data. */
  select?: (raw: TRaw) => T | undefined;
}

export interface ReportStates<T> {
  /** Shown while loading. Defaults to a card skeleton. */
  loading?: React.ReactNode;
  /** Shown on a load error, with a retry that re-requests the key. */
  error?: { title?: string; message?: string };
  /** Shown when the data is empty (`isEmpty`) or `select` found nothing. */
  empty?: { title: string; description: string; icon?: LucideIcon };
  /** True when the loaded data has nothing to show. */
  isEmpty?: (data: T) => boolean;
}

export interface ReportPageProps<TRaw, T> {
  /** Page id. The root element gets `data-testid="<id>-root"`. */
  id: string;
  title: string;
  subtitle?: string;
  /** Period or account filters, rendered under the header. */
  filters?: React.ReactNode;
  load: ReportLoad<TRaw, T>;
  states?: ReportStates<T>;
  /** Renders the report body from the loaded data. */
  children: (data: T) => React.ReactNode;
}

const identity = <TRaw, T>(raw: TRaw) => raw as unknown as T;

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
  states,
  children,
}: ReportPageProps<TRaw, T>) {
  const select = load.select ?? identity<TRaw, T>;
  const { record, notFound, error, mutate } = useRecord<TRaw, T>(load.key, select);

  const loadingNode = states?.loading ?? <PageSkeleton variant="cards" rows={3} />;

  let body: React.ReactNode;
  if (error) {
    body = (
      <ErrorState
        title={states?.error?.title}
        message={states?.error?.message}
        onRetry={() => {
          void mutate();
        }}
      />
    );
  } else if (record === undefined && !notFound) {
    body = loadingNode;
  } else if (record === undefined || (states?.isEmpty && states.isEmpty(record))) {
    body = states?.empty ? (
      <EmptyState
        icon={states.empty.icon ?? BarChart3}
        title={states.empty.title}
        description={states.empty.description}
      />
    ) : null;
  } else {
    body = children(record);
  }

  return (
    <div data-testid={`${id}-root`} className={cn("mx-auto w-full space-y-6", TW.report, TW.formPad)}>
      <PageHeader title={title} subtitle={subtitle} />
      {filters ? <div data-slot="report-filters">{filters}</div> : null}
      <Suspense fallback={loadingNode}>{body}</Suspense>
    </div>
  );
}
