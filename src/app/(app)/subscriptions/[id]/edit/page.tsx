"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/mobile";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { SubscriptionForm, EMPTY_DRAFT } from "../../_components/subscription-form";
import type { Subscription } from "../../_components/types";

const SUBSCRIPTIONS_FALLBACK = "/subscriptions";

type Option = { id: number; name: string | null };

function EditSubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), SUBSCRIPTIONS_FALLBACK);
  const id = Number(params?.id);

  const [sub, setSub] = useState<Subscription | null>(null);
  const [categories, setCategories] = useState<Option[]>([]);
  const [accounts, setAccounts] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    // There is no single-subscription GET; the list is the source the page already reads.
    fetch("/api/subscriptions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((data) => {
        if (cancelled) return;
        const rows: Subscription[] = Array.isArray(data) ? data : [];
        setSub(rows.find((s) => s.id === id) ?? null);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setCategories(data); })
      .catch(() => {});
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setAccounts(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  async function handleDelete() {
    if (!sub) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/subscriptions?id=${sub.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("Couldn't delete the subscription");
        return;
      }
      router.push(SUBSCRIPTIONS_FALLBACK);
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) return <PageSkeleton variant="list" rows={3} />;
  if (loadError) {
    return <ErrorState title="Couldn't load subscription" message="We couldn't load this subscription. Please try again." onRetry={() => router.refresh()} />;
  }
  if (!sub) {
    return <ErrorState title="Subscription not found" message="This subscription doesn't exist or was deleted." onRetry={() => router.push(returnTo)} />;
  }

  return (
    <div data-testid="subscription-edit-root" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Edit subscription"
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
        overflow={[{ label: "Delete subscription", icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) }]}
      />
      <div className="mt-3 pb-[calc(var(--sab,0px)+1.5rem)] space-y-3">
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
        <SubscriptionForm
          key={sub.id}
          mode="edit"
          editing={sub}
          initial={EMPTY_DRAFT}
          categories={categories}
          accounts={accounts}
          onCancel={() => router.push(returnTo)}
          onSaved={() => router.push(returnTo)}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => { if (!open && !deleting) setConfirmDelete(false); }}
        title="Delete subscription"
        description={<>Delete <strong>{sub.name ?? "this subscription"}</strong>? Your transactions are not affected. This cannot be undone.</>}
        confirmLabel="Delete subscription"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function EditSubscriptionRoute() {
  return (
    <Suspense fallback={null}>
      <EditSubscriptionPage />
    </Suspense>
  );
}
