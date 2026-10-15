"use client";

import { DevModeGuard } from "@/components/dev-mode-guard";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chart } from "@/components/chart";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Calculator, Coins, Layers, Lightbulb, Percent, PiggyBank } from "lucide-react";
import { ListRow, MetricGrid } from "@/components/mobile";
import { Overlay } from "@/components/ui/overlay";
import { TW } from "@/lib/design/tokens";
import { SectionPage } from "@/components/templates/section-page";
import { Field } from "@/components/ui/field";
import { InfoTip } from "@/components/ui/info-tip";
import { Notice } from "@/components/notice";
import { Card } from "@/components/ui/card";

type TaxData = {
  tfsa: { totalRoom: number; used: number; remaining: number; currentYearLimit: number };
  rrsp: { contributions: { year: number; room: number; used: number }[] };
  resp: { contributions: { year: number; room: number; used: number }[]; grantExample: number };
  assetLocationAdvice: { holding: string; symbol: string; currentAccount: string; recommendedAccountType: string; reason: string }[];
  marginalRates: Record<string, { federal: number; provincial: number; combined: number }>;
};

function TaxPageContent() {
  const { displayCurrency } = useDisplayCurrency();
  const [data, setData] = useState<TaxData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [income, setIncome] = useState("100000");
  const [contribution, setContribution] = useState("10000");
  const [comparison, setComparison] = useState<{ rrspBenefit: number; tfsaBenefit: string; recommendation: string } | null>(null);
  const [openAdvice, setOpenAdvice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tax")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d && typeof d === "object") setData(d as TaxData);
        else setLoadError(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function compareRrspTfsa() {
    const res = await fetch("/api/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rrsp-vs-tfsa", income: parseFloat(income), contribution: parseFloat(contribution) }),
    });
    setComparison(await res.json());
  }

  if (loadError) return <Notice variant="error" title="Couldn't load tax data" retry={() => { setLoadError(false); setReloadKey((k) => k + 1); }}>{"We couldn't load your tax data. Please try again."}</Notice>;

  if (!data) return <Notice variant="skeleton" skeleton="cards" rows={3} />;

  const tfsaPct = data.tfsa.totalRoom > 0 ? (data.tfsa.used / data.tfsa.totalRoom) * 100 : 0;
  const advice = openAdvice !== null ? data.assetLocationAdvice[openAdvice] ?? null : null;

  return (
    <SectionPage
      id="tax"
      title="Tax"
      info="Maximize your tax-advantaged accounts and minimize your tax bill"
      width="report"
      center
    >
      <MetricGrid
        metrics={[
          { icon: PiggyBank, title: "TFSA Room", value: data.tfsa.remaining, currency: displayCurrency, valueTone: "pos", sub: `Used ${Math.round(tfsaPct)}%` },
          { icon: Coins, title: "RESP Grant", value: `${formatCurrency(data.resp.grantExample, displayCurrency)}/yr`, sub: "CESG: 20% on first $2,500/year" },
          { icon: Percent, title: "Marginal Rate @ $100K", value: `${data.marginalRates.at100k.combined}%`, sub: `Federal ${data.marginalRates.at100k.federal}% · Provincial ${data.marginalRates.at100k.provincial}%` },
        ]}
      />

      <div data-slot="tax-cards" className={TW.grid3}>
      <Card title="TFSA" icon={PiggyBank} tone="emerald" padded={false}>
        <div className="space-y-3 pt-3">
          <div className="px-4">
            <Chart kind="progress" value={tfsaPct} ariaLabel="TFSA room used" />
          </div>
          <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            <ListRow title="Used" value={formatCurrency(data.tfsa.used, displayCurrency)} secondary={`${Math.round(tfsaPct)}% of room`} />
            <ListRow title="Total room" value={formatCurrency(data.tfsa.totalRoom, displayCurrency)} />
            <ListRow title="This year's limit" value={formatCurrency(data.tfsa.currentYearLimit, displayCurrency)} />
            <ListRow title="CESG grant (RESP)" value={`${formatCurrency(data.resp.grantExample, displayCurrency)}/yr`} secondary="max $500/yr, $7,200 lifetime" />
          </div>
        </div>
      </Card>

      {/* RRSP vs TFSA Calculator */}
      <Card
        title={
          <>
            RRSP vs TFSA Calculator
            <InfoTip label="About RRSP vs TFSA" text="Compare the tax benefit of contributing to RRSP vs TFSA" />
          </>
        }
        icon={Calculator}
        tone="indigo"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 regular:grid-cols-2 gap-4">
            <Field
              label="Annual Income"
              control="amount"
              value={income}
              onValueChange={(nv) => setIncome(nv)}
              className="mt-1"
            />
            <Field
              label="Contribution Amount"
              control="amount"
              value={contribution}
              onValueChange={(nv) => setContribution(nv)}
              className="mt-1"
            />
          </div>
          <Button onClick={compareRrspTfsa} className="w-full">Compare</Button>
          {comparison && (
            <div className="space-y-3 rounded-xl border border-dashed bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">RRSP Tax Refund</span>
                <span className="text-lg font-bold text-pos tabular-nums">{formatCurrency(comparison.rrspBenefit, displayCurrency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">TFSA Benefit</span>
                <span className="text-sm text-muted-foreground">{comparison.tfsaBenefit}</span>
              </div>
              <div className="flex items-start gap-2 border-t border-border/50 pt-3">
                <Lightbulb className="h-4 w-4 text-warning mt-0.5 shrink-0" aria-hidden />
                <p className="text-sm font-medium">{comparison.recommendation}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Marginal Tax Rates */}
      <Card title="Marginal Tax Rates (Ontario)" icon={Percent} tone="amber" frame="list">
        {Object.entries(data.marginalRates).map(([key, rates]) => (
          <ListRow
            key={key}
            title={key.replace("at", "$").replace("k", ",000")}
            subtitle={`Federal ${rates.federal}% · Provincial ${rates.provincial}%`}
            value={<span className="tabular-nums text-sm font-semibold">{rates.combined}%</span>}
          />
        ))}
      </Card>

      {/* Asset Location Advice: tap a holding for the reason */}
      {data.assetLocationAdvice.length > 0 && (
        <Card title="Asset Location Advice" icon={Layers} tone="violet" frame="list">
          {data.assetLocationAdvice.map((a, i) => (
            <ListRow
              key={`${a.symbol}-${i}`}
              title={a.holding}
              subtitle={`${a.symbol} · ${a.currentAccount} → ${a.recommendedAccountType}`}
              onPress={() => setOpenAdvice(i)}
            />
          ))}
        </Card>
      )}
      </div>

      {advice && (
        <Overlay
          variant="detail"
          open
          onClose={() => setOpenAdvice(null)}
          title={advice.holding}
          subtitle={`${advice.symbol} · asset location`}
          items={[
            { label: "Currently in", value: advice.currentAccount },
            { label: "Recommended account", value: advice.recommendedAccountType },
            { label: "Why", value: advice.reason },
          ]}
        />
      )}
    </SectionPage>
  );
}

export default function TaxPage() { return <DevModeGuard><TaxPageContent /></DevModeGuard>; }
