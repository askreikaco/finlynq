"use client";

import { DevModeGuard } from "@/components/dev-mode-guard";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Chart } from "@/components/chart";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import { Calculator, Coins, Layers, Lightbulb, Percent, PiggyBank } from "lucide-react";
import { AmountInput } from "@/components/amount-input";
import { DetailSheet, ListRow, MetricGrid, SectionCard } from "@/components/mobile";
import { TW } from "@/lib/design/tokens";
import { SectionPage } from "@/components/templates/section-page";
import { Notice } from "@/components/notice";

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
          { icon: PiggyBank, label: "TFSA Room", value: data.tfsa.remaining, currency: displayCurrency, tone: "pos", sub: `Used ${Math.round(tfsaPct)}%` },
          { icon: Coins, label: "RESP Grant", value: `${formatCurrency(data.resp.grantExample, displayCurrency)}/yr`, sub: "CESG: 20% on first $2,500/year" },
          { icon: Percent, label: "Marginal Rate @ $100K", value: `${data.marginalRates.at100k.combined}%`, sub: `Federal ${data.marginalRates.at100k.federal}% · Provincial ${data.marginalRates.at100k.provincial}%` },
        ]}
      />

      <div data-slot="tax-cards" className={TW.grid3}>
      <SectionCard label="TFSA" icon={PiggyBank} tone="emerald" padded={false} className="px-3">
        <div className="space-y-3 pt-3">
          <div className="px-1">
            <Chart kind="progress" value={tfsaPct} ariaLabel="TFSA room used" />
          </div>
          <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
            <ListRow title="Used" value={formatCurrency(data.tfsa.used, displayCurrency)} secondary={`${Math.round(tfsaPct)}% of room`} />
            <ListRow title="Total room" value={formatCurrency(data.tfsa.totalRoom, displayCurrency)} />
            <ListRow title="This year's limit" value={formatCurrency(data.tfsa.currentYearLimit, displayCurrency)} />
            <ListRow title="CESG grant (RESP)" value={`${formatCurrency(data.resp.grantExample, displayCurrency)}/yr`} secondary="max $500/yr, $7,200 lifetime" />
          </div>
        </div>
      </SectionCard>

      {/* RRSP vs TFSA Calculator */}
      <SectionCard label="RRSP vs TFSA Calculator" icon={Calculator} tone="indigo">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Compare the tax benefit of contributing to RRSP vs TFSA</p>
          <div className="grid grid-cols-1 regular:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Annual Income</Label>
              <AmountInput value={income} onValueChange={(nv) => setIncome(nv)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Contribution Amount</Label>
              <AmountInput value={contribution} onValueChange={(nv) => setContribution(nv)} className="mt-1" />
            </div>
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
      </SectionCard>

      {/* Marginal Tax Rates */}
      <SectionCard label="Marginal Tax Rates (Ontario)" icon={Percent} tone="amber" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] px-3">
        {Object.entries(data.marginalRates).map(([key, rates]) => (
          <ListRow
            key={key}
            title={key.replace("at", "$").replace("k", ",000")}
            subtitle={`Federal ${rates.federal}% · Provincial ${rates.provincial}%`}
            value={<span className="tabular-nums text-sm font-semibold">{rates.combined}%</span>}
          />
        ))}
      </SectionCard>

      {/* Asset Location Advice: tap a holding for the reason */}
      {data.assetLocationAdvice.length > 0 && (
        <SectionCard label="Asset Location Advice" icon={Layers} tone="violet" padded={false} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)] px-3">
          {data.assetLocationAdvice.map((a, i) => (
            <ListRow
              key={`${a.symbol}-${i}`}
              title={a.holding}
              subtitle={`${a.symbol} · ${a.currentAccount} → ${a.recommendedAccountType}`}
              onPress={() => setOpenAdvice(i)}
            />
          ))}
        </SectionCard>
      )}
      </div>

      {advice && (
        <DetailSheet
          open
          onOpenChange={(o) => { if (!o) setOpenAdvice(null); }}
          title={advice.holding}
          description={`${advice.symbol} · asset location`}
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
