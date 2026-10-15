"use client";

/**
 * BalanceSummaryCard — final bank-vs-system balance compare for the
 * /reconcile page header (2026-05-24).
 *
 * Shows the bank's latest anchored balance projected forward by every
 * subsequent bank row, alongside the system-side latest balance per the
 * canonical "investment → holdings.value, cash → SUM(transactions)"
 * rule. The delta is the reconciliation signal — non-zero means the two
 * ledgers disagree.
 *
 * `no_anchor` state: the account has bank rows but no statement-balance
 * anchor yet. Bank-side renders as "—" (the route returns null in this
 * state — the naive sum-from-zero we used to show was misleading and
 * drifted further from reality with every import). The card surfaces a
 * hint encouraging the user to upload a statement balance.
 */

import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Info, Landmark, Database } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { MetricTone } from "@/components/mobile/card-label";

export interface BalanceSummary {
  accountId: number;
  currency: string;
  latestAnchor: {
    date: string;
    balance: number;
    source: string;
    currency: string;
  } | null;
  bankSideLatest: number | null;
  systemSideLatest: number;
  delta: number | null;
  status: "balanced" | "mismatch" | "no_anchor";
}

interface BalanceSummaryCardProps {
  summary: BalanceSummary | null;
  loading?: boolean;
}

function fmt(value: number, currency: string): string {
  return formatCurrency(value, currency);
}

export function BalanceSummaryCard({
  summary,
  loading,
}: BalanceSummaryCardProps) {
  if (!summary && !loading) return null;

  if (loading || !summary) {
    return (
      <div className="grid grid-cols-1 regular:grid-cols-3 gap-4">
        <Card title="Bank says" icon={Landmark} value="—" loading />
        <Card title="Finlynq has" icon={Database} value="—" loading />
        <Card title="Delta" icon={Info} value="—" loading />
      </div>
    );
  }

  const { status, bankSideLatest, systemSideLatest, delta, currency, latestAnchor } =
    summary;

  const tone: MetricTone =
    status === "balanced"
      ? "emerald"
      : status === "mismatch"
        ? "rose"
        : "cyan";

  const Icon =
    status === "balanced"
      ? CheckCircle2
      : status === "mismatch"
        ? AlertTriangle
        : Info;

  const valueTone =
    status === "balanced"
      ? "text-pos"
      : status === "mismatch"
        ? "text-destructive"
        : "text-info";

  return (
    <div className="grid grid-cols-1 regular:grid-cols-3 gap-4">
      <Card
        title="Bank says"
        icon={Landmark}
        tone="muted"
        value={bankSideLatest === null ? "—" : bankSideLatest}
        currency={currency}
        sub={latestAnchor ? `as of ${latestAnchor.date}` : "no anchor yet"}
      />
      <Card
        title="Finlynq has"
        icon={Database}
        tone="muted"
        value={systemSideLatest}
        currency={currency}
      />
      <Card
        title={status === "no_anchor" ? "Status" : "Delta"}
        icon={Icon}
        tone={tone}
        value={
          status === "balanced" ? (
            <span className="text-pos text-lg">✓ Balanced</span>
          ) : status === "no_anchor" ? (
            <span className="text-info text-base">Needs anchor</span>
          ) : (
            delta
          )
        }
        currency={currency}
        valueClassName={valueTone}
        sub={
          status === "no_anchor"
            ? "Upload a statement balance to enable validation"
            : undefined
        }
      />
    </div>
  );
}

