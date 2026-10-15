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

import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Check, Sparkles, ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { Overlay } from "@/components/ui/overlay";
import type { StagedDetail } from "../_types";
import { PageHeader, MoreActionsMenu, type MoreItem } from "@/components/mobile";
import { InfoTip } from "@/components/ui/info-tip";

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
  // Secondary actions live in More (route mode and the embedded toolbar alike).
  const more: MoreItem[] = [
    { label: "Open reconciliation", href: accountId != null ? `/reconcile?account=${accountId}` : "/reconcile" },
    { label: "Re-apply rules", onSelect: () => setReapplyModalOpen(true), disabled: acting || reapplying },
    { label: "Discard all", onSelect: reject, disabled: acting, destructive: true },
  ];
  const approveLabel = `Send to bank ledger${selectedCount > 0 ? ` (${selectedCount})` : ""}`;
  const subtitleText = detail ? (
    <>
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
    </>
  ) : null;

  // FINLYNQ-88 — Re-apply rules confirmation modal.
  const reapplyDialog = (
          <Overlay
            open={reapplyModalOpen}
            onClose={() => setReapplyModalOpen(false)}
            size="md"
            title="Re-apply rules?"
            info={<><span className="block">
                    This re-applies all active rules to every row in this batch. It
                    may overwrite manual edits to payee, category, tags, type, or
                    account on matched rows.
                  </span>
                  <span className="block">
                    Rows you&apos;ve already linked to existing transactions and
                    rows marked as duplicates are skipped.
                  </span></>}
            actions={[
              { label: "Cancel", kind: "ghost", onClick: () => setReapplyModalOpen(false), disabled: reapplying },
              { label: <><Sparkles className="h-4 w-4 mr-1.5" />
                  {reapplying ? "Re-applying…" : "Re-apply"}</>, kind: "primary", onClick: reapplyRules, disabled: reapplying },
            ]}
          />
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
            {subtitleText ? <InfoTip text={subtitleText} label="About this batch" side="bottom" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MoreActionsMenu items={more} />
            <Button onClick={approve} disabled={acting || selectedCount === 0}>
              <Check className="h-4 w-4 mr-1.5" />
              {approveLabel}
            </Button>
          </div>
        </div>
        {reapplyDialog}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        info={subtitleText}
        back={{ onBack: closeDetail, label: "Back to Pending Imports" }}
        more={more}
        primary={{ kind: "save", label: approveLabel, onSelect: approve, busy: acting, disabled: acting || selectedCount === 0 }}
      />
      {reapplyDialog}
    </>
  );
}

