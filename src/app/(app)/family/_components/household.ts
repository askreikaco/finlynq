import type { MemberDto } from "./types";

export type ExcludeReason = "not_shared" | "partial" | "unavailable";

export interface HouseholdTotals {
  /** null when no member qualifies (never shown as 0) */
  net: number | null;
  assets: number | null;
  liabilities: number | null;
  included: number;
  excluded: Array<{ id: string; name: string; reason: ExcludeReason }>;
}

/**
 * Combined totals in the viewer's display currency. Only members that share net worth with
 * complete data count: a member without the net_worth section (notShared), with a failed section
 * or whole member, or flagged partial (missing rate / unpriced / section error) is EXCLUDED and
 * reported, so the total never silently under-counts or treats "not shared" as zero.
 */
export function computeHousehold(members: MemberDto[]): HouseholdTotals {
  let net = 0;
  let assets = 0;
  let liabilities = 0;
  let included = 0;
  const excluded: HouseholdTotals["excluded"] = [];
  for (const m of members) {
    const nw = m.sections.net_worth;
    if (m.error || m.unavailable.includes("net_worth")) {
      excluded.push({ id: m.id, name: m.name, reason: "unavailable" });
    } else if (!nw || m.notShared.includes("net_worth")) {
      excluded.push({ id: m.id, name: m.name, reason: "not_shared" });
    } else if (m.partial) {
      excluded.push({ id: m.id, name: m.name, reason: "partial" });
    } else {
      net += nw.net;
      assets += nw.assets;
      liabilities += nw.liabilities;
      included += 1;
    }
  }
  return included === 0
    ? { net: null, assets: null, liabilities: null, included, excluded }
    : { net, assets, liabilities, included, excluded };
}
