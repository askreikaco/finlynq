// Shared budget types and the month query-param guard for the budgets list and its form pages.

export type Budget = {
  id: number;
  categoryId: number;
  categoryName: string;
  categoryGroup: string;
  month: string;
  amount: number;
  currency?: string;
  rolloverAmount?: number;
};

export type Category = { id: number; name: string; type: string; group: string };

export type SpendingRow = {
  categoryId: number;
  categoryName: string;
  categoryGroup: string;
  categoryType: string;
  total: number;
};

export type BudgetTemplate = {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  categoryGroup: string;
  amount: number;
  createdAt: string;
};

export type BudgetMode = "traditional" | "envelope";

/** `?month=YYYY-MM` from the URL; anything else falls back to the current month. */
export function parseMonthParam(raw: string | null | undefined, fallback: string): string {
  return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : fallback;
}

export type AgeOfMoney = {
  ageInDays: number;
  trend: number;
  history: { date: string; ageInDays: number }[];
};
