"use client";

import { useId } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getMonthLabel } from "@/lib/currency";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import type { MemberDto } from "./types";
import { TrendChart } from "./trend-chart";
import { fill, getSectionLabel } from "./section-labels";
import { formatPercent } from "@/lib/locale";

const NONE = FAMILY_STRINGS.overview_none;

/** Label text only (React escapes it). Generic fallback labels are muted + marked. */
function Label({ text, generic }: { text: string; generic: boolean }) {
  return generic ? (
    <span className="text-muted-foreground" title={FAMILY_STRINGS.overview_generic_badge}>
      {text}
    </span>
  ) : (
    <>{text}</>
  );
}

export function MemberCard({ member, displayCurrency }: { member: MemberDto; displayCurrency: string }) {
  const uid = useId().replace(/:/g, "");
  const money = (v: number | null | undefined) => (v == null ? NONE : formatCurrency(v, displayCurrency));
  const s = member.sections;
  const isMe = member.relation === "me";

  return (
    <Card data-testid={`member-${member.id}`}>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg break-words">
              {isMe ? FAMILY_STRINGS.overview_member_me : member.name}
            </CardTitle>
            {isMe && <p className="text-sm text-muted-foreground mt-1 break-words">{member.name}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {member.partial && (
              <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-200">
                {FAMILY_STRINGS.overview_partial_flag}
              </Badge>
            )}
            {member.genericLabels && <Badge variant="outline">{FAMILY_STRINGS.overview_generic_badge}</Badge>}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {member.error && (
          <p role="alert" className="text-sm text-red-700">
            {FAMILY_STRINGS.overview_section_error}
          </p>
        )}

        {member.notShared.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">{FAMILY_STRINGS.overview_not_shared}</h4>
            <ul className="flex flex-wrap gap-2">
              {member.notShared.map((section) => (
                <li key={section}>
                  <Badge variant="secondary">{getSectionLabel(section)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {member.unavailable.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 text-red-700">{FAMILY_STRINGS.overview_unavailable_heading}</h4>
            <ul className="flex flex-wrap gap-2">
              {member.unavailable.map((section) => (
                <li key={section}>
                  <Badge variant="outline" className="bg-red-50 text-red-900 border-red-200">
                    {getSectionLabel(section)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.net_worth && (
          <SectionBox title={FAMILY_STRINGS.overview_net_worth_title}>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Stat label={FAMILY_STRINGS.overview_kpi_assets} value={money(s.net_worth.assets)} />
              <Stat label={FAMILY_STRINGS.overview_kpi_liabilities} value={money(s.net_worth.liabilities)} />
              <Stat label={FAMILY_STRINGS.overview_kpi_net_worth} value={money(s.net_worth.net)} />
            </dl>
            <div className="mt-4">
              <TrendChart
                title={FAMILY_STRINGS.overview_net_worth_trend}
                memberName={member.name}
                data={s.net_worth.history}
                currency={displayCurrency}
                color="#6366f1"
                gradientId={`nw-${uid}`}
              />
              {s.net_worth.historyFxApproximation && s.net_worth.history.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">{FAMILY_STRINGS.overview_history_fx_note}</p>
              )}
            </div>
          </SectionBox>
        )}

        {s.accounts && (
          <SectionBox title={FAMILY_STRINGS.overview_accounts_title}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{FAMILY_STRINGS.overview_accounts_title}</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="pb-2 pr-3 font-medium">{FAMILY_STRINGS.overview_member_table_account}</th>
                    <th scope="col" className="pb-2 pr-3 font-medium">{FAMILY_STRINGS.overview_member_table_type}</th>
                    <th scope="col" className="pb-2 pr-3 font-medium text-right">{FAMILY_STRINGS.overview_member_table_native}</th>
                    <th scope="col" className="pb-2 font-medium text-right">{FAMILY_STRINGS.overview_member_table_balance}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.accounts.accounts.map((a) => (
                    <tr key={a.ref} className="border-t">
                      <th scope="row" className="py-2 pr-3 text-left font-medium break-words">
                        <Label text={a.label} generic={a.labelIsGeneric} />
                      </th>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {a.type} · {a.currency}
                      </td>
                      <td className="py-2 pr-3 text-right text-muted-foreground whitespace-nowrap">
                        {a.balance == null ? NONE : formatCurrency(a.balance, a.currency)}
                      </td>
                      <td className="py-2 text-right font-semibold whitespace-nowrap">{money(a.converted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionBox>
        )}

        {s.investments && (
          <SectionBox title={FAMILY_STRINGS.overview_investments_title}>
            <p className="text-xl font-semibold">{money(s.investments.holdingsValue)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {s.investments.accountsPriced} {FAMILY_STRINGS.overview_valued}
              {s.investments.accountsUnpriced > 0 && `, ${s.investments.accountsUnpriced} ${FAMILY_STRINGS.overview_unpriced}`}
              {s.investments.asOf && ` · ${FAMILY_STRINGS.overview_asof} ${formatDate(s.investments.asOf)}`}
            </p>
            {s.investments.holdings.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {s.investments.holdings.map((h) => (
                  <li key={h.ref} className="flex justify-between gap-3">
                    <span className="break-words min-w-0">
                      <Label text={h.label} generic={h.labelIsGeneric} />
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {h.quantity} {h.currency}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4">
              <TrendChart
                title={FAMILY_STRINGS.overview_investments_trend}
                memberName={member.name}
                data={s.investments.trend}
                currency={displayCurrency}
                color="#10b981"
                gradientId={`inv-${uid}`}
              />
            </div>
          </SectionBox>
        )}

        {s.goals && (
          <SectionBox title={FAMILY_STRINGS.overview_goals_title}>
            <ul className="space-y-3">
              {s.goals.goals.map((g) => (
                <li key={g.ref} className="border-b pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium break-words min-w-0">
                      <Label text={g.label} generic={g.labelIsGeneric} />
                    </p>
                    {g.progress !== null && <Badge variant="outline">{Math.round(g.progress)}%</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {g.currentAmount == null ? NONE : formatCurrency(g.currentAmount, g.currency)}{" "}
                    {FAMILY_STRINGS.overview_goal_of} {formatCurrency(g.targetAmount, g.currency)}
                    {g.deadline && ` · ${formatDate(g.deadline)}`}
                  </p>
                </li>
              ))}
            </ul>
          </SectionBox>
        )}

        {s.loans && (
          <SectionBox title={FAMILY_STRINGS.overview_loans_title}>
            <ul className="space-y-3">
              {s.loans.loans.map((l) => (
                <li key={l.ref} className="border-b pb-2 last:border-0">
                  <p className="text-sm font-medium break-words">
                    <Label text={l.label} generic={l.labelIsGeneric} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatPercent(l.annualRate, 2)} · {FAMILY_STRINGS.overview_loan_balance}: {money(l.remainingBalanceConverted)}
                    {l.payoffDate && ` · ${formatDate(l.payoffDate)}`}
                  </p>
                </li>
              ))}
            </ul>
          </SectionBox>
        )}

        {s.budgets && (
          <SectionBox title={`${FAMILY_STRINGS.overview_budgets_title} · ${getMonthLabel(s.budgets.month)}`}>
            <ul className="space-y-2">
              {s.budgets.budgets.map((b) => (
                <li key={b.ref} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                  <p className="text-sm font-medium break-words min-w-0">
                    <Label text={b.label} generic={b.labelIsGeneric} />
                  </p>
                  <p className="text-sm whitespace-nowrap">
                    {money(b.actual)} / {money(b.budgeted)}
                  </p>
                </li>
              ))}
            </ul>
          </SectionBox>
        )}

        {s.cashflow && (
          <SectionBox title={FAMILY_STRINGS.overview_cashflow_title}>
            <dl className="grid grid-cols-2 gap-4">
              <Stat label={FAMILY_STRINGS.overview_income} value={money(s.cashflow.income)} />
              <Stat label={FAMILY_STRINGS.overview_expenses} value={money(s.cashflow.expenses)} />
            </dl>
            <p className="text-xs text-muted-foreground mt-2">
              {fill(FAMILY_STRINGS.overview_cashflow_window, { months: s.cashflow.windowMonths })}
            </p>
          </SectionBox>
        )}
      </CardContent>
    </Card>
  );
}

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rounded-lg p-4 bg-muted/30">
      <h4 className="text-sm font-semibold mb-3">{title}</h4>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold break-words">{value}</dd>
    </div>
  );
}
