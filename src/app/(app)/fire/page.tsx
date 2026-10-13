"use client";

import { DevModeGuard } from "@/components/dev-mode-guard";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import { Flame, Dice5 } from "lucide-react";
import { AmountInput } from "@/components/amount-input";
import { ListRow, MetricGrid, SectionCard } from "@/components/mobile";
import { SectionPage } from "@/components/templates/section-page";

type FireResult = {
  fireNumber: number;
  yearsToFire: number;
  fireAge: number;
  fireDate: string;
  coastFireNumber: number;
  coastFireAge: number;
  currentInvestments: number;
  monthlySavings: number;
  projections: { age: number; year: number; netWorth: number; fireNumber: number }[];
  sensitivityTable: { returnRate: number; savings: number; yearsToFire: number }[];
};

type MonteCarloResult = {
  percentilePaths: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  successProbability: number;
  fireNumber: number;
  years: number[];
  finalValues: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
};

function FirePageContent() {
  const { displayCurrency } = useDisplayCurrency();
  const [form, setForm] = useState({
    currentAge: "30",
    targetRetirementAge: "65",
    currentInvestments: "50000",
    monthlySavings: "1500",
    annualReturn: "7",
    inflation: "2",
    annualExpenses: "48000",
    withdrawalRate: "4",
  });
  const [result, setResult] = useState<FireResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);

  // Monte Carlo state
  const [mcVolatility, setMcVolatility] = useState("15");
  const [mcYears, setMcYears] = useState("30");
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [mcLoading, setMcLoading] = useState(false);

  // Sensitivity: which monthly-savings column the list shows (defaults to the current scenario's).
  const [sensChoice, setSensChoice] = useState<string | null>(null);

  // Try to pull defaults from dashboard
  useEffect(() => {
    async function loadDefaults() {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) return;
        const data = await res.json();

        // Sum investment account balances
        const investmentBalance = (data.balances ?? [])
          .filter((b: { accountType: string; invisible?: boolean }) => b.accountType === "I" && !b.invisible)
          .reduce((s: number, b: { balance: number }) => s + b.balance, 0);

        // Get recent income/expenses
        const incomeExpenses = data.incomeVsExpenses ?? [];
        const recentMonths = incomeExpenses.slice(-6);
        let avgMonthlyIncome = 0;
        let avgMonthlyExpenses = 0;
        const incomeMonths = recentMonths.filter((r: { type: string }) => r.type === "I");
        const expenseMonths = recentMonths.filter((r: { type: string }) => r.type === "E");
        if (incomeMonths.length > 0) {
          avgMonthlyIncome = incomeMonths.reduce((s: number, r: { total: number }) => s + Math.abs(r.total), 0) / incomeMonths.length;
        }
        if (expenseMonths.length > 0) {
          avgMonthlyExpenses = expenseMonths.reduce((s: number, r: { total: number }) => s + Math.abs(r.total), 0) / expenseMonths.length;
        }

        const monthlySavings = avgMonthlyIncome - avgMonthlyExpenses;

        setForm((prev) => ({
          ...prev,
          currentInvestments: investmentBalance > 0 ? String(Math.round(investmentBalance)) : prev.currentInvestments,
          monthlySavings: monthlySavings > 0 ? String(Math.round(monthlySavings)) : prev.monthlySavings,
          annualExpenses: avgMonthlyExpenses > 0 ? String(Math.round(avgMonthlyExpenses * 12)) : prev.annualExpenses,
        }));
        setDashboardLoaded(true);
      } catch {
        // Silently fail — use defaults
      }
    }
    loadDefaults();
  }, []);

  async function calculate() {
    setLoading(true);
    const res = await fetch("/api/fire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentAge: parseInt(form.currentAge),
        targetRetirementAge: parseInt(form.targetRetirementAge),
        currentInvestments: parseFloat(form.currentInvestments),
        monthlySavings: parseFloat(form.monthlySavings),
        annualReturn: parseFloat(form.annualReturn),
        inflation: parseFloat(form.inflation),
        annualExpenses: parseFloat(form.annualExpenses),
        withdrawalRate: parseFloat(form.withdrawalRate),
      }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  async function runMonteCarlo() {
    setMcLoading(true);
    try {
      const res = await fetch("/api/fire/monte-carlo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentInvestments: parseFloat(form.currentInvestments),
          monthlySavings: parseFloat(form.monthlySavings),
          annualReturn: parseFloat(form.annualReturn),
          annualVolatility: parseFloat(mcVolatility),
          inflation: parseFloat(form.inflation),
          yearsToSimulate: parseInt(mcYears),
          withdrawalRate: parseFloat(form.withdrawalRate),
          annualExpenses: parseFloat(form.annualExpenses),
        }),
      });
      setMcResult(await res.json());
    } catch {
      // Silently fail
    }
    setMcLoading(false);
  }

  // Sensitivity: one list of return rates for the chosen monthly-savings amount.
  const returnRates = [5, 6, 7, 8, 9];
  const savingsAdj = result
    ? [...new Set(result.sensitivityTable.map((s) => s.savings))].sort((a, b) => a - b)
    : [];
  const currentSavings = parseFloat(form.monthlySavings);
  const selectedSavings =
    sensChoice != null && savingsAdj.includes(Number(sensChoice))
      ? Number(sensChoice)
      : savingsAdj.find((s) => s === currentSavings) ?? savingsAdj[0];

  // Build Monte Carlo fan chart data
  const mcChartData = mcResult
    ? mcResult.years.map((year, i) => ({
        year,
        p10: mcResult.percentilePaths.p10[i],
        p25: mcResult.percentilePaths.p25[i],
        p50: mcResult.percentilePaths.p50[i],
        p75: mcResult.percentilePaths.p75[i],
        p90: mcResult.percentilePaths.p90[i],
      }))
    : [];

  // Compact money for the percentile tiles (millions as $x.xM).
  const fmtMoney = (v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : formatCurrency(v, displayCurrency));

  return (
    <SectionPage
      id="fire"
      title={<><Flame className="h-6 w-6 text-warning" /> FIRE Calculator</>}
      subtitle="Calculate your Financial Independence, Retire Early number and timeline"
      width="report"
      center
    >
      {dashboardLoaded && (
        <p className="text-xs text-pos">Some values pre-filled from your dashboard data.</p>
      )}

      {/* Inputs */}
      <SectionCard label="Your details">
        <div className="space-y-4">
          <div className="grid grid-cols-1 regular:grid-cols-2 gap-4">
            <div>
              <Label>Current Age</Label>
              <Input type="number" value={form.currentAge} onChange={(e) => setForm({ ...form, currentAge: e.target.value })} />
            </div>
            <div>
              <Label>Target Retirement Age</Label>
              <Input type="number" value={form.targetRetirementAge} onChange={(e) => setForm({ ...form, targetRetirementAge: e.target.value })} />
            </div>
            <div>
              <Label>Current Investments ($)</Label>
              <AmountInput  value={form.currentInvestments} onValueChange={(nv) => setForm({ ...form, currentInvestments: nv })} />
            </div>
            <div>
              <Label>Monthly Savings ($)</Label>
              <AmountInput  value={form.monthlySavings} onValueChange={(nv) => setForm({ ...form, monthlySavings: nv })} />
            </div>
            <div>
              <Label>Annual Return (%)</Label>
              <AmountInput  step="0.5" value={form.annualReturn} onValueChange={(nv) => setForm({ ...form, annualReturn: nv })} />
            </div>
            <div>
              <Label>Inflation (%)</Label>
              <AmountInput  step="0.5" value={form.inflation} onValueChange={(nv) => setForm({ ...form, inflation: nv })} />
            </div>
            <div>
              <Label>Annual Expenses in Retirement ($)</Label>
              <AmountInput  value={form.annualExpenses} onValueChange={(nv) => setForm({ ...form, annualExpenses: nv })} />
            </div>
            <div>
              <Label>Safe Withdrawal Rate (%)</Label>
              <AmountInput  step="0.25" value={form.withdrawalRate} onValueChange={(nv) => setForm({ ...form, withdrawalRate: nv })} />
            </div>
          </div>
          <Button onClick={calculate} disabled={loading} className="w-full">
            <Flame className="h-4 w-4 mr-1" /> {loading ? "Calculating..." : "Calculate FIRE"}
          </Button>
        </div>
      </SectionCard>

      {/* Results */}
      {result ? (
        <>
          <MetricGrid
            metrics={[
              { label: "FIRE Number", value: result.fireNumber, currency: displayCurrency },
              { label: "Years to FIRE", text: `${result.yearsToFire} years` },
              { label: "FIRE Age", text: `Age ${result.fireAge}` },
              { label: "Projected FIRE Date", text: result.fireDate },
              { label: "Coast FIRE Number", value: result.coastFireNumber, currency: displayCurrency },
              { label: "Coast FIRE Age", text: `Age ${result.coastFireAge}` },
            ]}
          />

          {/* Coast FIRE explanation */}
          <SectionCard className="bg-pos/10 border-pos/30">
            <p className="text-sm text-pos">
              <strong>Coast FIRE:</strong> If you already have {formatCurrency(result.coastFireNumber, displayCurrency)} invested,
              you could stop saving entirely and still reach your FIRE number by age {parseInt(form.targetRetirementAge)} through investment growth alone.
              At your current savings rate, you will reach Coast FIRE at age {result.coastFireAge}.
            </p>
          </SectionCard>

          {/* Net Worth Projection Chart */}
          <SectionCard label="Projected net worth vs FIRE number">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={result.projections}>
                <XAxis dataKey="age" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}`} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v), displayCurrency)}
                  labelFormatter={(label) => `Age ${label}`}
                />
                <Legend />
                <ReferenceLine
                  y={result.fireNumber}
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  label={{ value: `FIRE: ${formatCurrency(result.fireNumber, displayCurrency)}`, position: "insideTopRight", fill: "#f97316", fontSize: 12 }}
                />
                {result.fireAge <= parseInt(form.targetRetirementAge) + 10 && (
                  <ReferenceLine
                    x={result.fireAge}
                    stroke="#10b981"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    label={{ value: `FIRE Age ${result.fireAge}`, position: "top", fill: "#10b981", fontSize: 11 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.15}
                  strokeWidth={2}
                  name="Projected Net Worth"
                />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>

          {/* Monte Carlo Analysis */}
          <SectionCard label="Monte Carlo analysis">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Dice5 className="h-5 w-5 text-chart-5" aria-hidden />
                  <p className="text-xs text-muted-foreground">1,000 simulations with random market returns to stress-test your plan</p>
                </div>
                {mcResult && (
                  <Badge
                    variant="outline"
                    className={`text-sm font-mono ${
                      mcResult.successProbability >= 80
                        ? "bg-pos/10 text-pos border-pos/30"
                        : mcResult.successProbability >= 50
                        ? "bg-warning/10 text-warning border-warning/30"
                        : "bg-destructive/10 text-destructive border-destructive/30"
                    }`}
                  >
                    {mcResult.successProbability}% success
                  </Badge>
                )}
              </div>

              {/* Monte Carlo parameters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Volatility (%)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="5"
                    max="40"
                    value={mcVolatility}
                    onChange={(e) => setMcVolatility(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Years to Simulate</Label>
                  <Input
                    type="number"
                    step="5"
                    min="10"
                    max="60"
                    value={mcYears}
                    onChange={(e) => setMcYears(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={runMonteCarlo} disabled={mcLoading} variant="outline" className="w-full">
                <Dice5 className="h-3.5 w-3.5 mr-1" />
                {mcLoading ? "Running..." : "Run Simulation"}
              </Button>

              {mcResult && (
                <>
                  {/* Fan chart with percentile bands */}
                  <ResponsiveContainer width="100%" height={320}>
                    <AreaChart data={mcChartData}>
                      <XAxis
                        dataKey="year"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `Yr ${v}`}
                      />
                      <YAxis
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                          return `$${(v / 1000).toFixed(0)}k`;
                        }}
                      />
                      <Tooltip
                        formatter={(v) => formatCurrency(Number(v), displayCurrency)}
                        labelFormatter={(label) => `Year ${label}`}
                      />
                      <Legend />
                      <ReferenceLine
                        y={mcResult.fireNumber}
                        stroke="#f97316"
                        strokeWidth={2}
                        strokeDasharray="8 4"
                        label={{ value: "FIRE Target", position: "insideTopRight", fill: "#f97316", fontSize: 11 }}
                      />
                      {/* p10-p90 band (lightest) */}
                      <Area
                        type="monotone"
                        dataKey="p90"
                        stroke="none"
                        fill="#6366f1"
                        fillOpacity={0.08}
                        name="90th Percentile"
                        stackId="band"
                      />
                      <Area
                        type="monotone"
                        dataKey="p10"
                        stroke="none"
                        fill="transparent"
                        name="10th Percentile"
                      />
                      {/* p25-p75 band (medium) */}
                      <Area
                        type="monotone"
                        dataKey="p75"
                        stroke="none"
                        fill="#6366f1"
                        fillOpacity={0.15}
                        name="75th Percentile"
                      />
                      <Area
                        type="monotone"
                        dataKey="p25"
                        stroke="none"
                        fill="#6366f1"
                        fillOpacity={0.08}
                        name="25th Percentile"
                      />
                      {/* Median line */}
                      <Area
                        type="monotone"
                        dataKey="p50"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        fill="#6366f1"
                        fillOpacity={0.05}
                        name="Median (50th)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>

                  {/* Final value percentiles */}
                  <MetricGrid
                    metrics={[
                      { label: "Worst case (P10)", text: fmtMoney(mcResult.finalValues.p10) },
                      { label: "P25", text: fmtMoney(mcResult.finalValues.p25) },
                      { label: "Median (P50)", text: fmtMoney(mcResult.finalValues.p50) },
                      { label: "P75", text: fmtMoney(mcResult.finalValues.p75) },
                      { label: "Best case (P90)", text: fmtMoney(mcResult.finalValues.p90) },
                    ]}
                  />
                </>
              )}

              {!mcResult && !mcLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <Dice5 className="h-8 w-8 mx-auto mb-2 opacity-30" aria-hidden />
                  <p className="text-sm">Click &quot;Run Simulation&quot; to see probabilistic outcomes</p>
                  <p className="text-xs mt-1">Uses 1,000 random market scenarios based on your parameters</p>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Sensitivity: years to FIRE by return rate, for one monthly-savings amount */}
          <SectionCard label="Sensitivity analysis: years to FIRE" className="space-y-3">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">How different return rates and savings amounts affect your timeline</p>
              {savingsAdj.length > 0 && (
                <Select value={String(selectedSavings)} onValueChange={(v) => setSensChoice(v)}>
                  <SelectTrigger className="w-full" aria-label="Monthly savings">
                    <SelectValue>{(v: unknown) => `${formatCurrency(Number(v), displayCurrency)}/mo`}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {savingsAdj.map((s) => (
                      <SelectItem key={s} value={String(s)}>{formatCurrency(s, displayCurrency)}/mo</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="divide-y divide-border/50">
                {returnRates.map((rr) => {
                  const entry = result.sensitivityTable.find((e) => e.returnRate === rr && e.savings === selectedSavings);
                  const years = entry?.yearsToFire ?? -1;
                  const isCurrentScenario = rr === parseFloat(form.annualReturn) && selectedSavings === currentSavings;
                  const tone = isCurrentScenario
                    ? "text-primary"
                    : years === -1
                    ? "text-muted-foreground"
                    : years <= result.yearsToFire
                    ? "text-pos"
                    : "text-warning";
                  return (
                    <ListRow
                      key={rr}
                      title={`${rr}% annual return`}
                      subtitle={isCurrentScenario ? "Your scenario" : undefined}
                      value={<span className={`tabular-nums text-sm font-semibold ${tone}`}>{years === -1 ? "50+" : `${years} yr`}</span>}
                    />
                  );
                })}
              </div>
            </div>
          </SectionCard>
        </>
      ) : (
        <SectionCard>
          <div className="py-12 text-center">
            <Flame className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" aria-hidden />
            <p className="text-muted-foreground">Enter your details and click Calculate FIRE</p>
            <p className="text-xs text-muted-foreground mt-1">to see your path to financial independence</p>
          </div>
        </SectionCard>
      )}
    </SectionPage>
  );
}

export default function FirePage() { return <DevModeGuard><FirePageContent /></DevModeGuard>; }
