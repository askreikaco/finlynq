"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Users } from "lucide-react";
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

const memberLabel = (m: MemberDto) => (m.relation === "me" ? m.name : m.name);

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function OverviewTab({ reloadKey = 0 }: { reloadKey?: number }) {
  const [period, setPeriod] = useState<Period>("month");
  const [selected, setSelected] = useState<string>("all");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [movers, setMovers] = useState<OwnMovers | undefined>(undefined);
  const [lifetimeData, setLifetimeData] = useState<OverviewResponse | null>(null);

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

  // Fetch lifetime data for charts (independent of the time selection)
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/family/overview?${new URLSearchParams({ period: "all" })}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        if (res.ok) {
          const lifetime: OverviewResponse = await res.json();
          if (!ctrl.signal.aborted) setLifetimeData(lifetime);
        }
      } catch {
        // Silently fail for lifetime data fetch - charts will show without it
      }
    })();
    return () => ctrl.abort();
  }, [reloadKey]);

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

  // For charts, use lifetime data if available, otherwise fall back to current data
  const chartData = lifetimeData ?? data;

  return (
    <div className="space-y-6" aria-busy={loading}>
      {/* Sticky filter toolbar */}
      <div className="sticky top-[var(--sat)] z-10 bg-background/95 backdrop-blur -mx-1 px-1 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Time range first (key filter), then icon-only people chips */}
        <div role="radiogroup" aria-label={FAMILY_STRINGS.overview_range_label} className="flex gap-0 bg-muted p-1 rounded-lg w-fit">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              role="radio"
              aria-checked={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={`whitespace-nowrap px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                period === p.value ? "bg-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* People chips (icon-only) */}
        <div
          role="radiogroup"
          aria-label={FAMILY_STRINGS.overview_member_filter_label}
          className="flex min-w-0 gap-2 overflow-x-auto p-0.5"
        >
          <button
            role="radio"
            aria-checked={focus == null}
            aria-label="Everyone"
            title="Everyone"
            onClick={() => setSelected("all")}
            className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              focus == null ? "ring-2 ring-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
          </button>
          {data.members.map((m) => {
            const fullName = memberLabel(m);
            return (
              <button
                key={m.id}
                role="radio"
                aria-checked={focus?.id === m.id}
                aria-label={fullName}
                title={fullName}
                onClick={() => setSelected(m.id)}
                className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  focus?.id === m.id ? "ring-2 ring-primary bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {getInitials(fullName)}
              </button>
            );
          })}
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

      {/* Unified overview section */}
      {focus == null ? (
        <HouseholdBlock data={data} chartData={chartData} period={shownPeriod} />
      ) : (
        <MemberBlock member={focus} data={data} chartData={chartData} period={shownPeriod} movers={focus.relation === "me" ? movers : undefined} />
      )}

      <p className="text-xs text-muted-foreground">
        {fill(FAMILY_STRINGS.overview_converted_note, { currency: cur })}
      </p>

      {data.members.some((m) => m.genericLabels) && (
        <Alert>
          <AlertDescription>{FAMILY_STRINGS.overview_generic_label_hint}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** "All": household figures summed over the members that share the data with complete figures. */
function HouseholdBlock({ data, chartData, period }: { data: OverviewResponse; chartData: OverviewResponse; period: Period }) {
  const totals = computeHousehold(data.members);
  const flows = computeHouseholdFlows(data.members);
  const cur = data.displayCurrency;

  // For charts, use lifetime data
  const chartTotals = computeHousehold(chartData.members);
  const chartFlows = computeHouseholdFlows(chartData.members);

  const excludedText = (list: typeof totals.excluded, notShared = EXCLUDE_TEXT.not_shared) =>
    fill(FAMILY_STRINGS.overview_totals_excluded, {
      members: list
        .map((e) => `${e.name} (${e.reason === "not_shared" ? notShared : EXCLUDE_TEXT[e.reason]})`)
        .join(", "),
    });
  const notShared = FAMILY_STRINGS.overview_card_not_shared.toLowerCase();

  return (
    <section aria-labelledby="family-household-heading" className="space-y-4" data-testid="household">
      <h2 id="family-household-heading" className="sr-only">
        {FAMILY_STRINGS.overview_household_title}
      </h2>

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

      {(chartTotals.included > 0 || chartFlows.included > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {chartTotals.included > 0 && (
            <NetWorthOverTimeCard
              history={chartTotals.history}
              currency={cur}
              period="all"
              name={FAMILY_STRINGS.overview_household_title}
              gradientId="nw-household"
            />
          )}
          {chartFlows.included > 0 && (
            <IncomeVsExpensesCard
              series={{ from: chartFlows.from, monthly: chartFlows.monthly, daily: chartFlows.daily }}
              period="all"
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
    </section>
  );
}

/** Individual member section with lifetime charts */
function MemberBlock({
  member,
  data,
  chartData,
  period,
  movers,
}: {
  member: MemberDto;
  data: OverviewResponse;
  chartData: OverviewResponse;
  period: Period;
  movers?: OwnMovers;
}) {
  const cur = data.displayCurrency;
  const chartMember = chartData.members.find((m) => m.id === member.id) ?? member;

  return (
    <MemberCard
      member={member}
      chartMember={chartMember}
      displayCurrency={cur}
      period={period}
      asOf={data.asOf}
      ownMovers={movers}
    />
  );
}
