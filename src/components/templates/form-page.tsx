"use client";

/**
 * FormPage: the chrome of every create, edit and manage form route.
 *
 * It owns the Suspense wrapper, the returnTo handling, the PageHeader (Back, title,
 * subtitle, Save in the bar or the overflow and desktop Delete), the load states
 * (skeleton, error with retry, not found), the submit state (useSubmit, 423 message),
 * the delete flow (overflow plus ConfirmDialog, then `after`) and the optional
 * unsaved-changes guard. A page passes config plus `children(ctx)` for its fields.
 *
 *   <FormPage
 *     id="goal-edit"
 *     title="Edit goal"
 *     fallbackReturn="/goals"
 *     load={{ key: "/api/goals", select: (list: Goal[], id) => list.find((g) => g.id === Number(id)) }}
 *     onSubmit={(values) => fetch(`/api/goals/${id}`, { method: "PUT", body: JSON.stringify(values) })}
 *     delete={{ label: "Delete goal", confirmTitle: "Delete goal", describe: (g) => g.name, request: (g) => fetch(`/api/goals?id=${g.id}`, { method: "DELETE" }), after: "returnTo" }}
 *   >{(ctx) => <GoalFields record={ctx.record} onValues={(get) => ctx.registerValues(get)} />}</FormPage>
 *
 * Values: a child that owns field state calls `ctx.registerValues(() => state)` once. Save
 * (bar or bottom) submits the form and passes that getter's result to `onSubmit`. A child can
 * also call `ctx.submit(values)` itself. On a successful save the page goes to returnTo.
 */

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader, HEADER_SECONDARY, type OverflowAction } from "@/components/mobile";
import { PHONE_PRIMARY_CLASS } from "@/components/mobile/page-header";
import { FormFooter, FormNote } from "@/components/forms";
import { useDeleteFlow } from "@/lib/forms/use-delete-flow";
import { useRecord } from "@/lib/forms/use-record";
import { useReturnTo } from "@/lib/forms/use-return-to";
import { useSubmit } from "@/lib/forms/use-submit";
import { TW } from "@/lib/design/tokens";
import { cn } from "@/lib/utils";

export const FORM_DIRTY_MESSAGE = "You have unsaved changes. Leave without saving?";

export interface FormPageLoad<T, R> {
  /** SWR key (useApi). A function receives the route id. `null` skips the request. */
  key: string | null | ((id: string) => string);
  /** Pick the record out of the response. Return undefined when there is no match (not found). */
  select: (data: T, id: string) => R | undefined;
  /** Not-found copy and the link label (the link goes to returnTo). */
  notFound?: { message?: string; linkLabel?: string };
}

export interface FormPageDelete<R> {
  /** Overflow item and desktop button label, e.g. "Delete goal". */
  label: string;
  confirmTitle: string;
  confirmLabel?: string;
  describe: (record: R) => React.ReactNode;
  request: (record: R) => Promise<Response>;
  /** "returnTo" goes to the validated returnTo, any other string is an app path. */
  after: "returnTo" | string;
}

export interface FormPageContext<R, V> {
  record: R | undefined;
  returnTo: string;
  router: ReturnType<typeof useRouter>;
  /** Submit explicit values (same path as the Save button). Resolves the Response, or null on failure. */
  submit: (values: V) => Promise<Response | null>;
  saving: boolean;
  error: string | null;
  /** Register a getter for the field values; Save calls it. Call from an effect, not on every render. */
  registerValues: (get: () => V) => void;
}

export interface FormPageProps<T, R, V> {
  id: string;
  title: string;
  subtitle?: string;
  /** Back, Cancel and the post-save target when no valid ?returnTo= is given. */
  fallbackReturn: string | ((params: Record<string, string | undefined>) => string);
  /** "bar": Save in the header. "bottom": Cancel and Save in a footer. */
  savePlacement?: "bar" | "bottom";
  saveLabel?: string;
  /** Cancel button. Default: on for "bottom", off for "bar". */
  cancel?: boolean;
  load?: FormPageLoad<T, R>;
  onSubmit: (values: V) => Response | Promise<Response>;
  delete?: FormPageDelete<R>;
  /** Extra overflow items, shown before the delete item. */
  overflow?: OverflowAction[];
  /** Ask before leaving with unsaved changes (Back, Cancel, browser unload). Default off. */
  dirtyGuard?: boolean;
  children: (ctx: FormPageContext<R, V>) => React.ReactNode;
}

type RouteParams = Record<string, string | undefined>;

function FormPageBody<T, R, V>({
  id,
  title,
  subtitle,
  fallbackReturn,
  savePlacement = "bar",
  saveLabel = "Save",
  cancel,
  load,
  onSubmit,
  delete: deleteCfg,
  overflow,
  dirtyGuard = false,
  children,
}: FormPageProps<T, R, V>) {
  const router = useRouter();
  const params = (useParams<RouteParams>() ?? {}) as RouteParams;
  const routeId = params.id ?? "";
  const fallback = typeof fallbackReturn === "function" ? fallbackReturn(params) : fallbackReturn;
  const returnTo = useReturnTo(fallback);
  const formId = `${id}-form`;
  const showCancel = cancel ?? savePlacement === "bottom";

  // Load. Without `load` the key is null and nothing is fetched.
  const loadKey = load ? (typeof load.key === "function" ? load.key(routeId) : load.key) : null;
  const rec = useRecord<T, R>(loadKey, (data: T) => (load ? load.select(data, routeId) : undefined));
  const record = load ? rec.record : undefined;
  const loading = !!load && rec.data === undefined && !rec.error && loadKey !== null;
  const failed = !!load && !!rec.error && rec.data === undefined;
  const notFound = !!load && rec.notFound;

  // Submit.
  const submitState = useSubmit();
  const [getValues, setGetValues] = React.useState<(() => V) | null>(null);
  const registerValues = React.useCallback((get: () => V) => {
    setGetValues(() => get);
  }, []);
  const [dirty, setDirty] = React.useState(false);

  const submit = React.useCallback(
    async (values: V): Promise<Response | null> => {
      const res = await submitState.run(async () => onSubmit(values));
      if (res) {
        setDirty(false);
        router.push(returnTo);
      }
      return res;
    },
    [submitState.run, onSubmit, router, returnTo], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submit(getValues ? getValues() : (undefined as V));
  };

  // Unsaved-changes guard (off by default: no listener is added).
  React.useEffect(() => {
    if (!dirtyGuard || !dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyGuard, dirty]);

  const leave = (href: string) => {
    if (dirtyGuard && dirty && !window.confirm(FORM_DIRTY_MESSAGE)) return;
    router.push(href);
  };

  // Delete.
  const del = useDeleteFlow<R>({
    request: (rec) => (deleteCfg ? deleteCfg.request(rec) : Promise.reject(new Error("No delete configured"))),
    onDeleted: () => {
      const after = deleteCfg?.after;
      router.push(!after || after === "returnTo" ? returnTo : after);
    },
  });

  const openDelete = record !== undefined ? () => del.open(record) : undefined;
  const overflowItems: OverflowAction[] = [
    ...(overflow ?? []),
    ...(deleteCfg && openDelete
      ? [{ label: deleteCfg.label, icon: Trash2, destructive: true, onSelect: openDelete }]
      : []),
  ];

  const ctx: FormPageContext<R, V> = {
    record,
    returnTo,
    router,
    submit,
    saving: submitState.saving,
    error: submitState.error,
    registerValues,
  };

  const saveButton = (
    <Button type="submit" form={formId} disabled={submitState.saving} className={savePlacement === "bar" ? PHONE_PRIMARY_CLASS : undefined}>
      {savePlacement === "bar" ? <Check className="h-4 w-4 mr-1" aria-hidden /> : null}
      {saveLabel}
    </Button>
  );

  const formReady = !loading && !failed && !notFound;

  const header = (
    <PageHeader
      title={title}
      subtitle={subtitle}
      backHref={dirtyGuard ? undefined : returnTo}
      onBack={dirtyGuard ? () => leave(returnTo) : undefined}
      backLabel="Back"
      className="flex items-center justify-between"
      overflow={overflowItems.length > 0 ? overflowItems : undefined}
      actions={
        <>
          {deleteCfg && openDelete ? (
            <Button variant="outline" size="sm" className={cn(HEADER_SECONDARY, "text-destructive")} onClick={openDelete}>
              <Trash2 className="h-4 w-4 mr-1" aria-hidden /> {deleteCfg.label}
            </Button>
          ) : null}
          {savePlacement === "bar" && formReady ? saveButton : null}
        </>
      }
    />
  );

  let content: React.ReactNode;
  if (loading) {
    content = <PageSkeleton variant="list" rows={3} />;
  } else if (failed) {
    content = (
      <ErrorState
        title="Couldn't load this page"
        message="We couldn't load this record. Please try again."
        onRetry={() => void rec.mutate()}
      />
    );
  } else if (notFound) {
    content = (
      <FormNote className="mt-6">
        {load?.notFound?.message ?? "This record doesn't exist or was deleted."}{" "}
        <Link href={returnTo} className="underline">
          {load?.notFound?.linkLabel ?? "Back"}
        </Link>
      </FormNote>
    );
  } else {
    content = (
      <form
        id={formId}
        className="mt-3 space-y-3"
        noValidate
        onSubmit={handleFormSubmit}
        onChange={dirtyGuard ? () => setDirty(true) : undefined}
      >
        {submitState.error ? (
          <FormNote tone="error" role="alert">
            {submitState.error}
          </FormNote>
        ) : null}
        {del.error ? (
          <FormNote tone="error" role="alert">
            {del.error}
          </FormNote>
        ) : null}
        {children(ctx)}
        {savePlacement === "bottom" || showCancel ? (
          <FormFooter>
            {showCancel ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => leave(returnTo)}
              >
                Cancel
              </Button>
            ) : null}
            {savePlacement === "bottom" ? saveButton : null}
          </FormFooter>
        ) : null}
      </form>
    );
  }

  return (
    <div
      data-testid={`${id}-root`}
      className={cn("mx-auto w-full", TW.form, savePlacement === "bar" && TW.formPad)}
    >
      {header}
      {content}
      {deleteCfg ? (
        <ConfirmDialog
          open={del.target !== null}
          onOpenChange={(open) => {
            if (!open) del.close();
          }}
          title={deleteCfg.confirmTitle}
          description={del.target !== null ? deleteCfg.describe(del.target) : null}
          confirmLabel={deleteCfg.confirmLabel ?? "Delete"}
          busy={del.deleting}
          onConfirm={() => void del.confirm()}
        />
      ) : null}
    </div>
  );
}

/** Route-level entry point. Wraps the body in Suspense (useSearchParams needs it). */
export function FormPage<T, R, V>(props: FormPageProps<T, R, V>) {
  return (
    <React.Suspense fallback={null}>
      <FormPageBody {...props} />
    </React.Suspense>
  );
}
