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
 *
 * Variants (all optional; omitted = the behaviour above):
 * - `form: "external"`: no <form>, no Save/Cancel footer. The page owns its form and Save
 *   (via `header.actions`). `useSubmit` stays mounted but is inert; `registerValues` is a no-op.
 * - `useLoad`: the page's own load hook (returns a LoadState). Takes precedence over `load`.
 * - `states`: per-state chrome (false = the state node renders bare), copy and retry.
 * - `header`, `width`, `padBottom`, `bodyClassName`, `saveDisabled`, `delete.*` extras.
 * - `rootTestId`: testid of the root (default `${id}-root`). `id` still derives the form id.
 * - `subtitle`: a node, or a function of the loaded record.
 * - `states.{loading,error,notFound}`: `wrapperClassName` wraps the state body; `node` (a node or
 *   a function of `{ retry, message }`) replaces the built-in body. Header chrome rules are unchanged.
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
import type { LoadStatus, UseLoad } from "@/lib/forms/load-state";
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
  /** Desktop header button text. Default: `label`. */
  headerLabel?: string;
  /** "desktop" (default) shows the header button; "none" keeps only the overflow item. */
  button?: "desktop" | "none";
  /** While the record is missing: "hide" (default) renders no header button; "disabled" renders it disabled. */
  whenMissing?: "hide" | "disabled";
  /** Failure copy: "note" (default, FormNote) or "inline" (plain alert paragraph). */
  errorStyle?: "note" | "inline";
  /** Passed to useDeleteFlow. `false` closes the dialog on failure and keeps the error. */
  keepOpenOnError?: boolean;
  /** Passed to useDeleteFlow. `true` treats any resolved Response as success. */
  ignoreStatus?: boolean;
  /** Passed to useDeleteFlow. Fixed failure copy instead of the server message. */
  errorMessage?: string;
}

export interface FormPageContext<R, V, X = unknown> {
  record: R | undefined;
  /** Extra data from `useLoad` (undefined without it). */
  extra: X | undefined;
  returnTo: string;
  router: ReturnType<typeof useRouter>;
  /** Submit explicit values (same path as the Save button). Resolves the Response, or null on failure. */
  submit: (values: V) => Promise<Response | null>;
  saving: boolean;
  error: string | null;
  /** Register a getter for the field values; Save calls it. Call from an effect, not on every render. */
  registerValues: (get: () => V) => void;
  /** Re-run the load (the error retry). */
  reload: () => void;
  /** Open the delete confirm. Undefined when there is no delete config or no record. */
  openDelete: (() => void) | undefined;
}

export type FormPageForm = "owned" | "external";
export type FormPageWidth = "form" | "section" | "report";
export type FormPagePad = "default" | "max" | "none";

/** Passed to a state's `node` function. `retry` is the action the built-in retry control would take. */
export interface FormPageStateContext {
  retry: () => void;
  /** The load hook's `message` when it returns one (undefined otherwise). */
  message?: string;
}

export interface FormPageStateKnobs {
  /** Wraps the state body in a `<div className>`. */
  wrapperClassName?: string;
  /** Replaces the built-in state body. A function receives the state context. */
  node?: React.ReactNode | ((ctx: FormPageStateContext) => React.ReactNode);
}

export interface FormPageStates {
  loading?: {
    chrome?: boolean;
    variant?: "list" | "cards" | "table";
    rows?: number;
  } & FormPageStateKnobs;
  error?: {
    chrome?: boolean;
    title?: string;
    message?: string;
    /** "reload" (default) re-runs the load; "refresh" calls router.refresh(). */
    retry?: "reload" | "refresh";
  } & FormPageStateKnobs;
  notFound?: {
    chrome?: boolean;
    /** "note" (default, FormNote), "text" (muted paragraph), "error" (ErrorState). */
    kind?: "note" | "error" | "text";
    title?: string;
    message?: string;
    linkLabel?: string;
    /** "returnTo" (kind "error" only): the retry button goes to returnTo. */
    retry?: "returnTo";
  } & FormPageStateKnobs;
}

export interface FormPageHeaderOptions<R> {
  /** Replaces the default "flex items-center justify-between". */
  className?: string;
  /** Replaces the default actions (desktop Delete and bar Save). */
  actions?: React.ReactNode | ((record: R | undefined) => React.ReactNode);
  /** Under the title. (No `lead` passthrough: tests/ios/header-actions.test.ts cannot prove a phone-hidden lead.) */
  belowTitle?: React.ReactNode;
  /** Back label. Default "Back". */
  backLabel?: string;
  /** Back target only. ctx.returnTo and the post-save target are unchanged. */
  backHref?: string;
}

export interface FormPageProps<T, R, V, X = unknown> {
  id: string;
  /** Testid of the root element. Default `${id}-root`. */
  rootTestId?: string;
  title: React.ReactNode;
  /** A node, or a function of the loaded record (undefined until loaded). */
  subtitle?: React.ReactNode | ((record: R | undefined) => React.ReactNode);
  /** Back, Cancel and the post-save target when no valid ?returnTo= is given. */
  fallbackReturn: string | ((params: Record<string, string | undefined>) => string);
  /** "bar": Save in the header. "bottom": Cancel and Save in a footer. */
  savePlacement?: "bar" | "bottom";
  saveLabel?: string;
  /** Cancel button. Default: on for "bottom", off for "bar". */
  cancel?: boolean;
  /** "owned" (default): the template renders the <form> and Save. "external": the page owns both. */
  form?: FormPageForm;
  /** Load through the template (SWR key + select). Ignored when `useLoad` is set. */
  load?: FormPageLoad<T, R>;
  /** The page's own load hook. Takes precedence over `load`. */
  useLoad?: UseLoad<R, X>;
  /** Required in owned mode (Save calls it). External pages may omit it. */
  onSubmit?: (values: V) => Response | Promise<Response>;
  delete?: FormPageDelete<R>;
  /** Extra overflow items, shown before the delete item. */
  overflow?: OverflowAction[];
  /** Ask before leaving with unsaved changes (Back, Cancel, browser unload). Default off. */
  dirtyGuard?: boolean;
  /** Max width token. Default "form". */
  width?: FormPageWidth;
  /** Bottom padding. Default: formPad when Save is in the bar or the form is external. */
  padBottom?: FormPagePad;
  /** Extra classes on the body wrapper (the <form> when owned, else a div). */
  bodyClassName?: string;
  /** Disables Save (ORed with saving). */
  saveDisabled?: (ctx: FormPageContext<R, V, X>) => boolean;
  states?: FormPageStates;
  header?: FormPageHeaderOptions<R>;
  children: (ctx: FormPageContext<R, V, X>) => React.ReactNode;
}

type RouteParams = Record<string, string | undefined>;

const WIDTH_CLASS: Record<FormPageWidth, string> = {
  form: TW.form,
  section: TW.section,
  report: TW.report,
};

const noop = () => undefined;

/** Reads the optional `message` a load hook may return (LoadState has no such field, so this is structural). */
function readHookMessage(slot: unknown): string | undefined {
  const m = (slot as unknown as Record<string, unknown> | null | undefined)?.message;
  return typeof m === "string" ? m : undefined;
}

/** A state's body: its `node` override (node or function of ctx) or the built-in, then the optional wrapper. */
function wrapState(
  cfg: FormPageStateKnobs | undefined,
  builtIn: React.ReactNode,
  ctx: FormPageStateContext,
): React.ReactNode {
  let body: React.ReactNode;
  if (!cfg || cfg.node === undefined) body = builtIn;
  else if (typeof cfg.node === "function") body = cfg.node(ctx);
  else body = cfg.node;
  return cfg?.wrapperClassName ? <div className={cfg.wrapperClassName}>{body}</div> : body;
}

function FormPageBody<T, R, V, X>({
  id,
  rootTestId,
  title,
  subtitle,
  fallbackReturn,
  savePlacement = "bar",
  saveLabel = "Save",
  cancel,
  form = "owned",
  load,
  useLoad,
  onSubmit,
  delete: deleteCfg,
  overflow,
  dirtyGuard = false,
  width = "form",
  padBottom,
  bodyClassName,
  saveDisabled,
  states,
  header,
  children,
}: FormPageProps<T, R, V, X>) {
  const router = useRouter();
  const params = (useParams<RouteParams>() ?? {}) as RouteParams;
  const routeId = params.id ?? "";
  const fallback = typeof fallbackReturn === "function" ? fallbackReturn(params) : fallbackReturn;
  const returnTo = useReturnTo(fallback);
  const formId = `${id}-form`;
  const external = form === "external";
  const showCancel = cancel ?? savePlacement === "bottom";

  // Load. Without `load` the key is null and nothing is fetched.
  const loadKey = load ? (typeof load.key === "function" ? load.key(routeId) : load.key) : null;
  const rec = useRecord<T, R>(loadKey, (data: T) => (load ? load.select(data, routeId) : undefined));
  // Hook slot: the page's useLoad, or a constant "ready" state (no request, no record).
  const useLoadSlot: UseLoad<R, X> = useLoad ?? (() => ({ status: "ready", retry: noop }));
  const slot = useLoadSlot({ params, returnTo });

  let status: LoadStatus;
  let record: R | undefined;
  let extra: X | undefined = undefined;
  let retry: () => void;
  if (useLoad) {
    status = slot.status;
    record = slot.record;
    extra = slot.extra;
    retry = slot.retry;
  } else {
    record = load ? rec.record : undefined;
    retry = () => {
      void rec.mutate();
    };
    if (load && rec.data === undefined && !rec.error && loadKey !== null) status = "loading";
    else if (load && !!rec.error && rec.data === undefined) status = "error";
    else if (load && rec.notFound) status = "notFound";
    else status = "ready";
  }
  const loading = status === "loading";
  const failed = status === "error";
  const notFound = status === "notFound";

  // Submit.
  const submitState = useSubmit();
  const [getValues, setGetValues] = React.useState<(() => V) | null>(null);
  const registerValues = React.useCallback(
    (get: () => V) => {
      if (!external) setGetValues(() => get);
    },
    [external],
  );
  const [dirty, setDirty] = React.useState(false);

  const submit = React.useCallback(
    async (values: V): Promise<Response | null> => {
      const handler = onSubmit;
      if (!handler) return null;
      const res = await submitState.run(async () => handler(values));
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
    keepOpenOnError: deleteCfg?.keepOpenOnError,
    ignoreStatus: deleteCfg?.ignoreStatus,
    errorMessage: deleteCfg?.errorMessage,
  });

  const openDelete = record !== undefined ? () => del.open(record) : undefined;
  const overflowItems: OverflowAction[] = [
    ...(overflow ?? []),
    ...(deleteCfg && openDelete
      ? [{ label: deleteCfg.label, icon: Trash2, destructive: true, onSelect: openDelete }]
      : []),
  ];

  const ctx: FormPageContext<R, V, X> = {
    record,
    extra,
    returnTo,
    router,
    submit,
    saving: submitState.saving,
    error: submitState.error,
    registerValues,
    reload: retry,
    openDelete,
  };

  const formReady = !loading && !failed && !notFound;
  const showSave = !external && savePlacement === "bar" && formReady;

  const saveButton = (
    <Button
      type="submit"
      form={formId}
      disabled={submitState.saving || (saveDisabled ? saveDisabled(ctx) : false)}
      className={savePlacement === "bar" ? PHONE_PRIMARY_CLASS : undefined}
    >
      {savePlacement === "bar" ? <Check className="h-4 w-4 mr-1" aria-hidden /> : null}
      {saveLabel}
    </Button>
  );

  const showDeleteButton = !!deleteCfg && (!!openDelete || deleteCfg.whenMissing === "disabled") && (deleteCfg.button ?? "desktop") === "desktop";
  const deleteButton = showDeleteButton ? (
    <Button
      variant="outline"
      size="sm"
      className={cn(HEADER_SECONDARY, "text-destructive")}
      onClick={openDelete}
      disabled={!openDelete}
    >
      <Trash2 className="h-4 w-4 mr-1" aria-hidden /> {deleteCfg?.headerLabel ?? deleteCfg?.label}
    </Button>
  ) : null;

  const actionsOpt = header?.actions;
  const headerActions: React.ReactNode =
    actionsOpt === undefined ? (
      <>
        {deleteButton}
        {showSave ? saveButton : null}
      </>
    ) : typeof actionsOpt === "function" ? (
      (actionsOpt as (rec: R | undefined) => React.ReactNode)(record)
    ) : (
      (actionsOpt as React.ReactNode)
    );

  const subtitleNode = typeof subtitle === "function" ? subtitle(record) : subtitle;
  const headerNode = (
    <PageHeader
      title={title}
      subtitle={subtitleNode}
      backHref={dirtyGuard ? undefined : (header?.backHref ?? returnTo)}
      onBack={dirtyGuard ? () => leave(returnTo) : undefined}
      backLabel={header?.backLabel ?? "Back"}
      className={header?.className ?? "flex items-center justify-between"}
      belowTitle={header?.belowTitle}
      overflow={overflowItems.length > 0 ? overflowItems : undefined}
      actions={headerActions}
    />
  );

  // States. A state with chrome:false renders bare (no root, no header).
  // Each state body goes through wrapState (wrapperClassName, node override); chrome is unchanged.
  const hookMessage = useLoad ? readHookMessage(slot) : undefined;
  let piece: { node: React.ReactNode; chrome: boolean } | null = null;
  if (loading) {
    const cfg = states?.loading;
    piece = {
      node: wrapState(
        cfg,
        <PageSkeleton variant={cfg?.variant ?? "list"} rows={cfg?.rows ?? 3} />,
        { retry: () => void retry(), message: hookMessage },
      ),
      chrome: cfg?.chrome !== false,
    };
  } else if (failed) {
    const cfg = states?.error;
    const onRetry = cfg?.retry === "refresh" ? () => router.refresh() : () => void retry();
    piece = {
      node: wrapState(
        cfg,
        <ErrorState
          title={cfg?.title ?? "Couldn't load this page"}
          message={cfg?.message ?? "We couldn't load this record. Please try again."}
          onRetry={onRetry}
        />,
        { retry: onRetry, message: hookMessage },
      ),
      chrome: cfg?.chrome !== false,
    };
  } else if (notFound) {
    const cfg = states?.notFound;
    const message = cfg?.message ?? load?.notFound?.message ?? "This record doesn't exist or was deleted.";
    const linkLabel = cfg?.linkLabel ?? load?.notFound?.linkLabel ?? "Back";
    const kind = cfg?.kind ?? "note";
    const onRetry = cfg?.retry === "returnTo" ? () => router.push(returnTo) : () => void retry();
    piece = {
      node: wrapState(
        cfg,
        kind === "error" ? (
          <ErrorState
            title={cfg?.title ?? "Not found"}
            message={message}
            onRetry={cfg?.retry === "returnTo" ? () => router.push(returnTo) : undefined}
          />
        ) : kind === "text" ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {message}{" "}
            <Link href={returnTo} className="underline">
              {linkLabel}
            </Link>
          </p>
        ) : (
          <FormNote className="mt-6">
            {message}{" "}
            <Link href={returnTo} className="underline">
              {linkLabel}
            </Link>
          </FormNote>
        ),
        { retry: onRetry, message: hookMessage },
      ),
      chrome: cfg?.chrome !== false,
    };
  }
  if (piece && !piece.chrome) return <>{piece.node}</>;

  const delError = del.error ? (
    deleteCfg?.errorStyle === "inline" ? (
      <p role="alert" className="text-sm text-destructive">
        {del.error}
      </p>
    ) : (
      <FormNote tone="error" role="alert">
        {del.error}
      </FormNote>
    )
  ) : null;

  const padMode = padBottom ?? "default";
  const padValue =
    padMode === "none"
      ? null
      : padMode === "max"
        ? TW.formPadMax
        : external || savePlacement === "bar"
          ? TW.formPad
          : null;

  let body: React.ReactNode;
  if (piece) {
    body = piece.node;
  } else if (external) {
    body = (
      <div
        className={cn("mt-3", padValue, bodyClassName)}
        onChange={dirtyGuard ? () => setDirty(true) : undefined}
      >
        {delError}
        {children(ctx)}
      </div>
    );
  } else {
    body = (
      <form
        id={formId}
        className={cn("mt-3 space-y-3", bodyClassName)}
        noValidate
        onSubmit={handleFormSubmit}
        onChange={dirtyGuard ? () => setDirty(true) : undefined}
      >
        {submitState.error ? (
          <FormNote tone="error" role="alert">
            {submitState.error}
          </FormNote>
        ) : null}
        {delError}
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
      data-testid={rootTestId ?? `${id}-root`}
      className={cn("mx-auto w-full", WIDTH_CLASS[width], !external && padValue)}
    >
      {headerNode}
      {body}
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
export function FormPage<T, R, V, X = unknown>(props: FormPageProps<T, R, V, X>) {
  return (
    <React.Suspense fallback={null}>
      <FormPageBody {...props} />
    </React.Suspense>
  );
}
