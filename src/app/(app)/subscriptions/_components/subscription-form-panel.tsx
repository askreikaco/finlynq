"use client";

/**
 * SubscriptionFormPanel: THE subscription create / edit form. /subscriptions/new and /subscriptions/[id]/edit render it
 * as a page; the /subscriptions split view renders it `embedded` in the pane. One component (FormPage +
 * SubscriptionForm): same fields, validation, requests and delete confirm in both. `embedded` only changes chrome.
 */
import { FormPage, type FormPageEmbedded } from "@/components/templates";
import { SubscriptionForm, EMPTY_DRAFT } from "./subscription-form";
import { useSubscriptionEditLoad, useSubscriptionNewLoad } from "./use-subscription-load";

const SUBSCRIPTIONS_FALLBACK = "/subscriptions";

export interface SubscriptionFormPanelProps {
  mode: "create" | "edit";
  /** Pane only: the subscription id (the routes read it from the URL). */
  id?: string;
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

function toEmbedded(p: SubscriptionFormPanelProps): FormPageEmbedded | undefined {
  return p.embedded ? { id: p.id, onSaved: p.onSaved, onCancel: p.onCancel, onDeleted: p.onDeleted } : undefined;
}

function CreateSubscription(props: SubscriptionFormPanelProps) {
  return (
    <FormPage
      id="subscription-new"
      entity="subscription"
      embedded={toEmbedded(props)}
      title="New subscription"
      fallbackReturn={SUBSCRIPTIONS_FALLBACK}
      form="external"
      useLoad={useSubscriptionNewLoad}
      header={{ primary: null }}
    >
      {(ctx) =>
        ctx.extra ? (
          <SubscriptionForm
            mode="create"
            initial={ctx.extra.initial}
            categories={ctx.extra.categories}
            accounts={ctx.extra.accounts}
            onCancel={ctx.cancel}
            onSaved={ctx.finish}
          />
        ) : null
      }
    </FormPage>
  );
}

function EditSubscription(props: SubscriptionFormPanelProps) {
  return (
    <FormPage
      id="subscription-edit"
      entity="subscription"
      embedded={toEmbedded(props)}
      title="Edit subscription"
      fallbackReturn={SUBSCRIPTIONS_FALLBACK}
      form="external"
      useLoad={useSubscriptionEditLoad}
      states={{
        loading: { chrome: false, variant: "list", rows: 3 },
        error: { chrome: false, title: "Couldn't load subscription", message: "We couldn't load this subscription. Please try again.", retry: "refresh" },
        notFound: { chrome: false, kind: "error", title: "Subscription not found", message: "This subscription doesn't exist or was deleted.", retry: "returnTo" },
      }}
      delete={{
        label: "Delete subscription",
        confirmTitle: "Delete subscription",
        confirmLabel: "Delete subscription",
        describe: (sub) => <>Delete <strong>{sub.name ?? "this subscription"}</strong>? Your transactions are not affected. This cannot be undone.</>,
        request: (sub) => fetch(`/api/subscriptions?id=${sub.id}`, { method: "DELETE" }),
        after: SUBSCRIPTIONS_FALLBACK,
        errorStyle: "inline",
        keepOpenOnError: false,
        errorMessage: "Couldn't delete the subscription",
      }}
    >
      {(ctx) =>
        ctx.record && ctx.extra ? (
          <SubscriptionForm
            key={ctx.record.id}
            mode="edit"
            editing={ctx.record}
            initial={EMPTY_DRAFT}
            categories={ctx.extra.categories}
            accounts={ctx.extra.accounts}
            onCancel={ctx.cancel}
            onSaved={ctx.finish}
          />
        ) : null
      }
    </FormPage>
  );
}

export function SubscriptionFormPanel(props: SubscriptionFormPanelProps) {
  return props.mode === "edit" ? <EditSubscription {...props} /> : <CreateSubscription {...props} />;
}
