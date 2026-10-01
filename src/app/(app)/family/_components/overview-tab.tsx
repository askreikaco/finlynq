"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/currency";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import type { MemberDto, OverviewResponse } from "./types";
import { MfaRequiredCta } from "./mfa-required-cta";
import { MemberCard, type OwnMovers } from "./member-card";
import { computeHousehold, computeHouseholdFlows, type ExcludeReason } from "./household";
import { errorMessage } from "./api";
import { fill } from "./section-labels";
import { HeadlineCards, IncomeVsExpensesCard, NetWorthOverTimeCard, type Period } from "./overview-cards";

/** The ranges offered (legacy 6m / 1y stay API-only). Default: this month. */
const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "month", label: FAMILY_STRINGS.overview_period_month },
  { value: "year", label: FAMILY_STRINGS.overview_period_year },
  { value: "all", label: FAMILY_STRINGS.overview_period_all },
];

const EXCLUDE_TEXT: Record<ExcludeReason, string> = {
  not_shared: FAMILY_STRINGS.overview_totals_excluded_not_shared,
  partial: FAMILY_STRINGS.overview_totals_excluded_partial,
  unavailable: FAMILY_STRINGS.overview_totals_excluded_unavailable,
};

const memberLabel = (m: MemberDto) => (m.relation === "me" ? FAMILY_STRINGS.overview_member_me : m.name);

export function OverviewTab({ reloadKey = 0 }: { reloadKey?: number }) {
  const [period, setPeriod] = useState<Period>("month");
  const [selected, setSelected] = useState<string>("all");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [movers, setMovers] = useState<OwnMovers | undefined>(undefined);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      setMfaRequired(false);
      try {
        const res = await fetch(`/api/family/overview?${new URLSearchParams({ period })}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        if (res.status === 403) {
          const body = await res.clone().json().catch(() => ({}));
          if (body?.error === "mfa_required") {
            setMfaRequired(true);
            return;
          }
        }
        if (!res.ok) {
          setError(
            res.status === 429 || res.status === 401
              ? await errorMessage(res, FAMILY_STRINGS.error_loading_data)
              : FAMILY_STRINGS.error_loading_data,
          );
          return;
        }
        const overview: OverviewResponse = await res.json();
        if (!ctrl.signal.aborted) setData(overview);
      } catch {
        if (!ctrl.signal.aborted) setError(FAMILY_STRINGS.error_loading_data);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [period, attempt, reloadKey]);

  // Top Gainers / Losers of the viewer's OWN portfolio: the same /api/portfolio/overview the
  // Portfolio page reads (live prices need the owner's own session, so only "me" has them).
  const displayCurrency = data?.displayCurrency;
  const meHasInvestments = !!data?.members.some((m) => m.relation === "me" && m.sections.investments);
  useEffect(() => {
    if (!displayCurrency || !meHasInvestments) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMovers({ status: "loading" });
    fetch(`/api/portfolio/overview?${new URLSearchParams({ currency: displayCurrency })}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d: { topGainers?: unknown; topLosers?: unknown }) => {
        if (ctrl.signal.aborted) return;
        setMovers({
          status: "ok",
          gainers: Array.isArray(d.topGainers) ? d.topGainers : [],
          losers: Array.isArray(d.topLosers) ? d.topLosers : [],
        });
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setMovers({ status: "error" });
      });
    return () => ctrl.abort();
  }, [displayCurrency, meHasInvestments]);

  if (mfaRequired) return <MfaRequiredCta />;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label={FAMILY_STRINGS.accept_loading}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Card className="border-destructive bg-destructive/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div role="alert">
            <p className="font-medium text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setAttempt((a) => a + 1)}>
              {FAMILY_STRINGS.overview_retry}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <p className="text-muted-foreground">{FAMILY_STRINGS.overview_empty}</p>
        </CardContent>
      </Card>
    );
  }

  const cur = data.displayCurrency;
  const shownPeriod = data.period;
  const focus = selected === "all" ? null : data.members.find((m) => m.id === selected) ?? null;
  const members = focus ? [focus] : data.members;

  return (
    <div className="space-y-6" aria-busy={loading}>
      {/* Toolbar: member filter + time range (wraps / scrolls on mobile) */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div
          role="group"
          aria-label={FAMILY_STRINGS.overview_member_filter_label}
          className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 md:pb-0"
        >
          <Button
            size="sm"
            variant={focus == null ? "default" : "outline"}
            aria-pressed={focus == null}
            onClick={() => setSelected("all")}
            className="shrink-0"
          >
            {FAMILY_STRINGS.overview_member_filter_all}
          </Button>
          {data.members.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={focus?.id === m.id ? "default" : "outline"}
              aria-pressed={focus?.id === m.id}
              onClick={() => setSelected(m.id)}
              className="shrink-0 max-w-[12rem] truncate"
            >
              {memberLabel(m)}
            </Button>
          ))}
        </div>
        <div role="group" aria-label={FAMILY_STRINGS.overview_range_label} className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={period === p.value ? "default" : "outline"}
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 empty:hidden">
        {data.partial && (
          <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-200">
            {FAMILY_STRINGS.overview_rate_unavailable}
          </Badge>
        )}
        {data.members.some((m) => m.partialReasons.includes("investment_unpriced")) && (
          <Badge variant="outline" className="bg-amber-50 text-amber-900 border-amber-200">
            {FAMILY_STRINGS.overview_investment_unpriced}
          </Badge>
        )}
        {data.members.some((m) => m.partialReasons.includes("section_error")) && (
          <Badge variant="outline" className="bg-red-50 text-red-900 border-red-200">
            {FAMILY_STRINGS.overview_section_error}
          </Badge>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {focus == null && <HouseholdBlock data={data} period={shownPeriod} />}

      <p className="text-xs text-muted-foreground">
        {fill(FAMILY_STRINGS.overview_converted_note, { currency: cur, date: formatDate(data.asOf) })}
      </p>

      {data.members.some((m) => m.genericLabels) && (
        <Alert>
          <AlertDescription>{FAMILY_STRINGS.overview_generic_label_hint}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {members.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            displayCurrency={cur}
            period={shownPeriod}
            asOf={data.asOf}
            ownMovers={member.relation === "me" ? movers : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** "All": household figures summed over the members that share the data with complete figures. */
function HouseholdBlock({ data, period }: { data: OverviewResponse; period: Period }) {
  const totals = computeHousehold(data.members);
  const flows = computeHouseholdFlows(data.members);
  const cur = data.displayCurrency;
  const excludedText = (list: typeof totals.excluded, notShared = EXCLUDE_TEXT.not_shared) =>
    fill(FAMILY_STRINGS.overview_totals_excluded, {
      members: list
        .map((e) => `${e.name} (${e.reason === "not_shared" ? notShared : EXCLUDE_TEXT[e.reason]})`)
        .join(", "),
    });
  const notShared = FAMILY_STRINGS.overview_card_not_shared.toLowerCase();

  return (
    <section aria-labelledby="family-household-heading" className="space-y-4" data-testid="household">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle id="family-household-heading" className="text-lg">
            {FAMILY_STRINGS.overview_household_title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-3 sm:px-6">
          <HeadlineCards
            currency={cur}
            period={period}
            netWorth={
              totals.net == null
                ? { unavailable: FAMILY_STRINGS.overview_totals_none }
                : { net: totals.net, assets: totals.assets ?? 0, liabilities: totals.liabilities ?? 0, history: totals.history }
            }
            flows={
              flows.income == null || flows.expenses == null
                ? { unavailable: FAMILY_STRINGS.overview_card_not_shared }
                : { income: flows.income, expenses: flows.expenses, monthly: flows.monthly, daily: flows.daily, from: flows.from }
            }
            savingsRatePct={flows.savingsRatePct}
            savingsUnavailable={flows.included === 0 ? FAMILY_STRINGS.overview_card_not_shared : undefined}
            dti={flows.dti}
            dtiUnavailable={flows.dti ? undefined : FAMILY_STRINGS.overview_card_dti_needs}
          />

          {(totals.included > 0 || flows.included > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {totals.included > 0 && (
                <NetWorthOverTimeCard
                  history={totals.history}
                  currency={cur}
                  period={period}
                  name={FAMILY_STRINGS.overview_household_title}
                  gradientId="nw-household"
                />
              )}
              {flows.included > 0 && (
                <IncomeVsExpensesCard
                  series={{ from: flows.from, monthly: flows.monthly, daily: flows.daily }}
                  period={period}
                  currency={cur}
                  asOf={data.asOf}
                  idPrefix="ie-household-"
                />
              )}
            </div>
          )}

          <div className="space-y-1 text-xs text-muted-foreground" data-testid="household-note">
            {totals.included === 0 ? <p>{FAMILY_STRINGS.overview_totals_none}</p> : <p>{FAMILY_STRINGS.overview_kpi_note}</p>}
            {totals.excluded.length > 0 && <p>{excludedText(totals.excluded)}</p>}
            <p>{FAMILY_STRINGS.overview_household_cashflow_note}</p>
            {flows.excluded.length > 0 && <p>{excludedText(flows.excluded, notShared)}</p>}
            <p>{FAMILY_STRINGS.overview_household_dti_note}</p>
            {flows.dtiExcluded.length > 0 && <p>{excludedText(flows.dtiExcluded, notShared)}</p>}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
