import type { FamilySection } from "@/lib/family/sections";

/** Wire shape of /api/family/manage/list rows (manage-guard.ts:toShareDto). */
export interface ShareDto {
  id: string;
  role: "owner" | "viewer";
  status: string;
  sections: FamilySection[];
  mustShareBack: boolean;
  requiredBackSections: FamilySection[];
  isReciprocal: boolean;
  reciprocalOf?: string | null;
  reconsentRequired: boolean;
  reconsentSections: FamilySection[];
  createdAt: string;
  acceptedAt?: string;
  lastViewedAt?: string;
  counterparty: { email?: string; name?: string };
}

export interface SharesResponse {
  outgoing: ShareDto[];
  incoming: ShareDto[];
}

export const LIVE_STATUSES = ["pending", "awaiting_owner_unlock", "active"] as const;
export const ENDABLE_STATUSES = ["pending", "awaiting_owner_unlock", "active", "suspended"] as const;

export function counterpartyLabel(share: ShareDto): string {
  return share.counterparty.name || share.counterparty.email || "";
}

// ── /api/family/overview wire shape (mirror of src/lib/family/overview/dto.ts; that module is
// off-limits to components by the eslint key-material boundary. tests/family/family-p5-ui.test.ts
// asserts at compile time that both shapes stay identical). ──
export type PartialReason = "fx_rate_missing" | "investment_unpriced" | "section_error";
type Money = number | null;
interface Labelled {
  ref: string;
  label: string;
  labelIsGeneric: boolean;
}
interface Point {
  date: string;
  value: number;
}

export interface PerformanceDto {
  from: string;
  to: string;
  series: Array<{ date: string; marketValue: number; costBasis: number }>;
  twrr: { period: number | null; annualized: number | null };
  mwrr: { irr: number | null; converged: boolean };
  gapsFilledDays: number;
}

export interface DebtToIncomeDto {
  pct: number | null;
  reliable: boolean;
  debtPayments12m: number;
  income12m: number;
}

export interface SectionsDto {
  net_worth?: { assets: number; liabilities: number; net: number; history: Point[]; historyFxApproximation: boolean };
  accounts?: {
    accounts: Array<
      Labelled & {
        type: string;
        group: string;
        archived: boolean;
        currency: string;
        balance: Money;
        converted: Money;
        basis: "ledger" | "market_snapshot" | "unpriced";
        asOf: string | null;
      }
    >;
    groups: Array<{ group: string; type: string; converted: number }>;
  };
  investments?: {
    holdingsValue: number;
    asOf: string | null;
    accountsPriced: number;
    accountsUnpriced: number;
    performance: PerformanceDto;
  };
  goals?: {
    goals: Array<
      Labelled & {
        type: string;
        status: string;
        currency: string;
        targetAmount: number;
        currentAmount: Money;
        progress: Money;
        remaining: Money;
        monthlyNeeded: Money;
        deadline: string | null;
      }
    >;
  };
  budgets?: { month: string; budgets: Array<Labelled & { budgeted: Money; actual: Money }> };
  loans?: {
    loans: Array<
      Labelled & {
        type: string;
        currency: string;
        principal: number;
        annualRate: number;
        remainingBalance: Money;
        remainingBalanceConverted: Money;
        balanceSource: "account" | "projection" | null;
        monthlyPayment: Money;
        payoffDate: string | null;
      }
    >;
  };
  cashflow?: {
    from: string | null;
    windowMonths: number;
    income: number;
    expenses: number;
    monthly: Array<{ month: string; income: number; expenses: number }>;
    daily: Array<{ date: string; income: number; expenses: number }>;
    savings: { income: number; expenses: number; ratePct: number | null };
    debtToIncome: DebtToIncomeDto | null;
  };
}

export interface MemberDto {
  id: string;
  relation: "me" | "shared";
  name: string;
  sections: SectionsDto;
  notShared: FamilySection[];
  unavailable: FamilySection[];
  partial: boolean;
  partialReasons: PartialReason[];
  genericLabels: boolean;
  error?: "unavailable";
}

export interface OverviewResponse {
  displayCurrency: string;
  /** month = month-to-date, year = year-to-date; 6m / 1y = legacy rolling windows */
  period: "month" | "year" | "all" | "6m" | "1y";
  asOf: string;
  partial: boolean;
  members: MemberDto[];
}
