/**
 * "From" / "To" of a transfer leg. A transfer is two legs sharing a link_id on DIFFERENT accounts; the leg that
 * lost money (amount < 0) is the From side. Pure; the peer comes from the loaded list or /api/transactions/linked.
 */

export type TransferLeg = { id: number; accountId: number; accountName: string; amount: number; linkId?: string | null };
export type TransferPeer = { accountId: number; accountName: string };
export type TransferEnds = { from: string; to: string };

export function transferEnds(leg: TransferLeg, peer: TransferPeer | null | undefined): TransferEnds | null {
  if (!leg.linkId || !peer || peer.accountId === leg.accountId) return null;
  const mine = leg.accountName || "—";
  const theirs = peer.accountName || "—";
  return leg.amount < 0 ? { from: mine, to: theirs } : { from: theirs, to: mine };
}

/** Peers resolvable from rows already loaded: a link_id with exactly two rows on different accounts. */
export function peersFromLoaded(rows: readonly TransferLeg[]): Map<number, TransferPeer> {
  const byLink = new Map<string, TransferLeg[]>();
  for (const r of rows) {
    if (!r.linkId) continue;
    const list = byLink.get(r.linkId);
    if (list) list.push(r);
    else byLink.set(r.linkId, [r]);
  }
  const out = new Map<number, TransferPeer>();
  for (const list of byLink.values()) {
    if (list.length !== 2 || list[0].accountId === list[1].accountId) continue;
    out.set(list[0].id, { accountId: list[1].accountId, accountName: list[1].accountName });
    out.set(list[1].id, { accountId: list[0].accountId, accountName: list[0].accountName });
  }
  return out;
}
