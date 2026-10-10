"use client";

/**
 * DetailPage: one record's view (accounts/[id], categories/[id], settings/backfill/[runId]).
 *
 * The template owns the chrome: Suspense, the global PageHeader (back, title, actions, overflow),
 * the width token, the bottom pad and the `<id>-root` testid. The page passes the record source
 * (`load`) and its slots. Loading, error (with retry) and not-found states all render the same
 * PageHeader, so the back control is always there.
 *
 * Slots (`title`, `actions`, `overflow`, `sections`) take either a node or a function of the record.
 */

import { Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { ErrorState } from "@/components/error-state";
import { PageHeader, type OverflowAction } from "@/components/mobile";
import { useRecord } from "@/lib/forms/use-record";
import { useReturnTo } from "@/lib/forms/use-return-to";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";

/** A slot: a node, or a function of the loaded record. */
export type DetailSlot<R, T> = T | ((rec: R) => T);

export interface DetailPageProps<D, R> {
  /** Root testid prefix: the root element is `data-testid="<id>-root"`. */
  id: string;
  /** Header title, from the record. Shown as `placeholderTitle` until the record loads. */
  title: DetailSlot<R, ReactNode>;
  /** Header title while loading, on error and when not found. */
  placeholderTitle?: string;
  /** Back target when the URL has no valid `?returnTo=`. */
  backFallback: string;
  /** Back button label. */
  backLabel?: string;
  /** The record source. `key` null skips the request; `select` picks the record (see useRecord). */
  load: {
    key: string | null;
    select: (data: D) => R | undefined;
    /** Not-found copy for the empty state. */
    notFound?: { title?: string; message?: string };
  };
  /** Primary and secondary actions. Secondary buttons need HEADER_SECONDARY and an `overflow` entry. */
  actions?: DetailSlot<R, ReactNode>;
  /** Overflow (⋯) menu entries. */
  overflow?: DetailSlot<R, OverflowAction[]>;
  /** The page body, below the header. */
  sections: DetailSlot<R, ReactNode>;
}

function resolve<R, T>(slot: DetailSlot<R, T> | undefined, rec: R | undefined, fallback: T): T {
  if (slot === undefined) return fallback;
  if (typeof slot === "function") {
    return rec === undefined ? fallback : (slot as (rec: R) => T)(rec);
  }
  return slot;
}

export function DetailPage<D, R>(props: DetailPageProps<D, R>) {
  return (
    <Suspense fallback={<DetailShell id={props.id} backFallback={props.backFallback} backLabel={props.backLabel} placeholderTitle={props.placeholderTitle} />}>
      <DetailContent {...props} />
    </Suspense>
  );
}

/** Header plus skeleton, used while the Suspense boundary and the record are pending. */
function DetailShell({
  id,
  backFallback,
  backLabel,
  placeholderTitle,
  children,
}: {
  id: string;
  backFallback: string;
  backLabel?: string;
  placeholderTitle?: string;
  children?: ReactNode;
}) {
  return (
    <div data-testid={`${id}-root`} className={cn("mx-auto w-full space-y-6", TW.section, TW.formPad)}>
      <PageHeader title={placeholderTitle ?? ""} backHref={backFallback} backLabel={backLabel ?? "Back"} />
      {children ?? <PageSkeleton variant="list" rows={3} />}
    </div>
  );
}

function DetailContent<D, R>({
  id,
  title,
  placeholderTitle = "",
  backFallback,
  backLabel = "Back",
  load,
  actions,
  overflow,
  sections,
}: DetailPageProps<D, R>) {
  const returnTo = useReturnTo(backFallback);
  const { record, notFound, error, mutate } = useRecord<D, R>(load.key, load.select);

  if (record === undefined) {
    if (error !== undefined && error !== null) {
      return (
        <DetailShell id={id} backFallback={returnTo} backLabel={backLabel} placeholderTitle={placeholderTitle}>
          <ErrorState title="Couldn't load this record" message="Please try again." onRetry={() => void mutate()} />
        </DetailShell>
      );
    }
    if (notFound) {
      return (
        <DetailShell id={id} backFallback={returnTo} backLabel={backLabel} placeholderTitle={placeholderTitle}>
          <ErrorState
            title={load.notFound?.title ?? "Not found"}
            message={load.notFound?.message ?? "This doesn't exist, or it isn't one of yours."}
          />
        </DetailShell>
      );
    }
    return <DetailShell id={id} backFallback={returnTo} backLabel={backLabel} placeholderTitle={placeholderTitle} />;
  }

  const overflowItems = resolve(overflow, record, [] as OverflowAction[]);
  return (
    <div data-testid={`${id}-root`} className={cn("mx-auto w-full space-y-6", TW.section, TW.formPad)}>
      <PageHeader
        title={resolve(title, record, placeholderTitle)}
        backHref={returnTo}
        backLabel={backLabel}
        actions={resolve(actions, record, null)}
        overflow={overflowItems}
      />
      {resolve(sections, record, null)}
    </div>
  );
}
