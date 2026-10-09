"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader, HEADER_DESKTOP_ONLY, type OverflowAction } from "@/components/mobile";
import { useDisplayCurrency } from "@/components/currency-provider";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { Trash2 } from "lucide-react";
import { GoalForm, goalToForm, type Account, type Goal, type GoalFormState } from "../../_components/goal-form";

const GOALS_HOME = "/goals";

function EditGoalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const goalId = Number(id);
  const returnTo = safeReturnTo(searchParams.get("returnTo"), GOALS_HOME);
  const { displayCurrency } = useDisplayCurrency();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [form, setForm] = useState<GoalFormState | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    fetch("/api/goals")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load goals"))))
      .then((data: Goal[]) => {
        const found = Array.isArray(data) ? data.find((g) => g.id === goalId) ?? null : null;
        setGoal(found);
        setForm(found ? goalToForm(found, displayCurrency) : null);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [goalId, displayCurrency]);

  useEffect(() => {
    load();
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [load]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/goals?id=${goalId}`, { method: "DELETE" });
      setConfirmDelete(false);
      router.push(returnTo);
    } finally {
      setDeleting(false);
    }
  }

  const overflow: OverflowAction[] = [
    { label: "Delete goal", icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) },
  ];

  if (loading) return <PageSkeleton variant="cards" rows={1} />;
  if (loadError) return <ErrorState title="Couldn't load goal" message="We couldn't load this goal. Please try again." onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div data-testid="goal-edit-root" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Edit goal"
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
        overflow={goal ? overflow : undefined}
        actions={
          <Button
            variant="outline"
            size="sm"
            className={`${HEADER_DESKTOP_ONLY} text-destructive`}
            onClick={() => setConfirmDelete(true)}
            disabled={!goal}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        }
      />
      {goal && form ? (
        <div className="mt-3 pb-[calc(var(--sab,0px)+1.5rem)]">
          <GoalForm
            mode="edit"
            goalId={goal.id}
            initial={form}
            accounts={accounts}
            displayCurrency={displayCurrency}
            onSaved={() => router.push(returnTo)}
            onCancel={() => router.push(returnTo)}
          />
        </div>
      ) : (
        <div className="mt-6 text-sm text-muted-foreground">
          This goal no longer exists. <Link href={returnTo} className="underline">Back to goals</Link>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(false); }}
        title="Delete goal"
        description={<>Are you sure you want to delete <strong>{goal?.name ?? "this goal"}</strong>? This cannot be undone.</>}
        confirmLabel="Delete goal"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function EditGoalRoute() {
  return (
    <Suspense fallback={null}>
      <EditGoalPage />
    </Suspense>
  );
}
