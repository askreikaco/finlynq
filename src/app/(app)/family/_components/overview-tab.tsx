"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/currency";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import type { OverviewResponse } from "./types";
import { MfaRequiredCta } from "./mfa-required-cta";
import { MemberCard } from "./member-card";
import { computeHousehold, type ExcludeReason } from "./household";
import { errorMessage } from "./api";
import { fill } from "./section-labels";

type Period = OverviewResponse["period"];

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "6m", label: FAMILY_STRINGS.overview_period_6m },
  { value: "1y", label: FAMILY_STRINGS.overview_period_1y },
  { value: "all", label: FAMILY_STRINGS.overview_period_all },
];

const EXCLUDE_TEXT: Record<ExcludeReason, string> = {
  not_shared: FAMILY_STRINGS.overview_totals_excluded_not_shared,
  partial: FAMILY_STRINGS.overview_totals_excluded_partial,
  unavailable: FAMILY_STRINGS.overview_totals_excluded_unavailable,
};

export function OverviewTab({ reloadKey = 0 }: { reloadKey?: number }) {
  const [period, setPeriod] = useState<Period>("1y");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [data, setData] = useState<OverviewResponse | null>(null);

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

  const totals = computeHousehold(data.members);
  const cur = data.displayCurrency;
  const money = (v: number | null) => (v === null ? FAMILY_STRINGS.overview_none : formatCurrency(v, cur));

  return (
    <div className="space-y-6" aria-busy={loading}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div role="group" aria-label={FAMILY_STRINGS.overview_period_label} className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
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
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={FAMILY_STRINGS.overview_kpi_net_worth} value={money(totals.net)} />
        <KpiCard label={FAMILY_STRINGS.overview_kpi_assets} value={money(totals.assets)} />
        <KpiCard label={FAMILY_STRINGS.overview_kpi_liabilities} value={money(totals.liabilities)} />
        <KpiCard label={FAMILY_STRINGS.overview_kpi_members} value={String(data.members.length)} />
      </div>

      <div className="space-y-1 text-xs text-muted-foreground" data-testid="household-note">
        {totals.included === 0 ? (
          <p>{FAMILY_STRINGS.overview_totals_none}</p>
        ) : (
          <p>{FAMILY_STRINGS.overview_kpi_note}</p>
        )}
        {totals.excluded.length > 0 && (
          <p>
            {fill(FAMILY_STRINGS.overview_totals_excluded, {
              members: totals.excluded.map((e) => `${e.name} (${EXCLUDE_TEXT[e.reason]})`).join(", "),
            })}
          </p>
        )}
        <p>{fill(FAMILY_STRINGS.overview_converted_note, { currency: cur, date: formatDate(data.asOf) })}</p>
      </div>

      {data.members.some((m) => m.genericLabels) && (
        <Alert>
          <AlertDescription>{FAMILY_STRINGS.overview_generic_label_hint}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6">
        {data.members.map((member) => (
          <MemberCard key={member.id} member={member} displayCurrency={cur} />
        ))}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold break-words">{value}</div>
      </CardContent>
    </Card>
  );
}
