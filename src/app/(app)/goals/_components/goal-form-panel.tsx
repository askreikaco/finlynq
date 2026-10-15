"use client";

/**
 * GoalFormPanel: THE goal create / edit form. /goals/new and /goals/[id]/edit render it as a page; the /goals split
 * view renders it `embedded` in the pane. One component, so fields, validation, the offline queue and the delete
 * confirm are the same code in both. `embedded` only changes chrome (see FormPage).
 */
import { FormPage, type FormPageEmbedded } from "@/components/templates";
import { useDisplayCurrency } from "@/components/currency-provider";
import { GoalForm } from "./goal-form";
import { useGoalEditLoad } from "./use-goal-edit-load";
import { useGoalNewLoad } from "./use-goal-new-load";
import { isLocalWriteQueueActive, queueOfflineEntityDelete } from "@/lib/data/local-write-queue";
import { isNetworkFailure } from "@/lib/transactions/entry-mode";

export interface GoalFormPanelProps {
  mode: "create" | "edit";
  /** Pane only: the goal id (the routes read it from the URL). */
  id?: string;
  embedded?: boolean;
  onSaved?: () => void;
  onCancel?: () => void;
  onDeleted?: () => void;
}

function toEmbedded(p: GoalFormPanelProps): FormPageEmbedded | undefined {
  return p.embedded ? { id: p.id, onSaved: p.onSaved, onCancel: p.onCancel, onDeleted: p.onDeleted } : undefined;
}

function CreateGoal(props: GoalFormPanelProps) {
  return (
    <FormPage
      id="goal-new"
      entity="goal"
      embedded={toEmbedded(props)}
      title="New financial goal"
      fallbackReturn="/goals"
      form="external"
      useLoad={useGoalNewLoad}
      header={{ primary: null }}
    >
      {(ctx) =>
        ctx.extra ? (
          <GoalForm
            mode="add"
            initial={ctx.extra.seed}
            accounts={ctx.extra.accounts}
            displayCurrency={ctx.extra.displayCurrency}
            onSaved={ctx.finish}
            onCancel={ctx.cancel}
          />
        ) : null
      }
    </FormPage>
  );
}

function EditGoal(props: GoalFormPanelProps) {
  const { displayCurrency } = useDisplayCurrency();
  return (
    <FormPage
      id="goal-edit"
      entity="goal"
      embedded={toEmbedded(props)}
      title="Edit goal"
      fallbackReturn="/goals"
      form="external"
      useLoad={useGoalEditLoad}
      states={{
        loading: { chrome: false, variant: "cards", rows: 1 },
        error: {
          chrome: false,
          title: "Couldn't load goal",
          message: "We couldn't load this goal. Please try again.",
          retry: "reload",
        },
        notFound: { chrome: true, kind: "text", message: "This goal no longer exists.", linkLabel: "Back to goals" },
      }}
      delete={{
        label: "Delete goal",
        headerLabel: "Delete",
        confirmTitle: "Delete goal",
        confirmLabel: "Delete goal",
        describe: (goal) => (
          <>Are you sure you want to delete <strong>{goal.name ?? "this goal"}</strong>? This cannot be undone.</>
        ),
        request: async (goal) => {
          try {
            return await fetch(`/api/goals?id=${goal.id}`, { method: "DELETE" });
          } catch (netErr) {
            // Offline queue (local-first L3): a network failure keeps the delete on this device. Flag off = rethrow.
            if (isLocalWriteQueueActive() && isNetworkFailure(netErr)) {
              const g = goal as unknown as Record<string, string | number | null | undefined>;
              const queued = await queueOfflineEntityDelete(
                "goal",
                goal.id,
                { name: g.name ?? null, type: g.type ?? null, targetAmount: g.targetAmount ?? null, currency: g.currency ?? null, deadline: g.deadline ?? null, priority: g.priority ?? null, note: g.note ?? null, updatedAt: (g.updatedAt as string | undefined) ?? null },
              );
              if (queued) return new Response(null, { status: 200 });
            }
            throw netErr;
          }
        },
        after: "returnTo",
        ignoreStatus: true,
      }}
    >
      {(ctx) =>
        ctx.record && ctx.extra ? (
          <GoalForm
            mode="edit"
            goalId={ctx.record.id}
            initial={ctx.extra.form}
            accounts={ctx.extra.accounts}
            displayCurrency={displayCurrency}
            baseline={ctx.record}
            onSaved={ctx.finish}
            onCancel={ctx.cancel}
          />
        ) : null
      }
    </FormPage>
  );
}

export function GoalFormPanel(props: GoalFormPanelProps) {
  return props.mode === "edit" ? <EditGoal {...props} /> : <CreateGoal {...props} />;
}
