"use client";

/**
 * Unresolved-category banner for /import/pending (FINLYNQ-57, FINLYNQ-90).
 *
 * Rendered above the row table when the approve endpoint returned 400 with
 * `code: 'unresolved_categories'`. Lists the N affected rows by payee and
 * exposes three options per row (well — two inline; the third is the
 * existing per-row editor below the banner):
 *
 *   1. Assign category to this row only → uses the existing PATCH endpoint
 *      at /api/import/staged/[id]/rows/[rowId] (NOT re-implemented here).
 *      The user just expands the row in the table below and uses the
 *      StagedRowEditor; this banner stays out of the way for that path.
 *   2. Create a rule + apply to current batch → opens the full-page rule
 *      editor /settings/rules/new with the row's payee seeded (query params,
 *      see lib/rules/rule-prefill.ts). The page submits to
 *      POST /api/import/staged/[id]/create-rule. Historical `transactions`
 *      are untouched (scoped per the item spec).
 *   3. Cancel → dismiss the banner; user is free to manually assign or
 *      re-approve. The unresolved set will reappear on the next approve
 *      attempt if any row still lacks a category.
 *
 * "Create rule" navigates to the rule page with returnTo = the current
 * /import/pending URL (its ?id= reopens this batch). The page remounts on
 * return, so the unresolved set is recomputed on the next Approve attempt
 * instead of shrinking in place.
 *
 * No FK lists are fetched here: the rule page loads them itself.
 */

import { useRouter } from "next/navigation";
import { AlertTriangle, X, PlusCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface UnresolvedRow {
  id: string;
  payee: string;
}

interface Props {
  stagedImportId: string;
  rowIds: string[];
  payees: string[];
  /**
   * Legacy: called after a rule POST succeeded in the old in-place dialog. Rule
   * creation now navigates away, so this is no longer invoked. Optional so the
   * parent (staged-review-surface.tsx) keeps compiling until it is removed.
   */
  onRuleApplied?: () => void;
  /** User-dismissed the banner without resolving. Parent clears state. */
  onDismiss: () => void;
}

export function UnresolvedCategoriesBanner({
  stagedImportId,
  rowIds,
  payees,
  onDismiss,
}: Props) {
  const router = useRouter();

  // "Create rule" → full-page editor. returnTo is this page (keeps ?id= so the
  // batch reopens). Read at click time; no state or effects needed.
  const createRuleForRow = (payee: string) => {
    const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/import/pending";
    const qs = new URLSearchParams({
      payee: (payee || "").trim(),
      stagedImportId,
      returnTo: here,
    });
    router.push(`/settings/rules/new?${qs.toString()}`);
  };

  if (rowIds.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/10">
      <CardContent className="py-3 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning">
              {rowIds.length} row{rowIds.length === 1 ? "" : "s"} need a category before import
            </p>
            <p className="text-xs text-warning mt-0.5">
              Assign a category to each row (expand the row below) or create a rule that covers a payee pattern. Transfers don&apos;t need one.
            </p>
            <p className="text-xs text-warning mt-0.5">
              If you added a transfer or account rule recently, click <strong>Re-apply rules</strong> at the top of the page.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss banner"
            className="text-warning hover:text-warning p-1 -m-1 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-1.5 ml-6">
          {rowIds.map((rid, idx) => {
            const payee = payees[idx] ?? "(no payee)";
            return (
              <li key={rid} className="text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-warning break-all">
                    {payee || <span className="italic text-muted-foreground">(empty payee)</span>}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs border-warning/30 hover:bg-warning/10"
                    onClick={() => createRuleForRow(payees[idx] ?? "")}
                  >
                    <PlusCircle className="h-3 w-3 mr-1" />
                    Create rule
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>

    </Card>
  );
}
