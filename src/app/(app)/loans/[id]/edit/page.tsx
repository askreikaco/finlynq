"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/mobile";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/page-skeleton";
import { safeReturnTo } from "@/lib/accounts/groups-return-to";
import { LoanForm } from "../../_components/loan-form";
import type { Loan, LoanAccount } from "../../_components/loan-types";

const LOANS_FALLBACK = "/loans";

function EditLoanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string }>();
  const returnTo = safeReturnTo(searchParams.get("returnTo"), LOANS_FALLBACK);
  const id = Number(params?.id);

  const [loan, setLoan] = useState<Loan | null>(null);
  const [accounts, setAccounts] = useState<LoanAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    // There is no single-loan GET; the list is the source the page already reads.
    fetch("/api/loans")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load loans"))))
      .then((data) => {
        if (cancelled) return;
        const rows: Loan[] = Array.isArray(data) ? data : [];
        setLoan(rows.find((l) => l.id === id) ?? null);
      })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    fetch("/api/accounts")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled && Array.isArray(data)) setAccounts(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  async function handleDelete() {
    if (!loan) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/loans?id=${loan.id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("Couldn't delete the loan");
        return;
      }
      router.push(LOANS_FALLBACK);
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (loading) return <PageSkeleton variant="list" rows={3} />;
  if (loadError) {
    return <ErrorState title="Couldn't load loan" message="We couldn't load this loan. Please try again." onRetry={() => router.refresh()} />;
  }
  if (!loan) {
    return <ErrorState title="Loan not found" message="This loan doesn't exist or was deleted." onRetry={() => router.push(returnTo)} />;
  }

  return (
    <div data-testid="loan-edit-root" className="mx-auto w-full max-w-xl">
      <PageHeader
        title="Edit loan"
        backHref={returnTo}
        backLabel="Back"
        className="flex items-center justify-between"
        overflow={[{ label: "Delete loan", icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) }]}
      />
      <div className="mt-3 pb-[calc(var(--sab,0px)+1.5rem)] space-y-3">
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
        <LoanForm
          key={loan.id}
          mode="edit"
          loan={loan}
          defaultCurrency={loan.currency}
          accounts={accounts}
          onCancel={() => router.push(returnTo)}
          onSaved={() => router.push(returnTo)}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => { if (!open && !deleting) setConfirmDelete(false); }}
        title="Delete loan"
        description={<>Are you sure you want to delete <strong>{loan.name}</strong>? This cannot be undone.</>}
        confirmLabel="Delete loan"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

export default function EditLoanRoute() {
  return (
    <Suspense fallback={null}>
      <EditLoanPage />
    </Suspense>
  );
}
