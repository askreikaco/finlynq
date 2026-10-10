"use client";

import { FormPage } from "@/components/templates";
import { GoalForm } from "../_components/goal-form";
import { useGoalNewLoad } from "../_components/use-goal-new-load";

export default function NewGoalRoute() {
  return (
    <FormPage
      id="goal-new"
      title="New financial goal"
      fallbackReturn="/goals"
      form="external"
      useLoad={useGoalNewLoad}
      header={{ actions: null }}
    >
      {(ctx) =>
        ctx.extra ? (
          <GoalForm
            mode="add"
            initial={ctx.extra.seed}
            accounts={ctx.extra.accounts}
            displayCurrency={ctx.extra.displayCurrency}
            onSaved={() => ctx.router.push(ctx.returnTo)}
            onCancel={() => ctx.router.push(ctx.returnTo)}
          />
        ) : null
      }
    </FormPage>
  );
}
