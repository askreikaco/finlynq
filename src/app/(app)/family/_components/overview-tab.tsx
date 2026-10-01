"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { FAMILY_STRINGS } from "@/lib/family/strings";
import { MfaRequiredCta } from "./mfa-required-cta";
import { MemberCard } from "./member-card";

interface NetWorthSection {
  assets: number;
  liabilities: number;
  net: number;
  history: Array<{ date: string; value: number }>;
  historyFxApproximation: boolean;
}

interface MemberDto {
  id: string;
  relation: "me" | "shared";
  name: string;
  sections: {
    net_worth?: NetWorthSection;
    [key: string]: unknown;
  };
  notShared: string[];
  unavailable: string[];
  partial: boolean;
  partialReasons: string[];
  genericLabels: boolean;
  error?: string;
}

interface OverviewResponse {
  displayCurrency: string;
  period: "6m" | "1y" | "all";
  asOf: string;
  partial: boolean;
  members: MemberDto[];
}

type Period = "6m" | "1y" | "all";

export function OverviewTab() {
  // useDisplayCurrency is used via data.displayCurrency from API
  useDisplayCurrency();
  const [period, setPeriod] = useState<Period>("1y");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [data, setData] = useState<OverviewResponse | null>(null);

  useEffect(() => {
    async function fetchOverview() {
      try {
        setLoading(true);
        setError(null);
        setMfaRequired(false);

        const params = new URLSearchParams({ period });
        const res = await fetch(`/api/family/overview?${params}`, {
          method: "GET",
          credentials: "include",
        });

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if (body.error === "mfa_required") {
            setMfaRequired(true);
            return;
          }
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const overview: OverviewResponse = await res.json();
        setData(overview);
      } catch (err) {
        console.error("[family overview]", err);
        setError(FAMILY_STRINGS.error_loading_data);
      } finally {
        setLoading(false);
      }
    }

    fetchOverview();
  }, [period]);

  if (mfaRequired) {
    return <MfaRequiredCta />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/5">
        <CardContent className="pt-6 flex gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Try again
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
          <p className="text-muted-foreground">{FAMILY_STRINGS.sharing_outgoing_empty}</p>
        </CardContent>
      </Card>
    );
  }

  // Calculate total net worth from all members
  const totalNetWorth = data.members.reduce((sum, member) => {
    return sum + (member.sections.net_worth?.net ?? 0);
  }, 0);

  const totalAssets = data.members.reduce((sum, member) => {
    return sum + (member.sections.net_worth?.assets ?? 0);
  }, 0);

  const totalLiabilities = data.members.reduce((sum, member) => {
    return sum + (member.sections.net_worth?.liabilities ?? 0);
  }, 0);

  const rateDate = new Date(data.asOf).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Period selector and warnings */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <label htmlFor="period" className="text-sm font-medium">
            Period
          </label>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger id="period" className="w-48 mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6m">{FAMILY_STRINGS.overview_period_6m}</SelectItem>
              <SelectItem value="1y">{FAMILY_STRINGS.overview_period_1y}</SelectItem>
              <SelectItem value="all">{FAMILY_STRINGS.overview_period_all}</SelectItem>
            </SelectContent>
          </Select>
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

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label={FAMILY_STRINGS.overview_kpi_net_worth} value={totalNetWorth} currency={data.displayCurrency} />
        <KpiCard label={FAMILY_STRINGS.overview_kpi_assets} value={totalAssets} currency={data.displayCurrency} />
        <KpiCard label={FAMILY_STRINGS.overview_kpi_liabilities} value={totalLiabilities} currency={data.displayCurrency} />
        <KpiCard label={FAMILY_STRINGS.overview_kpi_members} value={data.members.length} isCount />
      </div>

      {/* Generic label hint */}
      {data.members.some((m) => m.genericLabels) && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6 flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-900">{FAMILY_STRINGS.overview_generic_label_hint}</p>
          </CardContent>
        </Card>
      )}

      {/* Conversion note */}
      <div className="text-xs text-muted-foreground">
        {FAMILY_STRINGS.overview_converted_note
          .replace("{currency}", data.displayCurrency)
          .replace("{date}", rateDate)}
      </div>

      {/* Member cards */}
      <div className="grid gap-6">
        {data.members.map((member) => (
          <MemberCard key={member.id} member={member} displayCurrency={data.displayCurrency} />
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  currency,
  isCount = false,
}: {
  label: string;
  value: number;
  currency?: string;
  isCount?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {isCount ? value : formatCurrency(value, currency)}
        </div>
      </CardContent>
    </Card>
  );
}
