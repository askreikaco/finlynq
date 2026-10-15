"use client";

/**
 * /settings/backfill/[runId] — two-pane review for a backfill run.
 *
 * Left pane: proposal list with confidence chips + summary
 * Right pane: detail view of selected proposal
 *   - displaced rows → replacement rows
 *   - drift proposals: two-radio variant picker
 *   - dependency callout if a dependent is checked without parents
 *
 * Live feature doc: pf-app/docs/architecture/backfill.md.
 */

import { useState, useEffect, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { AlertTriangle, CalendarClock, CheckCircle2, Database, History, Landmark, Layers, Loader2, PlusCircle, Receipt, RefreshCw, ShieldCheck, Undo2, Wallet } from "lucide-react";
import { ListRow, MetricGrid, SectionCard } from "@/components/mobile";
import { SectionPage } from "@/components/templates";
import { Field } from "@/components/ui/field";
import { Overlay } from "@/components/ui/overlay";

// MUST stay in sync with the CHECK constraint on
// backfill_proposals.chosen_kind (migration 20260609), with OverrideKind
// in src/lib/portfolio/backfill/apply.ts, and with the overrideKindSchema
// Zod in /api/settings/backfill/[runId]/route.ts.
type OverrideKind =
  | "opening_balance"
  | "dividend"
  | "interest"
  | "portfolio_income"
  | "portfolio_expense"
  | "buy"
  | "sell"
  | "in_kind_transfer_in"
  | "in_kind_transfer_out"
  | "fx_from"
  | "fx_to"
  | "brokerage_deposit_in"
  | "brokerage_deposit_out"
  | "brokerage_withdrawal_in"
  | "brokerage_withdrawal_out";

const OVERRIDE_PAIRLESS_KINDS: ReadonlySet<OverrideKind> = new Set<OverrideKind>([
  "opening_balance",
  "dividend",
  "interest",
  "portfolio_income",
  "portfolio_expense",
]);

// Paired kinds wired in the UI. Buy/Sell (same-account) support synth_new +
// link_existing; the cross-account kinds (brokerage cash-sleeve leg / fx /
// transfer) support link_existing only. The external-leg brokerage kinds stay
// disabled — they can't be an investment-account orphan. Keep in sync with
// apply.ts (OVERRIDE_BUYSELL_KINDS / CROSS_ACCOUNT_OVERRIDE_KINDS).
const OVERRIDE_PAIRED_ENABLED_KINDS: ReadonlySet<OverrideKind> = new Set<OverrideKind>([
  "buy",
  "sell",
  "brokerage_deposit_in",
  "brokerage_withdrawal_out",
  "fx_from",
  "fx_to",
  "in_kind_transfer_in",
  "in_kind_transfer_out",
]);

// Paired kinds that can synthesize their counterpart (same-account only).
const OVERRIDE_SYNTH_KINDS: ReadonlySet<OverrideKind> = new Set<OverrideKind>(["buy", "sell"]);

function isOverrideKindEnabled(kind: OverrideKind): boolean {
  return OVERRIDE_PAIRLESS_KINDS.has(kind) || OVERRIDE_PAIRED_ENABLED_KINDS.has(kind);
}

// A candidate counterpart row from /counterpart-candidates (link_existing mode).
interface CounterpartCandidate {
  id: number;
  date: string;
  accountId: number | null;
  currency: string;
  amount: number;
  quantity: number | null;
  kind: string | null;
  portfolioHoldingId: number | null;
  isCashSleeve: boolean;
  holdingName: string | null;
  reason: string;
}

interface Proposal {
  id: number;
  runId: string;
  proposalKind: string;
  confidence: "high" | "medium" | "low" | "refused";
  refusalReason: string | null;
  summary: string;
  existingRowIds: number[];
  // For non-drift: ReplacementRow[]; for drift: { separate_fee_row: DriftVariant; absorb_into_cost: DriftVariant }
  replacementRowsJson: unknown;
  synthesizedRowsJson: unknown;
  deltasJson: { balance: number; lots: Array<{ holdingId: number; qtyDelta: number }>; realizedGainBase: number | null };
  dependsOnProposalIds: number[];
  variantChoice: "separate_fee_row" | "absorb_into_cost" | null;
  // Phase 2 backfill — dividend_reinvestment proposals require the user
  // to pick the underlying stock holding before apply. `chosenHoldingId`
  // mirrors `variantChoice` for the holding-picker flow.
  chosenHoldingId: number | null;
  candidateHoldingIds: number[];
  // Phase 4b — dividend_reinvestment variant: cash_dividend (zero qty,
  // no lot) or drip (qty as shares, lot opens).
  dividendVariant: "cash_dividend" | "drip" | null;
  // 2026-06-09 — kind override on refused orphan_stock_leg proposals
  // (migration 20260609). NULL on every other proposal kind.
  chosenKind: OverrideKind | null;
  chosenCounterpartTxId: number | null;
  chosenCounterpartMode: "link_existing" | "synth_new" | null;
  chosenRelatedHoldingId: number | null;
  // 2026-06-14 — category for a pair-less income override (migration 20260614).
  chosenCategoryId: number | null;
  status: string;
}

interface Coverage {
  accountCount: number;
  totalTxs: number;
  canonicalTxs: number;
  nonCanonicalTxs: number;
  canonicalPct: number;
  // Rows on investment accounts with no portfolio_holding_id — not investment
  // transactions at all (invariant: is_investment ⇒ references a holding).
  nonInvestmentRows?: number;
  perAccount: Array<{ accountId: number; name: string; total: number; canonical: number; pending: number; pendingPct: number; missingLots?: number; nonInvestmentRows?: number }>;
}

interface DisplacedRow {
  id: number;
  date: string;
  accountId: number | null;
  portfolioHoldingId: number | null;
  // 2026-06-09 — added so RowDetails can render the secondary line.
  relatedHoldingId: number | null;
  categoryId: number | null;
  amount: number;
  currency: string;
  quantity: number | null;
  kind: string | null;
  tradeLinkId: string | null;
  linkId: string | null;
  note: string | null;
  tags: string | null;
  payee: string | null;
  source: string | null;
}

interface HoldingMeta { name: string | null; isCash: boolean; currency: string }
interface AccountMeta { name: string | null; currency: string }
interface CategoryMeta { name: string | null; type: string | null }

const REFUSAL_EXPLANATIONS: Record<string, string> = {
  no_cash_pair_found:
    "No cash-sleeve row with matching amount on the same date in this account. If this brokerage's cash is tracked elsewhere, leave this proposal — manually record the matching cash debit/credit in /transactions, then re-run. If you don't track this brokerage's cash in Finlynq, start a new run in 'synthesize_orphans' mode.",
  cross_currency_trade:
    "Stock leg and cash leg are in different currencies — Phase 2 canonical shape requires same-currency pairs. Record an FX Conversion first (CAD↔USD whichever way), then re-run.",
  combined_cash_leg:
    "Multiple stock legs share one cash row. Phase 2 only supports 1:1 pairs. Split the combined cash row into per-trade rows in /transactions first.",
  ambiguous_cash_candidates:
    "More than one cash-sleeve row matches the stock leg by date+amount. Disambiguate in /transactions (delete or edit the wrong candidate), then re-run.",
  no_cash_sleeve_to_synthesize_into:
    "Synthesize mode needs a cash sleeve in the matching currency on this account, but none exists. Create one from the account detail page first.",
  non_investment_in_investment_account:
    "This row has no holding, so it isn't an investment transaction — yet it lives in an investment account (the invariant is: every row in an investment account references a holding). It's most likely a mis-filed expense, income, or transfer. Move it to a cash account or delete it in /transactions. If it really was an investment fee or income, use the kind-override picker to reclassify it (e.g. Portfolio expense / Portfolio income).",
};

export default function BackfillReviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [displacedRows, setDisplacedRows] = useState<Record<number, DisplacedRow>>({});
  const [holdingMap, setHoldingMap] = useState<Record<number, HoldingMeta>>({});
  const [accountMap, setAccountMap] = useState<Record<number, AccountMeta>>({});
  const [categoryMap, setCategoryMap] = useState<Record<number, CategoryMeta>>({});
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Proposal detail sheet (the list is the one column at every width).
  const [detailOpen, setDetailOpen] = useState(false);
  // Left-list ordering: "default" = API order (by proposal id); "date" =
  // earliest displaced-row date ascending (the natural ledger reading order).
  const [sortMode, setSortMode] = useState<"default" | "date">("default");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>("");
  const [info, setInfo] = useState<string>("");

  async function loadProposals(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    try {
      const res = await fetch(`/api/settings/backfill/${runId}`);
      const data = await res.json();
      setProposals(data.proposals ?? []);
      const rowsById: Record<number, DisplacedRow> = {};
      for (const r of (data.displacedRows ?? []) as DisplacedRow[]) rowsById[r.id] = r;
      setDisplacedRows(rowsById);
      setHoldingMap(data.holdingMap ?? {});
      setAccountMap(data.accountMap ?? {});
      setCategoryMap(data.categoryMap ?? {});
      if ((data.proposals ?? []).length > 0 && selectedId == null) {
        setSelectedId(data.proposals[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load proposals");
    }
    if (!opts.silent) setLoading(false);
  }

  useEffect(() => { loadProposals(); }, [runId]);

  useEffect(() => {
    fetch(`/api/settings/backfill/coverage`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: Coverage | null) => { if (data) setCoverage(data); })
      .catch(() => setCoverage(null));
  }, [runId, proposals]); // refetch after proposals change (post-apply)

  async function updateProposal(
    proposalId: number,
    patch: {
      status?: string;
      variantChoice?: string | null;
      chosenHoldingId?: number | null;
      dividendVariant?: "cash_dividend" | "drip" | null;
      chosenKind?: OverrideKind | null;
      chosenCounterpartTxId?: number | null;
      chosenCounterpartMode?: "link_existing" | "synth_new" | null;
      chosenRelatedHoldingId?: number | null;
      chosenCategoryId?: number | null;
    },
  ) {
    setError("");
    const res = await fetch(`/api/settings/backfill/${runId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, ...patch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err?.error ?? `HTTP ${res.status}`);
      return false;
    }
    await loadProposals({ silent: true });
    return true;
  }

  async function applyAll() {
    setApplying(true);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/settings/backfill/${runId}/apply`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.failed?.message ?? data?.error ?? `HTTP ${res.status}`);
      } else {
        setInfo(`Applied ${data.applied.length} proposal(s).`);
      }
      await loadProposals();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    }
    setApplying(false);
  }

  async function undoProposal(proposalId: number) {
    setError("");
    setInfo("");
    const res = await fetch(`/api/settings/backfill/${runId}/undo/${proposalId}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message ?? data?.error ?? `HTTP ${res.status}`);
    } else {
      setInfo(`Undone proposal #${proposalId}.`);
    }
    await loadProposals();
  }

  const selected = useMemo(() => proposals.find((p) => p.id === selectedId) ?? null, [proposals, selectedId]);
  const approvedCount = proposals.filter((p) => p.status === "approved").length;
  const appliedCount = proposals.filter((p) => p.status === "applied").length;

  // Sorted view of the proposal list for the left pane. Proposals carry no
  // date of their own, so "date" mode keys on the EARLIEST displaced-row date
  // among each proposal's existingRowIds (ISO strings sort lexicographically).
  // Ties fall back to proposal id so the order is stable.
  const sortedProposals = useMemo(() => {
    if (sortMode === "default") return proposals;
    return [...proposals].sort((a, b) => {
      const da = earliestRowDate(a, displacedRows);
      const db = earliestRowDate(b, displacedRows);
      return da < db ? -1 : da > db ? 1 : a.id - b.id;
    });
  }, [proposals, displacedRows, sortMode]);

  return (
    <SectionPage
      id="settings-backfill-run"
      title="Backfill review"
      width="report"
      center
      header={{
        more: [{ label: "New run", icon: RefreshCw, onSelect: () => router.push("/settings/backfill") }],
        primary: {
          kind: "save",
          label: `Apply ${approvedCount} approved`,
          onSelect: applyAll,
          busy: applying,
          disabled: applying || approvedCount === 0,
        },
      }}
    >
      {error && <div className="border border-destructive bg-destructive/10 text-destructive rounded p-3 text-sm">{error}</div>}
      {info && <div className="border border-pos/40 bg-pos/10 text-pos rounded p-3 text-sm flex items-center gap-2"><CheckCircle2 className="size-4" /> {info}</div>}

      {coverage && <CoverageDashboard coverage={coverage} proposals={proposals} />}

      {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>}

      {!loading && proposals.length === 0 && (
        <SectionCard>
          <p className="py-8 text-center text-sm text-muted-foreground" data-keep="empty">
            No proposals. Ledger is already canonical.
          </p>
        </SectionCard>
      )}

      {!loading && proposals.length > 0 && (
        <SectionCard padded={false}>
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 text-xs">
            <span className="text-muted-foreground" data-keep="status">{sortedProposals.length} proposal(s) · {approvedCount} approved · {appliedCount} applied</span>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Sort:</span>
              <button
                type="button"
                onClick={() => setSortMode("default")}
                className={`rounded px-2 py-0.5 border ${sortMode === "default" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}
              >
                Default
              </button>
              <button
                type="button"
                onClick={() => setSortMode("date")}
                className={`rounded px-2 py-0.5 border ${sortMode === "date" ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/50"}`}
              >
                Date
              </button>
            </div>
          </div>
          <div className="max-h-[70dvh] [&>*:not(:last-child)]:shadow-[var(--list-divider)] overflow-y-auto">
            {sortedProposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                selected={p.id === selectedId}
                onSelect={() => { setSelectedId(p.id); setDetailOpen(true); }}
                onToggleApprove={() => updateProposal(p.id, { status: p.status === "approved" ? "pending" : "approved" })}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Proposal detail (the list above is the one column). */}
      <Overlay
        variant="detail"
        open={detailOpen && selected != null}
        onClose={() => setDetailOpen(false)}
        size="xl"
        title="Proposal detail"
      >
          {selected && (
            <div className="pb-2">
              <ProposalDetail
                runId={runId}
                proposal={selected}
                displacedRows={displacedRows}
                holdingMap={holdingMap}
                accountMap={accountMap}
                categoryMap={categoryMap}
                onVariantChange={(v) => updateProposal(selected.id, { variantChoice: v })}
                onHoldingChange={(id) => updateProposal(selected.id, { chosenHoldingId: id })}
                onDividendVariantChange={(v) => updateProposal(selected.id, { dividendVariant: v })}
                onApprove={() => updateProposal(selected.id, { status: "approved" })}
                onReject={() => updateProposal(selected.id, { status: "rejected" })}
                onUndo={() => undoProposal(selected.id)}
                onApproveOverride={(payload) =>
                  updateProposal(selected.id, {
                    status: "approved",
                    chosenKind: payload.chosenKind,
                    chosenRelatedHoldingId: payload.chosenRelatedHoldingId ?? null,
                    chosenCounterpartMode: payload.chosenCounterpartMode ?? null,
                    chosenCounterpartTxId: payload.chosenCounterpartTxId ?? null,
                    chosenCategoryId: payload.chosenCategoryId ?? null,
                  })
                }
              />
            </div>
          )}
      </Overlay>
    </SectionPage>
  );
}

/**
 * Earliest displaced-row date for a proposal (ISO "YYYY-MM-DD"), used as the
 * sort key for the "Date" left-list ordering. Proposals with no resolvable row
 * date sort last. ISO strings compare lexicographically.
 */
function earliestRowDate(p: Proposal, rows: Record<number, DisplacedRow>): string {
  let min: string | null = null;
  for (const id of p.existingRowIds) {
    const d = rows[id]?.date;
    if (d && (min == null || d < min)) min = d;
  }
  return min ?? "9999-12-31";
}

function ProposalCard({
  proposal,
  selected,
  onSelect,
  onToggleApprove,
}: {
  proposal: Proposal;
  selected: boolean;
  onSelect: () => void;
  onToggleApprove: () => void;
}) {
  const isApproved = proposal.status === "approved";
  const isApplied = proposal.status === "applied";
  const isRefused = proposal.confidence === "refused";
  const realized = proposal.deltasJson.realizedGainBase;
  // The checkbox sits beside the row, not inside its button (no interactive nesting).
  return (
    <div className={`flex items-center ${selected ? "bg-muted" : ""}`}>
      {!isRefused && !isApplied && (
        <Field
          control="checkbox"
          aria-label={`Approve: ${proposal.summary}`}
          checked={isApproved}
          onChange={onToggleApprove}
        />
      )}
      <div className="min-w-0 flex-1">
        <ListRow
          title={proposal.summary}
          subtitle={`${proposal.proposalKind} · Δ balance ${proposal.deltasJson.balance.toFixed(2)}${realized != null ? ` · realized ${realized.toFixed(2)}` : ""}`}
          value={<ConfidenceBadge confidence={proposal.confidence} />}
          secondary={isApplied ? "Applied" : isApproved ? "Approved" : undefined}
          secondaryTone={isApplied ? "pos" : "muted"}
          onPress={onSelect}
        />
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: Proposal["confidence"] }) {
  const styles: Record<Proposal["confidence"], string> = {
    high: "bg-pos/20 text-pos border-pos/40",
    medium: "bg-warning/20 text-warning border-warning/40",
    low: "bg-warning/20 text-warning border-warning/40",
    refused: "bg-destructive/20 text-destructive border-destructive/40",
  };
  return <Badge className={`text-xs ${styles[confidence]}`}>{confidence}</Badge>;
}

function ProposalDetail({
  runId,
  proposal,
  displacedRows,
  holdingMap,
  accountMap,
  categoryMap,
  onVariantChange,
  onHoldingChange,
  onDividendVariantChange,
  onApprove,
  onReject,
  onUndo,
  onApproveOverride,
}: {
  runId: string;
  proposal: Proposal;
  displacedRows: Record<number, DisplacedRow>;
  holdingMap: Record<number, HoldingMeta>;
  accountMap: Record<number, AccountMeta>;
  categoryMap: Record<number, CategoryMeta>;
  onVariantChange: (v: "separate_fee_row" | "absorb_into_cost" | null) => void;
  onHoldingChange: (id: number | null) => void;
  onDividendVariantChange: (v: "cash_dividend" | "drip" | null) => void;
  onApprove: () => void;
  onReject: () => void;
  onUndo: () => void;
  onApproveOverride: (payload: {
    chosenKind: OverrideKind;
    chosenRelatedHoldingId?: number | null;
    chosenCounterpartMode?: "link_existing" | "synth_new" | null;
    chosenCounterpartTxId?: number | null;
    chosenCategoryId?: number | null;
  }) => Promise<boolean> | void;
}) {
  const isDrift = proposal.proposalKind === "drift";
  const isRefused = proposal.confidence === "refused";
  const isOrphan = proposal.proposalKind === "orphan_stock_leg";
  const isOpeningBalance = proposal.proposalKind === "opening_balance";
  const isDripReinvest = proposal.proposalKind === "dividend_reinvestment";
  const isApplied = proposal.status === "applied";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle icon={History} tone="amber" className=" leading-snug">{proposal.summary}</CardTitle>
          <div className="flex gap-2 shrink-0">
            {!isApplied && !isRefused && !isOrphan && (
              <>
                <Button size="sm" variant="outline" onClick={onReject}>Reject</Button>
                <Button size="sm" onClick={onApprove} disabled={proposal.status === "approved"}>Approve</Button>
              </>
            )}
            {isApplied && (
              <Button size="sm" variant="outline" onClick={onUndo}><Undo2 className="size-4 mr-1" /> Undo</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {(isRefused || isOrphan) && (
          <div className="border border-warning/40 bg-warning/10 text-warning rounded p-3 flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                {proposal.refusalReason === "non_investment_in_investment_account"
                  ? "Not an investment transaction"
                  : isOrphan
                    ? "Manual fix needed"
                    : `Refused: ${proposal.refusalReason ?? "no reason"}`}
              </div>
              <div className="text-xs mt-1 opacity-90">
                {(proposal.refusalReason && REFUSAL_EXPLANATIONS[proposal.refusalReason]) ?? (
                  isOrphan
                    ? "This proposal can&apos;t be auto-applied because the planner couldn&apos;t propose a canonical reshape."
                    : "Resolve the underlying issue in /transactions, then re-run the backfill."
                )}
              </div>
            </div>
          </div>
        )}

        {isOpeningBalance && (
          <div className="border border-info/40 bg-info/10 text-info rounded p-3 flex items-start gap-2">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Opening balance</div>
              <div className="text-xs mt-1 opacity-90">
                This is the earliest transaction for this holding in this account — almost certainly an opening balance carried in from another platform. Approving records it as a lot at the entered cost basis with NO cash-side impact (no synthesized cash leg, no trade_link_id). Reject if it&apos;s actually a normal buy with a forgotten cash row.
              </div>
            </div>
          </div>
        )}

        {proposal.dependsOnProposalIds.length > 0 && (
          <div className="border border-info/40 bg-info/10 text-info rounded p-3 text-xs">
            Depends on proposal(s): #{proposal.dependsOnProposalIds.join(", #")}. Apply those first.
          </div>
        )}

        <DisplacedRowsTable
          ids={proposal.existingRowIds}
          displacedRows={displacedRows}
          holdingMap={holdingMap}
          accountMap={accountMap}
          categoryMap={categoryMap}
        />

        {isOrphan && !isApplied && (
          <KindOverridePicker
            runId={runId}
            proposal={proposal}
            displacedRows={displacedRows}
            holdingMap={holdingMap}
            accountMap={accountMap}
            categoryMap={categoryMap}
            onApproveOverride={onApproveOverride}
            onReject={onReject}
          />
        )}

        {isDrift && (
          <div className="space-y-2">
            <div className="font-medium">Pick fee handling</div>
            <DriftVariantPicker proposal={proposal} onChange={onVariantChange} />
          </div>
        )}

        {isDripReinvest && (
          <div className="space-y-3">
            <div className="flex items-center gap-1 font-medium">
              How is this dividend recorded?
              <InfoTip
                label="About dividend variants"
                text="Qty equals the dollar amount: either a cash dividend on the underlying (typical for stocks like VUN.TO) or a reinvestment at $1/share (typical for crypto and sub-dollar units). Pick the one that matches reality, then confirm the holding."
              />
            </div>
            <DividendVariantPicker
              proposal={proposal}
              onChange={onDividendVariantChange}
            />
            <div className="font-medium pt-2">Pick the underlying stock</div>
            <HoldingPicker
              proposal={proposal}
              holdingMap={holdingMap}
              onChange={onHoldingChange}
            />
            <DividendReinvestmentPreview
              proposal={proposal}
              displacedRows={displacedRows}
              holdingMap={holdingMap}
              accountMap={accountMap}
              categoryMap={categoryMap}
            />
          </div>
        )}

        {!isDrift && !isOrphan && !isDripReinvest && (
          <ReplacementPreviewTable
            proposal={proposal}
            holdingMap={holdingMap}
            accountMap={accountMap}
          />
        )}

        <DeltasPanel deltas={proposal.deltasJson} holdingMap={holdingMap} />
      </CardContent>
    </Card>
  );
}

function holdingLabelFor(id: number | null, holdingMap: Record<number, HoldingMeta>): string {
  if (id == null) return "(no holding)";
  const h = holdingMap[id];
  if (!h) return `holding #${id}`;
  if (h.isCash) return `${h.currency} cash sleeve`;
  return h.name ?? `holding #${id}`;
}

function accountLabelFor(id: number | null, accountMap: Record<number, AccountMeta>): string {
  if (id == null) return "(no account)";
  const a = accountMap[id];
  if (!a) return `account #${id}`;
  return a.name ?? `account #${id}`;
}

function DisplacedRowsTable({
  ids,
  displacedRows,
  holdingMap,
  accountMap,
  categoryMap,
}: {
  ids: number[];
  displacedRows: Record<number, DisplacedRow>;
  holdingMap: Record<number, HoldingMeta>;
  accountMap: Record<number, AccountMeta>;
  categoryMap: Record<number, CategoryMeta>;
}) {
  return (
    <div className="space-y-1.5">
      <SectionCard label="Existing rows being displaced" icon={Database} tone="rose" list>
        {ids.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground" data-keep="data">none</p>}
        {ids.map((id) => {
          const r = displacedRows[id];
          if (!r) return <p key={id} className="px-4 py-3 text-sm text-muted-foreground" data-keep="data">Tx #{id} (row not found)</p>;
          return (
            <div key={id}>
              <ListRow
                title={`#${r.id} · ${r.date}`}
                subtitle={`${accountLabelFor(r.accountId, accountMap)} · ${holdingLabelFor(r.portfolioHoldingId, holdingMap)}${r.quantity != null ? ` · qty ${r.quantity}` : ""}`}
                value={<span className="font-mono text-sm">{r.amount.toFixed(2)} {r.currency}</span>}
                secondary={r.kind ?? "—"}
              />
              <RowDetailsLine row={r} holdingMap={holdingMap} categoryMap={categoryMap} />
            </div>
          );
        })}
      </SectionCard>
    </div>
  );
}

/**
 * Secondary line under each existing row showing the user-entered context
 * that the primary table omits. Skips fields that are empty/null so the
 * line stays compact. Reused by DisplacedRowsTable + WillBecomeTable.
 */
function RowDetailsLine({
  row,
  holdingMap,
  categoryMap,
  highlight,
}: {
  row: {
    note: string | null;
    tags: string | null;
    payee: string | null;
    source: string | null;
    categoryId: number | null;
    relatedHoldingId: number | null;
  };
  holdingMap: Record<number, HoldingMeta>;
  categoryMap: Record<number, CategoryMeta>;
  highlight?: ReadonlySet<keyof typeof FIELD_LABELS>;
}) {
  const category = row.categoryId != null ? categoryMap[row.categoryId] : null;
  const related = row.relatedHoldingId != null ? holdingMap[row.relatedHoldingId] : null;
  const items: Array<{ key: keyof typeof FIELD_LABELS; value: string }> = [];
  if (category?.name) items.push({ key: "category", value: category.name });
  if (row.source) items.push({ key: "source", value: row.source });
  if (row.note) items.push({ key: "note", value: row.note });
  if (row.tags) items.push({ key: "tags", value: row.tags });
  if (related) {
    const label = related.isCash
      ? `${related.currency} cash sleeve`
      : related.name ?? `holding #${row.relatedHoldingId}`;
    items.push({ key: "related", value: label });
  }
  if (row.payee) items.push({ key: "payee", value: row.payee });
  if (items.length === 0) return null;
  return (
    <div className="px-4 pb-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((it) => {
          const isHi = highlight?.has(it.key);
          return (
            <span key={it.key} className={isHi ? "font-semibold text-foreground" : ""}>
              <span className="opacity-70">{FIELD_LABELS[it.key]}:</span> {it.value}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const FIELD_LABELS = {
  category: "Category",
  source: "Source",
  note: "Note",
  tags: "Tags",
  related: "Related",
  payee: "Payee",
} as const;

function ReplacementPreviewTable({
  proposal,
  holdingMap,
  accountMap,
}: {
  proposal: Proposal;
  holdingMap: Record<number, HoldingMeta>;
  accountMap: Record<number, AccountMeta>;
}) {
  const rows = (proposal.replacementRowsJson as Array<{ txId: number; amount?: number; kind?: string; tradeLinkId?: string }> | null) ?? [];
  const synth = (proposal.synthesizedRowsJson as Array<{
    date: string; accountId: number; portfolioHoldingId: number | null; amount: number; currency: string; quantity: number | null; kind: string; synthReason?: string;
  }> | null) ?? [];
  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="space-y-1.5">
          <SectionCard label="Will become (UPDATE in place)" icon={PlusCircle} tone="emerald" list>
            {rows.map((r) => (
              <ListRow
                key={r.txId}
                title={`#${r.txId}`}
                subtitle={`trade_link_id: ${r.tradeLinkId ?? "—"}`}
                value={<span className="font-mono text-sm">{r.amount?.toFixed(2) ?? "(unchanged)"}</span>}
                secondary={`kind: ${r.kind ?? "(unchanged)"}`}
              />
            ))}
          </SectionCard>
        </div>
      )}
      {synth.length > 0 && (
        <div className="space-y-1.5">
          <SectionCard label="New rows (synthesized — tagged source=&apos;backfill_synth&apos;)" icon={PlusCircle} tone="emerald" list cardClassName="border-warning/40 bg-warning/5">
            {synth.map((r, i) => (
              <ListRow
                key={i}
                title={`${r.date} · ${accountLabelFor(r.accountId, accountMap)}`}
                subtitle={`${holdingLabelFor(r.portfolioHoldingId, holdingMap)}${r.quantity != null ? ` · qty ${r.quantity}` : ""}`}
                value={<span className="font-mono text-sm">{r.amount.toFixed(2)} {r.currency}</span>}
                secondary={r.kind}
              />
            ))}
          </SectionCard>
          {synth[0]?.synthReason && (
            <p className="px-1 text-xs text-muted-foreground italic" data-keep="data">{synth[0].synthReason}</p>
          )}
        </div>
      )}
      {rows.length === 0 && synth.length === 0 && (
        <div className="text-xs text-muted-foreground italic">No row changes proposed.</div>
      )}
    </div>
  );
}

function DriftVariantPicker({
  proposal,
  onChange,
}: {
  proposal: Proposal;
  onChange: (v: "separate_fee_row" | "absorb_into_cost") => void;
}) {
  const variants = proposal.replacementRowsJson as {
    separate_fee_row?: { explanation: string };
    absorb_into_cost?: { explanation: string };
  } | null;
  if (!variants) return null;
  const selected = proposal.variantChoice;
  return (
    <div className="space-y-2">
      <VariantOption
        label="Book separate fee row"
        explanation={variants.separate_fee_row?.explanation ?? ""}
        selected={selected === "separate_fee_row"}
        onSelect={() => onChange("separate_fee_row")}
      />
      <VariantOption
        label="Absorb into cost basis"
        explanation={variants.absorb_into_cost?.explanation ?? ""}
        selected={selected === "absorb_into_cost"}
        onSelect={() => onChange("absorb_into_cost")}
      />
    </div>
  );
}

function DividendVariantPicker({
  proposal,
  onChange,
}: {
  proposal: Proposal;
  onChange: (v: "cash_dividend" | "drip") => void;
}) {
  const selected = proposal.dividendVariant;
  return (
    <div className="space-y-2">
      <VariantOption
        label="Cash dividend (lands on cash sleeve)"
        explanation="The dividend was paid in cash and credited to the cash sleeve. Apply moves the row to the matching cash sleeve (same account + currency), sets related_holding_id to your picked stock for reporting, and stamps kind='portfolio_income'. Qty preserved as the cash amount. Pick this for normal stock dividends like VUN.TO."
        selected={selected === "cash_dividend"}
        onSelect={() => onChange("cash_dividend")}
      />
      <VariantOption
        label="Share reinvestment (opens lot)"
        explanation="The dividend bought additional units of the underlying. Apply moves the row to the picked stock holding, keeps qty as a share count, and opens a lot at costPerShare=amount/qty. Pick this for crypto staking rewards or other sub-dollar reinvestments where qty really is a share count."
        selected={selected === "drip"}
        onSelect={() => onChange("drip")}
      />
    </div>
  );
}

function HoldingPicker({
  proposal,
  holdingMap,
  onChange,
}: {
  proposal: Proposal;
  holdingMap: Record<number, HoldingMeta>;
  onChange: (id: number | null) => void;
}) {
  // Candidates from the planner (non-cash holdings in the displaced row's
  // account). Filter out any that resolve to a cash sleeve defensively —
  // user may have toggled the is_cash flag after the run was computed.
  const candidates = proposal.candidateHoldingIds.filter((id) => {
    const h = holdingMap[id];
    return h && !h.isCash;
  });
  if (candidates.length === 0) {
    return (
      <div className="text-xs text-warning border border-warning/40 bg-warning/10 rounded p-2">
        No non-cash holdings in this account to choose from. Create the underlying stock holding from the account-detail page, then re-run the backfill.
      </div>
    );
  }
  return (
    <Field
      control="select"
      value={String(proposal.chosenHoldingId ?? "")}
      onValueChange={(v) => onChange(v === "" ? null : Number(v))}
      options={[
        { value: "", label: "— Pick a holding —" },
        ...candidates.map((id) => { const h = holdingMap[id]; const label = h?.name ?? `holding #${id}`; const currency = h?.currency ? ` (${h.currency})` : ""; return ({ value: String(id), label: `${label}${currency}` }); }),
      ]}
    />
  );
}

/**
 * Reconstruct the override-picker option id from a persisted proposal. id ===
 * kind for every entry EXCEPT the general "Expense" entry, which shares
 * kind='portfolio_expense' with the holding-attributed one and is identified by
 * the absence of a related holding.
 */
function deriveInitialOverrideOptionId(p: Proposal): string | null {
  if (p.chosenKind == null) return null;
  if (p.chosenKind === "portfolio_expense" && p.chosenRelatedHoldingId == null) {
    return "expense_general";
  }
  return p.chosenKind;
}

// ─── Kind override on refused orphan_stock_leg ────────────────────────
//
// Override picker for refused orphan_stock_leg proposals. Pair-less
// kinds (opening_balance, dividend, interest, portfolio_income,
// portfolio_expense) apply directly via applyOrphanOverride in
// apply.ts. Paired kinds (buy/sell/transfer/fx/brokerage) are rendered
// disabled with a tooltip pointing at the follow-up — those need the
// convertExisting*Pair helpers in operations.ts + a counterpart picker.
function KindOverridePicker({
  runId,
  proposal,
  displacedRows,
  holdingMap,
  accountMap,
  categoryMap,
  onApproveOverride,
  onReject,
}: {
  runId: string;
  proposal: Proposal;
  displacedRows: Record<number, DisplacedRow>;
  holdingMap: Record<number, HoldingMeta>;
  accountMap: Record<number, AccountMeta>;
  categoryMap: Record<number, CategoryMeta>;
  onApproveOverride: (payload: {
    chosenKind: OverrideKind;
    chosenRelatedHoldingId?: number | null;
    chosenCounterpartMode?: "link_existing" | "synth_new" | null;
    chosenCounterpartTxId?: number | null;
    chosenCategoryId?: number | null;
  }) => Promise<boolean> | void;
  onReject: () => void;
}) {
  const [open, setOpen] = useState<boolean>(proposal.chosenKind != null);
  // Select by option id (not kind) so the general "Expense" entry can share
  // kind='portfolio_expense' with the holding-attributed one. On reload we
  // reconstruct the id from (chosenKind, chosenRelatedHoldingId): a
  // portfolio_expense with no related holding is the general variant.
  const [selectedId, setSelectedId] = useState<string | null>(
    deriveInitialOverrideOptionId(proposal),
  );
  const selectedOption = OVERRIDE_KIND_OPTIONS.find((o) => o.id === selectedId) ?? null;
  const chosenKind: OverrideKind | null = selectedOption?.kind ?? null;
  const keepHoldingPairless = selectedOption?.keepHoldingPairless ?? false;
  const [chosenRelatedHoldingId, setChosenRelatedHoldingId] = useState<number | null>(
    proposal.chosenRelatedHoldingId,
  );
  const [chosenCategoryId, setChosenCategoryId] = useState<number | null>(
    proposal.chosenCategoryId,
  );
  const [counterpartTxId, setCounterpartTxId] = useState<number | null>(
    proposal.chosenCounterpartTxId,
  );
  const [candidates, setCandidates] = useState<CounterpartCandidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  // Paired kinds (Buy/Sell) need a counterpart. Phase 1 supports synth_new
  // only; link_existing arrives with the candidate picker in Phase 2.
  const [chosenCounterpartMode, setChosenCounterpartMode] = useState<"synth_new" | "link_existing">(
    proposal.chosenCounterpartMode ?? "synth_new",
  );

  const orphanRow = proposal.existingRowIds[0] != null ? displacedRows[proposal.existingRowIds[0]] : null;
  const accountHoldings = useMemo(() => {
    if (orphanRow?.accountId == null) return [] as Array<[number, HoldingMeta]>;
    return Object.entries(holdingMap)
      .map(([k, h]) => [Number(k), h] as [number, HoldingMeta])
      .filter(([, h]) => !h.isCash);
  }, [holdingMap, orphanRow?.accountId]);

  // The general "Expense" entry (keepHoldingPairless) needs NO related holding —
  // it stays on the current holding like Interest. Only the holding-attributed
  // income/expense entries require the pick.
  const needsRelatedHolding =
    (chosenKind === "portfolio_income" || chosenKind === "portfolio_expense") && !keepHoldingPairless;
  // Pair-less income kinds let the user pick a category so the row reports
  // correctly. dividend/interest auto-create the canonical category when left
  // blank; portfolio_income/expense leave the category untouched when blank.
  const showsCategory =
    chosenKind === "dividend" ||
    chosenKind === "interest" ||
    chosenKind === "portfolio_income" ||
    chosenKind === "portfolio_expense";
  const categoryTypeFilter = chosenKind === "portfolio_expense" ? "E" : "I";
  const categoryOptions = useMemo(
    () =>
      Object.entries(categoryMap)
        .map(([k, c]) => [Number(k), c] as [number, CategoryMeta])
        .filter(([, c]) => c.type === categoryTypeFilter),
    [categoryMap, categoryTypeFilter],
  );
  // Category auto-created server-side when the picker is left blank.
  // dividend → "Dividends", interest → "Interest", general expense →
  // "Investment Fees" (the "fee" kind in resolveOrCreateInvestmentIncomeCategory).
  const autoCategoryName =
    chosenKind === "dividend"
      ? "Dividends"
      : chosenKind === "interest"
        ? "Interest"
        : chosenKind === "portfolio_expense" && keepHoldingPairless
          ? "Investment Fees"
          : null;
  const isPaired = chosenKind != null && OVERRIDE_PAIRED_ENABLED_KINDS.has(chosenKind);
  const supportsSynth = chosenKind != null && OVERRIDE_SYNTH_KINDS.has(chosenKind);
  const canApprove =
    chosenKind != null &&
    (OVERRIDE_PAIRLESS_KINDS.has(chosenKind)
      ? !needsRelatedHolding || chosenRelatedHoldingId != null
      : // Paired: synth_new (Buy/Sell only) is always ready; link_existing needs a pick.
        isPaired &&
        ((chosenCounterpartMode === "synth_new" && supportsSynth) ||
          (chosenCounterpartMode === "link_existing" && counterpartTxId != null)));

  // Fetch counterpart candidates when the user switches to link_existing.
  useEffect(() => {
    if (!isPaired || chosenCounterpartMode !== "link_existing" || !chosenKind) {
      setCandidates(null);
      return;
    }
    let cancelled = false;
    setLoadingCandidates(true);
    fetch(`/api/settings/backfill/${runId}/counterpart-candidates?proposalId=${proposal.id}&kind=${chosenKind}`)
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d) => { if (!cancelled) setCandidates((d.candidates ?? []) as CounterpartCandidate[]); })
      .catch(() => { if (!cancelled) setCandidates([]); })
      .finally(() => { if (!cancelled) setLoadingCandidates(false); });
    return () => { cancelled = true; };
  }, [isPaired, chosenCounterpartMode, chosenKind, runId, proposal.id]);

  const selectedCandidate = useMemo(
    () => candidates?.find((c) => c.id === counterpartTxId) ?? null,
    [candidates, counterpartTxId],
  );

  // Build the client-side WILL-BECOME preview from the current orphan row +
  // the chosen override. Mirrors what the apply path writes server-side —
  // if apply.ts diverges from these helpers the user sees a discrepancy
  // after apply, so keep them in sync.
  const preview = useMemo(() => {
    if (!orphanRow || !chosenKind || !OVERRIDE_PAIRLESS_KINDS.has(chosenKind)) return null;
    return computePairlessWillBecome({
      orphanRow,
      chosenKind,
      keepHoldingPairless,
      chosenRelatedHoldingId,
      chosenCategoryId,
      holdingMap,
    });
  }, [orphanRow, chosenKind, keepHoldingPairless, chosenRelatedHoldingId, chosenCategoryId, holdingMap]);

  // Paired preview: the orphan stock leg + the cash leg (synthesized, or the
  // picked existing row re-tagged in link_existing mode).
  const pairedPreview = useMemo(() => {
    if (!orphanRow || (chosenKind !== "buy" && chosenKind !== "sell")) return null;
    return computeBuySellWillBecome({
      orphanRow,
      direction: chosenKind,
      holdingMap,
      counterpart: chosenCounterpartMode === "link_existing" ? selectedCandidate : null,
    });
  }, [orphanRow, chosenKind, holdingMap, chosenCounterpartMode, selectedCandidate]);

  if (!open) {
    return (
      <div>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          variant="link" size="sm"
        >
          Convert to a different kind…
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-medium">
          Pick a kind
          <InfoTip
            label="About picking a kind"
            text="Pair-less kinds apply directly to this row. Buy and Sell can synthesize the matching cash leg or link an existing one. Brokerage, FX and Transfer pair the orphan with an existing row in the other account or currency."
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Hide
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {OVERRIDE_KIND_OPTIONS.map((opt) => {
          const enabled = isOverrideKindEnabled(opt.kind);
          const isSelected = selectedId === opt.id;
          return (
            <div key={opt.id} className="relative">
            <InfoTip
              label={`About ${opt.label}`}
              text={enabled ? opt.explanation : "Not wired yet: its converter and counterpart picker ship in a later phase. Use Buy, Sell or a pair-less kind for now."}
              className="absolute right-1 top-1 z-10"
            />
            <button
              type="button"
              disabled={!enabled}
              onClick={() => {
                if (!enabled) return;
                setSelectedId(opt.id);
                setCounterpartTxId(null);
                // Default the cash-leg mode: synth for Buy/Sell, link for the
                // cross-account kinds (which can't synthesize).
                if (OVERRIDE_PAIRED_ENABLED_KINDS.has(opt.kind)) {
                  setChosenCounterpartMode(OVERRIDE_SYNTH_KINDS.has(opt.kind) ? "synth_new" : "link_existing");
                }
                // Clear the related-holding pick unless this entry attributes
                // income/expense to a holding (the general Expense entry doesn't).
                const attributes =
                  (opt.kind === "portfolio_income" || opt.kind === "portfolio_expense") &&
                  !opt.keepHoldingPairless;
                if (!attributes) setChosenRelatedHoldingId(null);
              }}
              className={`w-full text-left rounded border p-2 text-xs ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              } ${!enabled ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-start gap-2">
                <div
                  className={`mt-0.5 size-3 rounded-full shrink-0 ${
                    isSelected ? "bg-primary" : "border border-border"
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-medium">
                    {opt.label}
                    {!enabled && <span className="ml-1 opacity-60">(soon)</span>}
                  </div>
                </div>
              </div>
            </button>
            </div>
          );
        })}
      </div>

      {isPaired && (
        <div className="space-y-2">
          <Field
            label="Counterpart leg"
            control="segmented"
            info={`New cash leg: ${supportsSynth ? `creates the matching ${chosenKind === "sell" ? "credit" : "debit"} on the account's cash sleeve` : "not available for cross-account kinds; link an existing row instead"}. Link existing row: pairs the orphan with an unmatched row ${supportsSynth ? "already in this account" : "in the other account or currency"}.`}
            value={chosenCounterpartMode}
            onValueChange={(v) => {
              if (v === "synth_new") {
                if (supportsSynth) {
                  setChosenCounterpartMode("synth_new");
                  setCounterpartTxId(null);
                }
              } else setChosenCounterpartMode("link_existing");
            }}
            fill
            options={[
              { value: "synth_new", label: supportsSynth ? "New cash leg" : "New cash leg (n/a)", disabled: !supportsSynth },
              { value: "link_existing", label: "Link existing row" },
            ]}
          />
          {chosenCounterpartMode === "link_existing" && (
            <div className="mt-1 space-y-1">
              {loadingCandidates && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> Finding candidates…
                </div>
              )}
              {!loadingCandidates && candidates?.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No matching unmatched rows found{supportsSynth ? " — synthesize a new cash leg instead" : ". Fix manually in /transactions"}.
                </div>
              )}
              {!loadingCandidates && candidates && candidates.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded border border-border [&>*:not(:last-child)]:shadow-[var(--list-divider)]">
                  {candidates.map((c) => {
                    const sel = counterpartTxId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCounterpartTxId(c.id)}
                        className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-2 ${sel ? "bg-primary/5" : "hover:bg-muted/40"}`}
                      >
                        <span className={`size-3 rounded-full shrink-0 ${sel ? "bg-primary" : "border border-border"}`} />
                        <span className="font-mono">#{c.id}</span>
                        <span>{c.date}</span>
                        <span className="font-mono ml-auto">{c.amount.toFixed(2)} {c.currency}</span>
                        <span className="text-muted-foreground truncate max-w-[45%]">
                          {c.isCashSleeve ? (c.holdingName ?? "cash sleeve") : "no holding"} · {c.reason}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {needsRelatedHolding && (
        <div className="space-y-1">
          <div className="text-xs font-medium">Related stock holding (for reporting)</div>
          <Field
            control="select"
            value={String(chosenRelatedHoldingId ?? "")}
            onValueChange={(v) => setChosenRelatedHoldingId(v ? Number(v) : null)}
            options={[
              { value: "", label: "— pick a holding —" },
              ...accountHoldings.map(([id, h]) => ({ value: String(id), label: `${h.name ?? `holding #${id}`}(${h.currency})` })),
            ]}
          />
        </div>
      )}

      {showsCategory && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs font-medium">
            Category
            {autoCategoryName && chosenCategoryId == null && (
              <InfoTip
                label="About category"
                text={`Blank tags the row as ${autoCategoryName} so it shows in the dividend/income report. Pick another category to override.`}
              />
            )}
          </div>
          <Field
            control="select"
            value={String(chosenCategoryId ?? "")}
            onValueChange={(v) => setChosenCategoryId(v ? Number(v) : null)}
            options={[
              {
                value: "", label: autoCategoryName
                  ? `— auto: ${autoCategoryName} (created if needed) —`
                  : "— leave uncategorized —"
              },
              ...categoryOptions.map(([id, c]) => ({ value: String(id), label: c.name ?? `category #${id}` })),
            ]}
          />
        </div>
      )}

      {preview && orphanRow && (
        <WillBecomeTable
          existing={orphanRow}
          willBecome={preview.willBecome}
          changedKeys={preview.changedKeys}
          holdingMap={holdingMap}
          accountMap={accountMap}
          categoryMap={categoryMap}
        />
      )}

      {pairedPreview && orphanRow && (
        <div className="space-y-2">
          <div className="text-xs font-medium">Stock leg (this row, updated in place)</div>
          <WillBecomeTable
            existing={orphanRow}
            willBecome={pairedPreview.stock.willBecome}
            changedKeys={pairedPreview.stock.changedKeys}
            holdingMap={holdingMap}
            accountMap={accountMap}
            categoryMap={categoryMap}
          />
          <div className="text-xs font-medium">
            {pairedPreview.cashIsSynth ? "Cash leg (new, synthesized)" : `Cash leg (existing row #${pairedPreview.cash.willBecome.id}, re-tagged)`}
          </div>
          <WillBecomeTable
            existing={pairedPreview.cash.willBecome}
            willBecome={pairedPreview.cash.willBecome}
            changedKeys={pairedPreview.cash.changedKeys}
            holdingMap={holdingMap}
            accountMap={accountMap}
            categoryMap={categoryMap}
          />
        </div>
      )}

      {isPaired && !supportsSynth && (
        <div className="text-xs text-muted-foreground rounded border border-border p-2">
          This row becomes the <span className="font-mono">{chosenKind}</span> leg, paired via link_id with{" "}
          {selectedCandidate ? (
            <>
              row <span className="font-mono">#{selectedCandidate.id}</span> ({selectedCandidate.date},{" "}
              {selectedCandidate.amount.toFixed(2)} {selectedCandidate.currency})
            </>
          ) : (
            "the counterpart you pick above"
          )}
          .
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={onReject}>Reject</Button>
        <Button
          size="sm"
          disabled={!canApprove}
          onClick={() => {
            if (!canApprove || !chosenKind) return;
            onApproveOverride({
              chosenKind,
              chosenRelatedHoldingId: needsRelatedHolding ? chosenRelatedHoldingId : null,
              chosenCounterpartMode: isPaired ? chosenCounterpartMode : null,
              chosenCounterpartTxId:
                isPaired && chosenCounterpartMode === "link_existing" ? counterpartTxId : null,
              chosenCategoryId: showsCategory ? chosenCategoryId : null,
            });
          }}
        >
          Approve override
        </Button>
      </div>
    </div>
  );
}

/**
 * Pure helper that mirrors applyOrphanOverride's pair-less branch in
 * src/lib/portfolio/backfill/apply.ts. If apply.ts changes, update this.
 */
function computePairlessWillBecome({
  orphanRow,
  chosenKind,
  keepHoldingPairless,
  chosenRelatedHoldingId,
  chosenCategoryId,
  holdingMap,
}: {
  orphanRow: DisplacedRow;
  chosenKind: OverrideKind;
  /** General "Expense" variant — keep the row on its current holding, no
   *  cash-sleeve move and no related-holding attribution (mirrors Interest). */
  keepHoldingPairless: boolean;
  chosenRelatedHoldingId: number | null;
  chosenCategoryId: number | null;
  holdingMap: Record<number, HoldingMeta>;
}): {
  willBecome: DisplacedRow;
  changedKeys: ReadonlySet<keyof typeof FIELD_LABELS | "kind" | "holding">;
} {
  const willBecome: DisplacedRow = { ...orphanRow };
  const changedKeys = new Set<keyof typeof FIELD_LABELS | "kind" | "holding">();
  if (orphanRow.kind !== chosenKind) {
    willBecome.kind = chosenKind;
    changedKeys.add("kind");
  }
  // An explicit category pick is reflected here; dividend/interest/general-expense
  // auto-resolve server-side (id unknown to the client), so that case is shown
  // via a caption.
  if (chosenCategoryId != null && orphanRow.categoryId !== chosenCategoryId) {
    willBecome.categoryId = chosenCategoryId;
    changedKeys.add("category");
  }
  // The general "Expense" variant keeps the holding — only the holding-attributed
  // income/expense entries move the row to the cash sleeve + stamp related_holding.
  if (
    !keepHoldingPairless &&
    (chosenKind === "portfolio_income" || chosenKind === "portfolio_expense")
  ) {
    // Find matching cash sleeve in the same (account, currency).
    const sleeveEntry = Object.entries(holdingMap).find(
      ([, h]) => h.isCash && h.currency === orphanRow.currency,
    );
    if (sleeveEntry) {
      const sleeveId = Number(sleeveEntry[0]);
      if (orphanRow.portfolioHoldingId !== sleeveId) {
        willBecome.portfolioHoldingId = sleeveId;
        changedKeys.add("holding");
      }
    }
    if (orphanRow.relatedHoldingId !== chosenRelatedHoldingId) {
      willBecome.relatedHoldingId = chosenRelatedHoldingId;
      changedKeys.add("related");
    }
  }
  return { willBecome, changedKeys };
}

/**
 * WILL-BECOME preview for a Buy/Sell paired override. Mirrors
 * convertExistingToBuySellPair + normalizeBuySellLegs (operations.ts) and
 * applyPairedOverride (apply.ts): the orphan becomes the stock leg (kind +
 * normalized signs), and a cash leg is synthesized on the matching cash
 * sleeve. KEEP IN SYNC with those — a divergence shows the user a different
 * post-apply state than the server produces.
 */
function computeBuySellWillBecome({
  orphanRow,
  direction,
  holdingMap,
  counterpart,
}: {
  orphanRow: DisplacedRow;
  direction: "buy" | "sell";
  holdingMap: Record<number, HoldingMeta>;
  /** link_existing: the picked candidate that becomes the cash leg. When null,
   *  the cash leg is synthesized. */
  counterpart?: CounterpartCandidate | null;
}): {
  stock: { willBecome: DisplacedRow; changedKeys: ReadonlySet<keyof typeof FIELD_LABELS | "kind" | "holding"> };
  cash: { willBecome: DisplacedRow; changedKeys: ReadonlySet<keyof typeof FIELD_LABELS | "kind" | "holding"> };
  cashIsSynth: boolean;
} {
  // Mirror of normalizeBuySellLegs (operations.ts).
  const isBuy = direction === "buy";
  const magAmount = Math.abs(orphanRow.amount);
  const magQty = Math.abs(orphanRow.quantity ?? 0);
  const stockAmount = isBuy ? magAmount : -magAmount;
  const stockQty = isBuy ? magQty : -magQty;
  const cashAmount = -stockAmount;

  // Stock leg — the orphan, updated in place.
  const stockWillBecome: DisplacedRow = {
    ...orphanRow,
    kind: isBuy ? "buy" : "sell",
    amount: stockAmount,
    quantity: stockQty,
    tradeLinkId: "(new)",
  };
  const stockChanged = new Set<keyof typeof FIELD_LABELS | "kind" | "holding">(["kind"]);

  // Cash leg lands on the matching cash sleeve (preview resolves it by currency
  // only; the server resolves by account + currency).
  const sleeveEntry = Object.entries(holdingMap).find(
    ([, h]) => h.isCash && h.currency === orphanRow.currency,
  );
  const sleeveId = sleeveEntry ? Number(sleeveEntry[0]) : null;
  const cashWillBecome: DisplacedRow = {
    // link_existing keeps the picked row's id/date; synth gets a placeholder.
    id: counterpart ? counterpart.id : 0,
    date: counterpart ? counterpart.date : orphanRow.date,
    accountId: orphanRow.accountId,
    portfolioHoldingId: sleeveId,
    relatedHoldingId: null,
    categoryId: orphanRow.categoryId,
    amount: cashAmount,
    currency: orphanRow.currency,
    quantity: cashAmount,
    kind: isBuy ? "buy_cash_leg" : "sell_cash_leg",
    tradeLinkId: "(new)",
    linkId: null,
    note: orphanRow.note,
    tags: orphanRow.tags,
    payee: orphanRow.payee,
    source: counterpart ? "backfill" : "backfill_synth",
  };
  return {
    stock: { willBecome: stockWillBecome, changedKeys: stockChanged },
    cash: { willBecome: cashWillBecome, changedKeys: new Set() },
    cashIsSynth: !counterpart,
  };
}

/**
 * WILL-BECOME preview for `dividend_reinvestment` proposals. Mirrors the
 * apply.ts dispatch in applyProposal at the `dividend_reinvestment`
 * branch — keep in sync if apply.ts changes.
 *
 * - variant='drip': UPDATE portfolioHoldingId = chosenHoldingId, kind='dividend'.
 *   Qty preserved (treated as a share count, lot opens at amount/qty).
 * - variant='cash_dividend': UPDATE portfolioHoldingId = matching cash
 *   sleeve in (account, currency), relatedHoldingId = chosenHoldingId,
 *   kind='portfolio_income'. Qty preserved (cash units).
 *
 * Renders nothing until BOTH dividendVariant + chosenHoldingId are set
 * — the planner pre-suggests defaults but the user owns the final pick.
 */
function DividendReinvestmentPreview({
  proposal,
  displacedRows,
  holdingMap,
  accountMap,
  categoryMap,
}: {
  proposal: Proposal;
  displacedRows: Record<number, DisplacedRow>;
  holdingMap: Record<number, HoldingMeta>;
  accountMap: Record<number, AccountMeta>;
  categoryMap: Record<number, CategoryMeta>;
}) {
  const existingId = proposal.existingRowIds[0];
  const existing = existingId != null ? displacedRows[existingId] : null;
  const preview = useMemo(() => {
    if (!existing) return null;
    if (!proposal.dividendVariant) return null;
    if (proposal.chosenHoldingId == null) return null;
    return computeDividendReinvestmentWillBecome({
      existing,
      variant: proposal.dividendVariant,
      chosenHoldingId: proposal.chosenHoldingId,
      holdingMap,
    });
  }, [existing, proposal.dividendVariant, proposal.chosenHoldingId, holdingMap]);

  if (!existing) return null;
  if (!preview) {
    return (
      <p className="text-xs text-muted-foreground italic" data-keep="status">
        Pick a variant and stock to preview.
      </p>
    );
  }
  return (
    <WillBecomeTable
      existing={existing}
      willBecome={preview.willBecome}
      changedKeys={preview.changedKeys}
      holdingMap={holdingMap}
      accountMap={accountMap}
      categoryMap={categoryMap}
    />
  );
}

function computeDividendReinvestmentWillBecome({
  existing,
  variant,
  chosenHoldingId,
  holdingMap,
}: {
  existing: DisplacedRow;
  variant: "cash_dividend" | "drip";
  chosenHoldingId: number;
  holdingMap: Record<number, HoldingMeta>;
}): {
  willBecome: DisplacedRow;
  changedKeys: ReadonlySet<keyof typeof FIELD_LABELS | "kind" | "holding">;
} {
  const willBecome: DisplacedRow = { ...existing };
  const changedKeys = new Set<keyof typeof FIELD_LABELS | "kind" | "holding">();
  if (variant === "drip") {
    if (existing.kind !== "dividend") {
      willBecome.kind = "dividend";
      changedKeys.add("kind");
    }
    if (existing.portfolioHoldingId !== chosenHoldingId) {
      willBecome.portfolioHoldingId = chosenHoldingId;
      changedKeys.add("holding");
    }
  } else {
    // cash_dividend — row moves to the matching cash sleeve in
    // (account, currency); related_holding_id = chosen stock.
    if (existing.kind !== "portfolio_income") {
      willBecome.kind = "portfolio_income";
      changedKeys.add("kind");
    }
    const sleeveEntry = Object.entries(holdingMap).find(
      ([, h]) => h.isCash && h.currency === existing.currency,
    );
    if (sleeveEntry) {
      const sleeveId = Number(sleeveEntry[0]);
      if (existing.portfolioHoldingId !== sleeveId) {
        willBecome.portfolioHoldingId = sleeveId;
        changedKeys.add("holding");
      }
    }
    if (existing.relatedHoldingId !== chosenHoldingId) {
      willBecome.relatedHoldingId = chosenHoldingId;
      changedKeys.add("related");
    }
  }
  return { willBecome, changedKeys };
}

/**
 * Render-only diff table. Bolds the changed cells in the WILL-BECOME row.
 * Pair-less only — paired previews require server-side computation
 * (preview-override endpoint, follow-up).
 */
function WillBecomeTable({
  existing,
  willBecome,
  changedKeys,
  holdingMap,
  accountMap,
  categoryMap,
}: {
  existing: DisplacedRow;
  willBecome: DisplacedRow;
  changedKeys: ReadonlySet<keyof typeof FIELD_LABELS | "kind" | "holding">;
  holdingMap: Record<number, HoldingMeta>;
  accountMap: Record<number, AccountMeta>;
  categoryMap: Record<number, CategoryMeta>;
}) {
  const hi = (k: keyof typeof FIELD_LABELS | "kind" | "holding") =>
    changedKeys.has(k) ? "font-semibold text-foreground" : "";
  // The secondary line's highlight set is a subset of changedKeys
  // restricted to FIELD_LABELS keys (the secondary row only renders
  // those fields).
  const secondaryHi = new Set<keyof typeof FIELD_LABELS>();
  if (changedKeys.has("related")) secondaryHi.add("related");
  return (
    <div className="space-y-1.5">
      <SectionCard label="Will become" icon={PlusCircle} tone="emerald" padded={false} cardClassName="border-pos/40 bg-pos/5">
        <ListRow
          title={`#${willBecome.id} · ${willBecome.date}`}
          subtitle={
            <>
              {accountLabelFor(willBecome.accountId, accountMap)} ·{" "}
              <span className={hi("holding")}>{holdingLabelFor(willBecome.portfolioHoldingId, holdingMap)}</span>
              {willBecome.quantity != null ? ` · qty ${willBecome.quantity}` : ""}
            </>
          }
          value={<span className="font-mono text-sm">{willBecome.amount.toFixed(2)} {willBecome.currency}</span>}
          secondary={<span className={`font-mono ${hi("kind")}`}>{willBecome.kind ?? "—"}</span>}
        />
        <RowDetailsLine row={willBecome} holdingMap={holdingMap} categoryMap={categoryMap} highlight={secondaryHi} />
      </SectionCard>
      {existing.kind !== willBecome.kind && (
        <p className="mt-1 text-xs text-muted-foreground" data-keep="data">
          Existing kind: <span className="font-mono">{existing.kind ?? "—"}</span> → new: <span className="font-mono font-semibold">{willBecome.kind}</span>
        </p>
      )}
    </div>
  );
}

interface OverrideKindOption {
  // Unique UI id. Equals `kind` for every entry EXCEPT the general "Expense"
  // entry, which shares kind='portfolio_expense' with the holding-attributed
  // one and is disambiguated by this id (+ `keepHoldingPairless`).
  id: string;
  kind: OverrideKind;
  label: string;
  explanation: string;
  // Pair-less variant that keeps the row on its current holding/cash sleeve —
  // no cash-sleeve move, no related-holding pick. Mirrors the Interest
  // override. Only the general "Expense" entry sets this today.
  keepHoldingPairless?: boolean;
}

const OVERRIDE_KIND_OPTIONS: readonly OverrideKindOption[] = [
  // Pair-less first (these are enabled now)
  {
    id: "opening_balance",
    kind: "opening_balance",
    label: "Opening balance",
    explanation:
      "Carried-in position from another platform. Preserves qty + amount, opens a lot at the entered cost basis. No cash leg.",
  },
  {
    id: "dividend",
    kind: "dividend",
    label: "Dividend (share reinvestment / DRIP)",
    explanation:
      "Treats qty as a share count. Opens a lot at costPerShare = amount/qty. Pick this for crypto staking rewards or true DRIP rows.",
  },
  {
    id: "interest",
    kind: "interest",
    label: "Interest",
    explanation: "Interest received (or paid, if amount < 0). Pair-less — applies to this row alone.",
  },
  {
    id: "expense_general",
    kind: "portfolio_expense",
    keepHoldingPairless: true,
    label: "Expense (general fee)",
    explanation:
      "A fee or cost NOT tied to a specific holding. Pair-less — stays on this row's current holding / cash sleeve, no related-holding pick. Categorized as Investment Fees (created if needed) unless you choose another expense category. Mirrors the Interest override.",
  },
  {
    id: "portfolio_income",
    kind: "portfolio_income",
    label: "Portfolio income (cash dividend, etc.)",
    explanation:
      "Moves the row to the matching cash sleeve, stamps related_holding_id to the picked stock for reporting. Pick this for ordinary stock cash dividends.",
  },
  {
    id: "portfolio_expense",
    kind: "portfolio_expense",
    label: "Portfolio expense (fee tied to a holding)",
    explanation:
      "Moves the row to the matching cash sleeve, stamps related_holding_id to the picked stock. Amount should be negative. Use 'Expense (general fee)' above if the cost isn't tied to a holding.",
  },
  // Paired — Buy/Sell wired (Phase 1, synth_new); the rest disabled until
  // their converters + counterpart picker ship.
  {
    id: "buy",
    kind: "buy",
    label: "Buy",
    explanation:
      "This row is the stock leg of a purchase. Synthesizes the matching cash debit on the account's cash sleeve and opens a lot at cost = |amount| / qty.",
  },
  {
    id: "sell",
    kind: "sell",
    label: "Sell",
    explanation:
      "This row is the stock leg of a sale. Synthesizes the matching cash credit on the account's cash sleeve and FIFO-closes lots for the realized gain.",
  },
  {
    id: "in_kind_transfer_out",
    kind: "in_kind_transfer_out",
    label: "In-kind transfer (this is the source leg)",
    explanation: "Moves this holding out to another account. Link the matching row in the destination account (same holding).",
  },
  {
    id: "in_kind_transfer_in",
    kind: "in_kind_transfer_in",
    label: "In-kind transfer (this is the destination leg)",
    explanation: "Receives this holding from another account. Link the matching row in the source account (same holding).",
  },
  {
    id: "fx_from",
    kind: "fx_from",
    label: "FX from-leg",
    explanation: "The currency you sold. Link the matching to-leg: a cash row in a different currency, same account.",
  },
  {
    id: "fx_to",
    kind: "fx_to",
    label: "FX to-leg",
    explanation: "The currency you bought. Link the matching from-leg: a cash row in a different currency, same account.",
  },
  // Only the investment-side (cash-sleeve) brokerage legs are offered — a
  // backfill orphan is always on an investment account, so it can never BE the
  // external bank-side leg. The external legs (brokerage_deposit_out /
  // brokerage_withdrawal_in) are intentionally omitted from the picker; they
  // remain valid kinds for real brokerage ops, just not selectable here.
  {
    id: "brokerage_deposit_in",
    kind: "brokerage_deposit_in",
    label: "Brokerage deposit",
    explanation: "Cash arriving on the brokerage cash sleeve. Link the matching debit on the funding (non-investment) account.",
  },
  {
    id: "brokerage_withdrawal_out",
    kind: "brokerage_withdrawal_out",
    label: "Brokerage withdrawal",
    explanation: "Cash leaving the brokerage cash sleeve. Link the matching credit on the receiving (non-investment) account.",
  },
];

function VariantOption({ label, explanation, selected, onSelect }: { label: string; explanation: string; selected: boolean; onSelect: () => void }) {
  return (
    <div className="relative">
      {explanation ? (
        <InfoTip label={`About ${label}`} text={explanation} className="absolute right-1 top-1 z-10" />
      ) : null}
      <button
        type="button"
        onClick={onSelect}
        className={`w-full text-left rounded border p-2 ${
          selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
      >
        <div className="flex items-start gap-2">
          <div className={`mt-1 size-3 rounded-full ${selected ? "bg-primary" : "border border-border"}`} />
          <div className="pr-6">
            <div className="font-medium text-xs">{label}</div>
          </div>
        </div>
      </button>
    </div>
  );
}

function CoverageDashboard({ coverage, proposals }: { coverage: Coverage; proposals: Proposal[] }) {
  const approvedCount = proposals.filter((p) => p.status === "approved").length;
  const appliedCount = proposals.filter((p) => p.status === "applied").length;
  const willCanonicalize = proposals.filter((p) => p.status === "approved" || p.status === "applied")
    .filter((p) => p.proposalKind !== "orphan_stock_leg")
    .reduce((acc, p) => acc + p.existingRowIds.length, 0);

  const projectedCanonical = Math.min(coverage.canonicalTxs + willCanonicalize, coverage.totalTxs);
  const projectedPct = coverage.totalTxs === 0 ? 0 : Math.round((projectedCanonical / coverage.totalTxs) * 100);

  return (
    <SectionCard label="Canonicalization coverage" icon={ShieldCheck} tone="cyan">
      <MetricGrid
        metrics={[
          { icon: Landmark, label: "Investment accounts", value: String(coverage.accountCount) },
          { icon: Receipt, label: "Total transactions", value: String(coverage.totalTxs) },
          { icon: CheckCircle2,
            label: "Canonical (kind set + paired)",
            value: `${coverage.canonicalTxs} / ${coverage.totalTxs}`,
            sub: `${coverage.canonicalPct}%`,
          },
          { icon: CalendarClock,
            label: "Pending (needs backfill)",
            value: String(coverage.nonCanonicalTxs),
            sub: coverage.totalTxs > 0 ? `${100 - coverage.canonicalPct}%` : undefined,
          },
          { icon: Layers,
            label: "Not investment txs (no holding)",
            value: String(coverage.nonInvestmentRows ?? 0),
            sub: (coverage.nonInvestmentRows ?? 0) > 0 ? "review & move/delete" : undefined,
          },
        ]}
      />

      {/* Progress bar — current vs projected after applying approved */}
      <div className="mt-4 space-y-1">
        <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden relative">
          <div
            className="h-full bg-pos/70 absolute left-0 top-0"
            style={{ width: `${coverage.canonicalPct}%` }}
            title={`${coverage.canonicalPct}% already canonical`}
          />
          {willCanonicalize > 0 && (
            <div
              className="h-full bg-warning/60 absolute top-0"
              style={{ left: `${coverage.canonicalPct}%`, width: `${projectedPct - coverage.canonicalPct}%` }}
              title={`+${willCanonicalize} after applying ${approvedCount + appliedCount} approved/applied proposals → ${projectedPct}%`}
            />
          )}
        </div>
        <div className="text-xs text-muted-foreground flex justify-between">
          <span>Now: {coverage.canonicalPct}% canonical</span>
          {willCanonicalize > 0 && <span>After this run: {projectedPct}% (+{willCanonicalize} rows)</span>}
        </div>
      </div>

      {/* Per-account breakdown */}
      {coverage.perAccount.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <SectionCard label="Per-account breakdown" icon={Landmark} tone="indigo" list>
            {coverage.perAccount.map((a) => (
              <ListRow
                key={a.accountId}
                title={a.name}
                subtitle={`${a.total} total · ${a.canonical} canonical · ${a.nonInvestmentRows ?? 0} not inv.`}
                value={<span className={`font-mono text-sm ${a.pending > 0 ? "text-warning" : "text-pos"}`}>{a.pending} pending</span>}
                secondary={`${100 - a.pendingPct}% covered`}
                secondaryTone={a.pending > 0 ? "neg" : "pos"}
              />
            ))}
          </SectionCard>
        </div>
      )}
    </SectionCard>
  );
}

function DeltasPanel({ deltas, holdingMap }: { deltas: Proposal["deltasJson"]; holdingMap: Record<number, HoldingMeta> }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Impact</div>
      <div className="rounded border bg-muted/30 p-2 text-xs space-y-1">
        <div>Account balance delta: <span className="font-mono">{deltas.balance.toFixed(2)}</span></div>
        {deltas.realizedGainBase != null && (
          <div>Realized gain (base): <span className="font-mono">{deltas.realizedGainBase.toFixed(2)}</span></div>
        )}
        {deltas.lots.length > 0 && (
          <div>Lot effects: {deltas.lots.map((l) => `${holdingLabelFor(l.holdingId, holdingMap)} qty ${l.qtyDelta > 0 ? "+" : ""}${l.qtyDelta}`).join(", ")}</div>
        )}
      </div>
    </div>
  );
}
