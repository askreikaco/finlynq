/**
 * Dashboard card registry + layout normalisation (order + hidden), shared by the
 * /api/settings/dashboard-layout route, the dashboard page and the Customize sheet.
 * DASHBOARD_CARDS order IS the default (= pre-customisation) dashboard order.
 * The generic per-page layout lives in lib/card-layout.ts; the dashboard keeps this legacy key and format.
 */

import { normalizeCardLayout, type CardLayout, type PageCard } from "@/lib/card-layout";

export interface DashboardCardDef extends PageCard {
  /** Only rendered when dev mode is on (mirrors the page's existing devMode gate). */
  devOnly?: boolean;
}

export const DASHBOARD_CARDS: readonly DashboardCardDef[] = [
  { id: "onboarding-tips", title: "Getting started tips" },
  { id: "due-subscriptions", title: "Due subscriptions" },
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

export type DashboardLayout = CardLayout;

export function defaultLayout(): DashboardLayout {
  return { order: [...DEFAULT_CARD_ORDER], hidden: [] };
}

/**
 * Coerce anything (saved JSON, request body) into a complete dashboard layout: unknown ids
 * dropped, duplicates removed, cards missing from `order` (e.g. added after the user
 * saved) inserted at their default position, `hidden` limited to known ids.
 */
export function normalizeLayout(raw: unknown): DashboardLayout {
  return normalizeCardLayout(raw, DASHBOARD_CARDS);
}
