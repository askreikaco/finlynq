/**
 * Overview response contract (allow-list serializer). Every value leaving the endpoint is parsed
 * through these schemas: zod objects STRIP unknown keys, so a builder bug can never leak an extra
 * field (id, key, ciphertext). No raw database ids and no user ids appear anywhere: entities carry
 * a per-response `ref` (stable ordinal), members are keyed by the share id ("me" for the viewer).
 */
import { z } from "zod";
import { FamilySectionSchema, FAMILY_SECTIONS_V1 } from "../sections";

const money = z.number().nullable();
const ref = z.string();
const label = z.string();

export const PARTIAL_REASONS = ["fx_rate_missing", "investment_unpriced", "section_error"] as const;

export const NetWorthDtoSchema = z.object({
  assets: z.number(),
  liabilities: z.number(),
  net: z.number(),
  history: z.array(z.object({ date: z.string(), value: z.number() })),
  /** true: history re-based at today's viewer rates (documented approximation). */
  historyFxApproximation: z.boolean(),
});

export const AccountsDtoSchema = z.object({
  accounts: z.array(
    z.object({
      ref,
      label,
      labelIsGeneric: z.boolean(),
      type: z.string(),
      group: z.string(),
      archived: z.boolean(),
      /** currency of `balance` (account currency) */
      currency: z.string(),
      /** native balance; null = not priced (investment account without a snapshot) */
      balance: money,
      /** balance in the viewer's display currency; null when a rate/price is missing */
      converted: money,
      basis: z.enum(["ledger", "market_snapshot", "unpriced"]),
      asOf: z.string().nullable(),
    }),
  ),
  groups: z.array(z.object({ group: z.string(), type: z.string(), converted: z.number() })),
});

export const InvestmentsDtoSchema = z.object({
  /** sum of the latest stored market-value snapshots of the investment accounts (display currency) */
  holdingsValue: z.number(),
  asOf: z.string().nullable(),
  accountsPriced: z.number(),
  accountsUnpriced: z.number(),
  /**
   * The /portfolio "Performance" card for the selected range: whole-portfolio market value and
   * cost basis (display currency) + TWRR / MWRR (currency-free ratios), computed by the same
   * src/lib/portfolio/performance/compute.ts as GET /api/portfolio/performance.
   */
  performance: z.object({
    from: z.string(),
    to: z.string(),
    series: z.array(z.object({ date: z.string(), marketValue: z.number(), costBasis: z.number() })),
    twrr: z.object({ period: z.number(), annualized: z.number() }),
    mwrr: z.object({ irr: z.number(), converged: z.boolean() }),
    gapsFilledDays: z.number(),
  }),
});

export const GoalsDtoSchema = z.object({
  goals: z.array(
    z.object({
      ref,
      label,
      labelIsGeneric: z.boolean(),
      type: z.string(),
      status: z.string(),
      currency: z.string(),
      targetAmount: z.number(),
      currentAmount: money,
      progress: money,
      remaining: money,
      monthlyNeeded: money,
      deadline: z.string().nullable(),
    }),
  ),
});

export const LoansDtoSchema = z.object({
  loans: z.array(
    z.object({
      ref,
      label,
      labelIsGeneric: z.boolean(),
      type: z.string(),
      currency: z.string(),
      principal: z.number(),
      annualRate: z.number(),
      remainingBalance: money,
      remainingBalanceConverted: money,
      balanceSource: z.enum(["account", "projection"]).nullable(),
      monthlyPayment: money,
      payoffDate: z.string().nullable(),
    }),
  ),
});

export const BudgetsDtoSchema = z.object({
  month: z.string(),
  budgets: z.array(
    z.object({
      ref,
      label,
      labelIsGeneric: z.boolean(),
      budgeted: money,
      actual: money,
    }),
  ),
});

const flowPoint = z.object({ income: z.number(), expenses: z.number() });

export const CashflowDtoSchema = z.object({
  /** first day (YYYY-MM-DD) of the selected range; null = all time */
  from: z.string().nullable(),
  /** months spanned by the selected range (calendar months touched) */
  windowMonths: z.number(),
  /** range totals (display currency); expenses as a positive magnitude */
  income: z.number(),
  expenses: z.number(),
  monthly: z.array(flowPoint.extend({ month: z.string() })),
  /** per-day points, only for the month-to-date range ("This month"); [] otherwise */
  daily: z.array(flowPoint.extend({ date: z.string() })),
  /**
   * Savings rate over the range, dashboard formula (financial-health.ts): (income - expenses) /
   * income with expenses summed as |slice|; null without income. Raw sums let the household
   * total be recomputed from sums, never averaged.
   */
  savings: z.object({ income: z.number(), expenses: z.number(), ratePct: z.number().nullable() }),
  /**
   * Debt-to-income, dashboard formula: trailing-12-month debt service (scheduled loan payments +
   * capped realized payments into loan-less liability accounts) / trailing-12-month income.
   * null when the member does not ALSO share `loans` (never shown as 0).
   */
  debtToIncome: z
    .object({
      pct: z.number().nullable(),
      reliable: z.boolean(),
      debtPayments12m: z.number(),
      income12m: z.number(),
    })
    .nullable(),
});

export const SectionsDtoSchema = z.object({
  net_worth: NetWorthDtoSchema.optional(),
  accounts: AccountsDtoSchema.optional(),
  investments: InvestmentsDtoSchema.optional(),
  goals: GoalsDtoSchema.optional(),
  budgets: BudgetsDtoSchema.optional(),
  loans: LoansDtoSchema.optional(),
  cashflow: CashflowDtoSchema.optional(),
});

export const MemberDtoSchema = z.object({
  /** share id for a shared member; "me" for the viewer's own data */
  id: z.string(),
  relation: z.enum(["me", "shared"]),
  name: z.string(),
  sections: SectionsDtoSchema,
  /** registry sections this member has NOT shared with the viewer (never rendered as 0) */
  notShared: z.array(FamilySectionSchema),
  /** sections that are granted but failed to build */
  unavailable: z.array(FamilySectionSchema),
  partial: z.boolean(),
  partialReasons: z.array(z.enum(PARTIAL_REASONS)),
  /** true when at least one label fell back to a generic one (missing/undecryptable label) */
  genericLabels: z.boolean(),
  error: z.literal("unavailable").optional(),
});

/**
 * Overview ranges: "month" (month-to-date, default), "year" (year-to-date), "all". The rolling
 * "6m" / "1y" windows of the first release stay accepted for old clients.
 */
export const OVERVIEW_PERIODS = ["month", "year", "all", "6m", "1y"] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

export const OverviewResponseSchema = z.object({
  displayCurrency: z.string(),
  period: z.enum(OVERVIEW_PERIODS),
  asOf: z.string(),
  partial: z.boolean(),
  members: z.array(MemberDtoSchema),
});

export type OverviewResponse = z.infer<typeof OverviewResponseSchema>;
export type MemberDto = z.infer<typeof MemberDtoSchema>;
export type SectionsDto = z.infer<typeof SectionsDtoSchema>;
export type PartialReason = (typeof PARTIAL_REASONS)[number];

/** Strip-and-validate: the single exit point of the endpoint. */
export function serializeOverview(raw: unknown): OverviewResponse {
  return OverviewResponseSchema.parse(raw);
}

export { FAMILY_SECTIONS_V1 };
