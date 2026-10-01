"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { FAMILY_STRINGS } from "@/lib/family/strings";

interface NetWorthSection {
  assets: number;
  liabilities: number;
  net: number;
  history: Array<{ date: string; value: number }>;
  historyFxApproximation: boolean;
}

interface AccountsSection {
  accounts: Array<{
    ref: string;
    label: string;
    labelIsGeneric: boolean;
    type: string;
    group: string;
    archived: boolean;
    currency: string;
    balance: number | null;
    converted: number | null;
    basis: string;
    asOf: string | null;
  }>;
  groups: Array<{ group: string; type: string; converted: number }>;
}

interface InvestmentsSection {
  holdingsValue: number;
  asOf: string | null;
  accountsPriced: number;
  accountsUnpriced: number;
  holdings: Array<{
    ref: string;
    label: string;
    labelIsGeneric: boolean;
    currency: string;
    quantity: number;
    isCrypto: boolean;
  }>;
  trend: Array<{ date: string; value: number }>;
}

interface GoalsSection {
  goals: Array<{
    ref: string;
    label: string;
    labelIsGeneric: boolean;
    type: string;
    status: string;
    currency: string;
    targetAmount: number;
    currentAmount: number | null;
    progress: number | null;
    remaining: number | null;
    monthlyNeeded: number | null;
    deadline: string | null;
  }>;
}

interface LoansSection {
  loans: Array<{
    ref: string;
    label: string;
    labelIsGeneric: boolean;
    type: string;
    currency: string;
    principal: number;
    annualRate: number;
    remainingBalance: number | null;
    remainingBalanceConverted: number | null;
    balanceSource: "account" | "projection" | null;
    monthlyPayment: number | null;
    payoffDate: string | null;
  }>;
}

interface BudgetsSection {
  month: string;
  budgets: Array<{
    ref: string;
    label: string;
    labelIsGeneric: boolean;
    budgeted: number | null;
    actual: number | null;
  }>;
}

interface CashflowSection {
  windowMonths: number;
  income: number;
  expenses: number;
  monthly: Array<{ month: string; income: number; expenses: number }>;
}

interface MemberDto {
  id: string;
  relation: "me" | "shared";
  name: string;
  sections: {
    net_worth?: NetWorthSection;
    accounts?: AccountsSection;
    investments?: InvestmentsSection;
    goals?: GoalsSection;
    loans?: LoansSection;
    budgets?: BudgetsSection;
    cashflow?: CashflowSection;
  };
  notShared: string[];
  unavailable: string[];
  partial: boolean;
  partialReasons: string[];
  genericLabels: boolean;
}

export function MemberCard({ member, displayCurrency }: { member: MemberDto; displayCurrency: string }) {
  const memberLabel =
    member.relation === "me"
      ? FAMILY_STRINGS.overview_member_me
      : `${FAMILY_STRINGS.overview_member_you_shared} ${member.name}`;

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{memberLabel}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{member.name}</p>
          </div>
          {member.partial && (
            <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-200">
              {FAMILY_STRINGS.overview_partial_flag}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Not shared sections */}
        {member.notShared.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">{FAMILY_STRINGS.overview_not_shared}</h4>
            <div className="flex flex-wrap gap-2">
              {member.notShared.map((section) => (
                <Badge key={section} variant="secondary">
                  {getSectionLabel(section)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Unavailable sections */}
        {member.unavailable.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-red-600">Error loading</h4>
            <div className="flex flex-wrap gap-2">
              {member.unavailable.map((section) => (
                <Badge key={section} variant="outline" className="bg-red-50 text-red-900 border-red-200">
                  {getSectionLabel(section)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Net worth section */}
        {member.sections.net_worth && (
          <SectionCard title={FAMILY_STRINGS.overview_net_worth_title} isGeneric={member.genericLabels}>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">{FAMILY_STRINGS.overview_kpi_assets}</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(member.sections.net_worth.assets, displayCurrency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{FAMILY_STRINGS.overview_kpi_liabilities}</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(member.sections.net_worth.liabilities, displayCurrency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{FAMILY_STRINGS.overview_kpi_net_worth}</p>
                <p className="text-lg font-semibold">
                  {formatCurrency(member.sections.net_worth.net, displayCurrency)}
                </p>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Accounts section */}
        {member.sections.accounts && (
          <SectionCard title={FAMILY_STRINGS.overview_accounts_title} isGeneric={member.genericLabels}>
            <div className="space-y-3">
              {member.sections.accounts.accounts.map((account) => (
                <div key={account.ref} className="flex items-center justify-between pb-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">
                      {account.labelIsGeneric && <span className="text-muted-foreground">({account.label})</span>}
                      {!account.labelIsGeneric && account.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.type} • {account.currency}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    {account.converted !== null ? formatCurrency(account.converted, displayCurrency) : "—"}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Investments section */}
        {member.sections.investments && (
          <SectionCard title={FAMILY_STRINGS.overview_investments_title} isGeneric={member.genericLabels}>
            <div>
              <p className="text-sm font-medium">{FAMILY_STRINGS.overview_kpi_assets}</p>
              <p className="text-xl font-semibold">{formatCurrency(member.sections.investments.holdingsValue, displayCurrency)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {member.sections.investments.accountsPriced} valued,
                {member.sections.investments.accountsUnpriced > 0 && ` ${member.sections.investments.accountsUnpriced} unpriced`}
              </p>
            </div>
          </SectionCard>
        )}

        {/* Goals section */}
        {member.sections.goals && (
          <SectionCard title={FAMILY_STRINGS.overview_goals_title} isGeneric={member.genericLabels}>
            <div className="space-y-3">
              {member.sections.goals.goals.map((goal) => (
                <div key={goal.ref} className="pb-2 border-b last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">
                      {goal.labelIsGeneric && <span className="text-muted-foreground">({goal.label})</span>}
                      {!goal.labelIsGeneric && goal.label}
                    </p>
                    {goal.progress !== null && (
                      <Badge variant="outline" className="text-xs">
                        {Math.round((goal.progress / goal.targetAmount) * 100)}%
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {goal.currentAmount !== null ? formatCurrency(goal.currentAmount, displayCurrency) : "—"} of{" "}
                    {formatCurrency(goal.targetAmount, displayCurrency)}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Loans section */}
        {member.sections.loans && (
          <SectionCard title={FAMILY_STRINGS.overview_loans_title} isGeneric={member.genericLabels}>
            <div className="space-y-3">
              {member.sections.loans.loans.map((loan) => (
                <div key={loan.ref} className="pb-2 border-b last:border-0">
                  <p className="text-sm font-medium">
                    {loan.labelIsGeneric && <span className="text-muted-foreground">({loan.label})</span>}
                    {!loan.labelIsGeneric && loan.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {loan.annualRate.toFixed(2)}% • Balance: {loan.remainingBalanceConverted !== null ? formatCurrency(loan.remainingBalanceConverted, displayCurrency) : "—"}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Budgets section */}
        {member.sections.budgets && (
          <SectionCard title={FAMILY_STRINGS.overview_budgets_title} isGeneric={member.genericLabels}>
            <div className="space-y-3">
              {member.sections.budgets.budgets.map((budget) => (
                <div key={budget.ref} className="flex items-center justify-between pb-2 border-b last:border-0">
                  <p className="text-sm font-medium">
                    {budget.labelIsGeneric && <span className="text-muted-foreground">({budget.label})</span>}
                    {!budget.labelIsGeneric && budget.label}
                  </p>
                  <p className="text-sm">
                    {budget.actual !== null ? formatCurrency(budget.actual, displayCurrency) : "—"} /{" "}
                    {budget.budgeted !== null ? formatCurrency(budget.budgeted, displayCurrency) : "—"}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Cashflow section */}
        {member.sections.cashflow && (
          <SectionCard title={FAMILY_STRINGS.overview_cashflow_title} isGeneric={member.genericLabels}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Income</p>
                <p className="text-lg font-semibold">{formatCurrency(member.sections.cashflow.income, displayCurrency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Expenses</p>
                <p className="text-lg font-semibold">{formatCurrency(member.sections.cashflow.expenses, displayCurrency)}</p>
              </div>
            </div>
          </SectionCard>
        )}
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, children, isGeneric }: { title: string; children: React.ReactNode; isGeneric?: boolean }) {
  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        {isGeneric && <Badge variant="outline" className="text-xs">Generic</Badge>}
      </div>
      {children}
    </div>
  );
}

function getSectionLabel(section: string): string {
  const labels: Record<string, string> = {
    net_worth: FAMILY_STRINGS.overview_net_worth_title,
    accounts: FAMILY_STRINGS.overview_accounts_title,
    investments: FAMILY_STRINGS.overview_investments_title,
    goals: FAMILY_STRINGS.overview_goals_title,
    budgets: FAMILY_STRINGS.overview_budgets_title,
    loans: FAMILY_STRINGS.overview_loans_title,
    cashflow: FAMILY_STRINGS.overview_cashflow_title,
  };
  return labels[section] || section;
}
