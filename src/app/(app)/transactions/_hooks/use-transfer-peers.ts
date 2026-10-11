"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { peersFromLoaded, type TransferPeer } from "@/lib/transactions/transfer-ends";
import type { Transaction } from "../_types";

/** At most this many /linked lookups per list load (the rest simply show their own account). */
const MAX_LOOKUPS = 40;

/**
 * Other leg of each transfer row, keyed by transaction id. Uses the loaded rows when both legs are on the page;
 * otherwise (paging, an account filter) asks /api/transactions/linked once per row and keeps the answer.
 */
export function useTransferPeers(txns: readonly Transaction[]): Map<number, TransferPeer> {
  const loaded = useMemo(() => peersFromLoaded(txns), [txns]);
  // Rows already asked about (answered or in flight), so each is looked up once.
  const asked = useRef(new Set<number>());
  const [fetched, setFetched] = useState<ReadonlyMap<number, TransferPeer>>(() => new Map());

  useEffect(() => {
    let budget = MAX_LOOKUPS;
    for (const t of txns) {
      if (budget <= 0) break;
      if (!t.linkId || t.id <= 0 || t.kind || loaded.has(t.id) || asked.current.has(t.id)) continue;
      budget--;
      asked.current.add(t.id);
      void (async () => {
        try {
          const r = await fetch(`/api/transactions/linked?linkId=${encodeURIComponent(t.linkId as string)}&excludeId=${t.id}`);
          if (!r || !r.ok) return;
          const rows = ((await r.json())?.data ?? []) as Array<{ accountId: number | null; accountName: string | null }>;
          if (rows.length === 1 && rows[0].accountId != null && rows[0].accountId !== t.accountId) {
            const peer: TransferPeer = { accountId: rows[0].accountId, accountName: rows[0].accountName ?? "" };
            setFetched((prev) => new Map(prev).set(t.id, peer));
          }
        } catch {
          /* no peer: the row keeps showing its own account */
        }
      })();
    }
  }, [txns, loaded]);

  return useMemo(() => {
    const out = new Map(loaded);
    for (const [id, p] of fetched) if (!out.has(id)) out.set(id, p);
    return out;
  }, [loaded, fetched]);
}
