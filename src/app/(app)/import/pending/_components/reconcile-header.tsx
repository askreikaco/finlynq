"use client";

/**
 * Two-pane reconcile header + toolbar + re-apply-rules modal
 * (FINLYNQ-118 Phase 4).
 *
 * The batch-open header: title/subline, the Open-reconciliation link, the
 * Re-apply rules / Discard all / Send-to-bank-ledger action buttons, and the
 * FINLYNQ-88 re-apply confirmation Dialog. Extracted verbatim from
 * import/pending/page.tsx; all state + callbacks owned by the page.
 */

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  ArrowLeft, ArrowRight, Check, X, Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StagedDetail } from "../_types";
import { PageHeader, HEADER_DESKTOP_ONLY, OverflowMenu, type OverflowAction } from "@/components/mobile";

export function ReconcileHeader({
  detail,
  accountId,
  acting,
  reapplying,
  selectedCount,
  reapplyModalOpen,
  setReapplyModalOpen,
  closeDetail,
  reapplyRules,
  reject,
  approve,
  embedded = false,
}: {
  detail: StagedDetail | null;
  accountId: number | null;
  acting: boolean;
  reapplying: boolean;
  selectedCount: number;
  reapplyModalOpen: boolean;
  setReapplyModalOpen: (v: boolean) => void;
  closeDetail: () => void;
  reapplyRules: () => void;
  reject: () => void;
  approve: () => void;
  /** Inside the /import Staging tab: a plain toolbar (the /import page already has the one bar). */
  embedded?: boolean;
}) {
  const title = detail
    ? detail.staged.source === "upload"
      ? detail.staged.originalFilename || "Uploaded file"
      : detail.staged.subject || "(no subject)"
    : "Loading…";
  // Desktop-only actions move to the overflow menu below regular (route mode and the embedded toolbar alike).
  const overflow: OverflowAction[] = [
    { label: "Open reconciliation", href: accountId != null ? `/reconcile?account=${accountId}` : "/reconcile" },
    { label: "Re-apply rules", onSelect: () => setReapplyModalOpen(true), disabled: acting || reapplying },
    { label: "Discard all", onSelect: reject, disabled: acting, destructive: true },
  ];
  const actions = (
    <>
      <Link
        href={accountId != null ? `/reconcile?account=${accountId}` : "/reconcile"}
        className={`${buttonVariants({ variant: "outline" })} ${HEADER_DESKTOP_ONLY}`}
      >
        Open reconciliation
        <ArrowRight className="h-4 w-4 ml-1.5" />
      </Link>
      <Button
        variant="outline"
        className={HEADER_DESKTOP_ONLY}
        onClick={() => setReapplyModalOpen(true)}
        disabled={acting || reapplying}
        title="Re-apply all active rules over every row in this batch"
      >
        <Sparkles className="h-4 w-4 mr-1.5" />
        Re-apply rules
      </Button>
      <Button
        variant="ghost"
        onClick={reject}
        disabled={acting}
        className={`text-destructive hover:text-destructive hover:bg-destructive/10 ${HEADER_DESKTOP_ONLY}`}
      >
        <X className="h-4 w-4 mr-1.5" />
        Discard all
      </Button>
      <Button onClick={approve} disabled={acting || selectedCount === 0}>
        <Check className="h-4 w-4 mr-1.5" />
        Send to bank ledger {selectedCount > 0 && `(${selectedCount})`}
      </Button>
    </>
  );
  const subtitle = detail ? (
    <p className="text-xs text-muted-foreground mt-0.5">
      {detail.staged.source === "upload" && detail.staged.fileFormat
        ? `${detail.staged.fileFormat.toUpperCase()} upload`
        : `From ${detail.staged.fromAddress || "(unknown)"}`}
      {" · "}
      {detail.rows.length} {detail.rows.length === 1 ? "row" : "rows"}
      {detail.staged.dateRangeStart && detail.staged.dateRangeEnd && (
        <>
          {" · "}
          {detail.staged.dateRangeStart} → {detail.staged.dateRangeEnd}
        </>
      )}
    </p>
  ) : null;

  // FINLYNQ-88 — Re-apply rules confirmation modal.
  const reapplyDialog = (
          <Dialog open={reapplyModalOpen} onOpenChange={setReapplyModalOpen}>
            <DialogContent className="regular:max-w-md">
              <DialogHeader>
                <DialogTitle>Re-apply rules?</DialogTitle>
                <DialogDescription className="space-y-3 pt-2">
                  <span className="block">
                    This re-applies all active rules to every row in this batch. It
                    may overwrite manual edits to payee, category, tags, type, or
                    account on matched rows.
                  </span>
                  <span className="block">
                    Rows you&apos;ve already linked to existing transactions and
                    rows marked as duplicates are skipped.
                  </span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setReapplyModalOpen(false)}
                  disabled={reapplying}
                >
                  Cancel
                </Button>
                <Button onClick={reapplyRules} disabled={reapplying}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {reapplying ? "Re-applying…" : "Re-apply"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
  );

  if (embedded) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon" onClick={closeDetail} aria-label="Back to list">
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <h2 className="truncate text-lg font-semibold">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OverflowMenu items={overflow} />
            {actions}
          </div>
        </div>
        {subtitle}
        {reapplyDialog}
      </>
    );
  }

  return (
    <>
      <PageHeader
        className="flex flex-wrap items-center justify-between gap-3"
        title={title}
        titleClassName="text-2xl font-bold tracking-tight"
        onBack={closeDetail}
        backLabel="Back to Pending Imports"
        actionsClassName="flex flex-wrap items-center gap-2"
        actions={actions}
        overflow={overflow}
      />
      {subtitle}
      {reapplyDialog}
    </>
  );
}

