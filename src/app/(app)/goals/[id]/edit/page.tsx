"use client";

import { FormPage } from "@/components/templates";
import { useDisplayCurrency } from "@/components/currency-provider";
import { GoalForm } from "../../_components/goal-form";
import { useGoalEditLoad } from "../../_components/use-goal-edit-load";

export default function EditGoalRoute() {
  const { displayCurrency } = useDisplayCurrency();
  return (
    <FormPage
      id="goal-edit"
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
        request: (goal) => fetch(`/api/goals?id=${goal.id}`, { method: "DELETE" }),
        after: "returnTo",
        whenMissing: "disabled",
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
            onSaved={() => ctx.router.push(ctx.returnTo)}
            onCancel={() => ctx.router.push(ctx.returnTo)}
          />
        ) : null
      }
    </FormPage>
  );
}
