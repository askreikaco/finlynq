/**
 * Dashboard card registry + layout normalisation (order + hidden), shared by the
 * /api/settings/dashboard-layout route, the dashboard page and the Customize sheet.
 * DASHBOARD_CARDS order IS the default (= pre-customisation) dashboard order.
 */

export interface DashboardCardDef {
  id: string;
  title: string;
  /** Only rendered when dev mode is on (mirrors the page's existing devMode gate). */
  devOnly?: boolean;
}

export const DASHBOARD_CARDS: readonly DashboardCardDef[] = [
  { id: "onboarding-tips", title: "Getting started tips" },
  { id: "net-worth", title: "Net worth" },
  { id: "health-score", title: "Financial health" },
  { id: "summary-stats", title: "Monthly summary" },
  { id: "key-metrics", title: "Key metrics" },
  { id: "net-worth-history", title: "Net worth over time" },
  { id: "action-center", title: "Action center" },
  { id: "weekly-recap", title: "Weekly recap" },
  { id: "quick-import", title: "Quick import" },
  { id: "income-expense-chart", title: "Income & expenses", devOnly: true },
  { id: "spending-category-chart", title: "Spending by category", devOnly: true },
  { id: "available-to-spend", title: "Available to spend", devOnly: true },
  { id: "insights", title: "Insights", devOnly: true },
] as const;

export const DASHBOARD_LAYOUT_KEY = "dashboard_layout_v1";
export const DEFAULT_CARD_ORDER: readonly string[] = DASHBOARD_CARDS.map((c) => c.id);
const KNOWN = new Set(DEFAULT_CARD_ORDER);

export interface DashboardLayout {
  order: string[];
  hidden: string[];
}

export function defaultLayout(): DashboardLayout {
  return { order: [...DEFAULT_CARD_ORDER], hidden: [] };
}

function knownUnique(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of list) {
    if (typeof id === "string" && KNOWN.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Coerce anything (saved JSON, request body) into a complete layout: unknown ids
 * dropped, duplicates removed, cards missing from `order` (e.g. added after the user
 * saved) inserted at their default position, `hidden` limited to known ids.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { order?: unknown; hidden?: unknown };
  const order = knownUnique(obj.order);
  for (let i = 0; i < DEFAULT_CARD_ORDER.length; i++) {
    const id = DEFAULT_CARD_ORDER[i];
    if (order.includes(id)) continue;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const pos = order.indexOf(DEFAULT_CARD_ORDER[j]);
      if (pos !== -1) {
        at = pos + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }
  return { order, hidden: knownUnique(obj.hidden) };
}
