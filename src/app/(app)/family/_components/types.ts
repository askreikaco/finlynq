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
    holdings: Array<Labelled & { currency: string; quantity: number; isCrypto: boolean }>;
    trend: Point[];
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
    windowMonths: number;
    income: number;
    expenses: number;
    monthly: Array<{ month: string; income: number; expenses: number }>;
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
  period: "6m" | "1y" | "all";
  asOf: string;
  partial: boolean;
  members: MemberDto[];
}
