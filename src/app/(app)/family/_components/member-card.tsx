"use client";

import { useId } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/currency";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { formatPercent } from "@/lib/locale";
import { TopMoversCard } from "@/app/(app)/portfolio/_components/top-movers-card";
import type { Mover } from "@/app/(app)/portfolio/_types";
import type { MemberDto } from "./types";
import { getSectionLabel } from "./section-labels";
import {
  HeadlineCards,
  IncomeVsExpensesCard,
  NetWorthOverTimeCard,
  PerformanceCard,
  type Period,
} from "./overview-cards";

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

/** Today's top movers of the VIEWER's own portfolio (fetched from /api/portfolio/overview). */
export type OwnMovers = { status: "loading" } | { status: "error" } | { status: "ok"; gainers: Mover[]; losers: Mover[] };

function MoversCards({ member, movers, currency }: { member: MemberDto; movers?: OwnMovers; currency: string }) {
  let body: { gainers?: React.ReactNode; losers?: React.ReactNode; g: Mover[]; l: Mover[] };
  const msg = (text: string) => <p className="text-sm text-muted-foreground">{text}</p>;
  if (member.relation !== "me") {
    // Per-holding day change needs live prices looked up by (encrypted) symbol: owner-only.
    const t = msg(FAMILY_STRINGS.overview_movers_shared_unavailable);
    body = { gainers: t, losers: t, g: [], l: [] };
  } else if (!movers || movers.status === "loading") {
    const t = msg(FAMILY_STRINGS.overview_movers_loading);
    body = { gainers: t, losers: t, g: [], l: [] };
  } else if (movers.status === "error") {
    const t = msg(FAMILY_STRINGS.overview_section_error);
    body = { gainers: t, losers: t, g: [], l: [] };
  } else {
    body = {
      gainers: movers.gainers.length === 0 ? msg(FAMILY_STRINGS.overview_movers_none) : undefined,
      losers: movers.losers.length === 0 ? msg(FAMILY_STRINGS.overview_movers_none) : undefined,
      g: movers.gainers,
      l: movers.losers,
    };
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <TopMoversCard kind="gainers" movers={body.g} currency={currency}>
        {body.gainers}
      </TopMoversCard>
      <TopMoversCard kind="losers" movers={body.l} currency={currency}>
        {body.losers}
      </TopMoversCard>
    </div>
  );
}

export function MemberCard({
  member,
  chartMember,
  displayCurrency,
  period,
  asOf,
  ownMovers,
}: {
  member: MemberDto;
  chartMember?: MemberDto;
  displayCurrency: string;
  period: Period;
  asOf: string;
  ownMovers?: OwnMovers;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const money = (v: number | null | undefined) => (v == null ? NONE : formatCurrency(v, displayCurrency));
  const s = member.sections;
  const cs = chartMember?.sections ?? s; // Use chartMember sections for charts (lifetime data)
  const why = (section: "net_worth" | "cashflow" | "loans" | "investments") =>
    member.unavailable.includes(section) ? FAMILY_STRINGS.overview_section_error : FAMILY_STRINGS.overview_card_not_shared;
  const displayName = member.name;

  return (
    <Card data-testid={`member-${member.id}`} id={`member-${member.id}-heading`}>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg break-words">{displayName}</CardTitle>
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

      <CardContent className="pt-6 space-y-4 px-3 sm:px-6">
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

        {!member.error && (
          <>
            <HeadlineCards
              currency={displayCurrency}
              period={period}
              netWorth={s.net_worth ?? { unavailable: why("net_worth") }}
              flows={s.cashflow ?? { unavailable: why("cashflow") }}
              savingsRatePct={s.cashflow?.savings.ratePct ?? null}
              savingsUnavailable={s.cashflow ? undefined : why("cashflow")}
              dti={s.cashflow?.debtToIncome ?? null}
              dtiUnavailable={s.cashflow?.debtToIncome ? undefined : FAMILY_STRINGS.overview_card_dti_needs}
            />

            {(cs.net_worth || cs.cashflow) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {cs.net_worth && (
                  <NetWorthOverTimeCard
                    history={cs.net_worth.history}
                    currency={displayCurrency}
                    period="all"
                    name={member.name}
                    gradientId={`nw-${uid}`}
                    note={
                      cs.net_worth.historyFxApproximation && cs.net_worth.history.length > 1
                        ? FAMILY_STRINGS.overview_history_fx_note
                        : undefined
                    }
                  />
                )}
                {cs.cashflow && (
                  <IncomeVsExpensesCard
                    series={cs.cashflow}
                    period="all"
                    currency={displayCurrency}
                    asOf={asOf}
                    idPrefix={`ie-${uid}-`}
                  />
                )}
              </div>
            )}

            {s.investments && (
              <>
                <PerformanceCard performance={s.investments.performance} currency={displayCurrency} />
                <MoversCards member={member} movers={ownMovers} currency={displayCurrency} />
              </>
            )}

            {s.loans && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{FAMILY_STRINGS.overview_loans_title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {s.loans.loans.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{NONE}</p>
                  ) : (
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
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
