"use client";

/**
 * SplitBadge (FINLYNQ-111 Phase 2).
 *
 * Shows a small badge if the transaction has splits. Extracted verbatim from
 * transactions/page.tsx so both the page and the TransactionTable can use it.
 */

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export function SplitBadge({ transactionId }: { transactionId: number }) {
  const [hasSplits, setHasSplits] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/transactions/splits?transactionId=${transactionId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: unknown[]) => setHasSplits(d.length > 0))
      .catch(() => setHasSplits(false));
  }, [transactionId]);

  if (!hasSplits) return null;
  return (
    <Badge variant="outline" className="text-xs border-chart-5/30 bg-chart-5/10 text-chart-5 ml-1">
      split
    </Badge>
  );
}
