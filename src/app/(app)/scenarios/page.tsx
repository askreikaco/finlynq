"use client";

import { DevModeGuard } from "@/components/dev-mode-guard";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/currency";
import { useDisplayCurrency } from "@/components/currency-provider";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, Legend,
} from "recharts";
import { Calculator } from "lucide-react";
import { AmountInput } from "@/components/amount-input";
import { Amount, ListRow, MetricGrid, SectionCard } from "@/components/mobile";
import { SectionPage } from "@/components/templates/section-page";

// --- Types ---
type HomePurchaseResult = {
  downPayment: number; principal: number; monthlyPayment: number;
  totalInterest: number; totalPayments: number; monthlyCashFlow: number;
  monthlyPropertyTax: number; monthlyMaintenance: number;
  balanceOverTime: { year: number; balance: number; equity: number }[];
};

type ExtraSavingsResult = {
  futureValue: number; totalContributions: number; totalGrowth: number;
  projections: { year: number; contributions: number; growth: number; total: number }[];
};

type DebtStrategy = { strategy: string; totalInterest: number; totalMonths: number; order: { name: string; paidOffMonth: number }[] };

type DebtPayoffResult = {
  avalanche: DebtStrategy;
  snowball: DebtStrategy;
  avalancheTimeline: { month: number; totalDebt: number }[];
  snowballTimeline: { month: number; totalDebt: number }[];
};

type IncomeChangeResult = {
  current: { annualIncome: number; annualTax: number; monthlyNet: number; monthlySavings: number; savingsRate: number };
  new: { annualIncome: number; annualTax: number; monthlyNet: number; monthlySavings: number; savingsRate: number };
  difference: { annualIncome: number; annualTax: number; monthlyNet: number; monthlySavings: number };
};

type Loan = {
  id: number; name: string; principal: number; annualRate: number;
  termMonths: number; remainingBalance: number; monthlyPayment: number;
};

// --- Helpers ---
/** Empty state for a calculator tab that has no result yet. */
function Placeholder({ text }: { text: string }) {
  return (
    <SectionCard>
      <p className="py-12 text-center text-sm text-muted-foreground">{text}</p>
    </SectionCard>
  );
}

/** Two-column form on the regular breakpoint and up, one column on phones. */
const FORM_GRID = "grid grid-cols-1 regular:grid-cols-2 gap-4";

// ===== HOME PURCHASE TAB =====
function HomePurchaseTab() {
  const { displayCurrency } = useDisplayCurrency();
  const [form, setForm] = useState({
    purchasePrice: "500000", downPaymentPct: "20", interestRate: "5.5",
    amortizationYears: "25", propertyTaxYear: "4000", maintenanceYear: "3000",
  });
  const [result, setResult] = useState<HomePurchaseResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    const res = await fetch("/api/scenarios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "home-purchase",
        purchasePrice: parseFloat(form.purchasePrice),
        downPaymentPct: parseFloat(form.downPaymentPct),
        interestRate: parseFloat(form.interestRate),
        amortizationYears: parseInt(form.amortizationYears),
        propertyTaxYear: parseFloat(form.propertyTaxYear),
        maintenanceYear: parseFloat(form.maintenanceYear),
      }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <SectionCard label="Purchase details">
        <div className="space-y-4">
          <div className={FORM_GRID}>
            <div><Label>Purchase Price ($)</Label><AmountInput  value={form.purchasePrice} onValueChange={(nv) => setForm({ ...form, purchasePrice: nv })} /></div>
            <div><Label>Down Payment (%)</Label><AmountInput  value={form.downPaymentPct} onValueChange={(nv) => setForm({ ...form, downPaymentPct: nv })} /></div>
            <div><Label>Interest Rate (%)</Label><AmountInput  step="0.1" value={form.interestRate} onValueChange={(nv) => setForm({ ...form, interestRate: nv })} /></div>
            <div><Label>Amortization (years)</Label><Input type="number" value={form.amortizationYears} onChange={(e) => setForm({ ...form, amortizationYears: e.target.value })} /></div>
            <div><Label>Property Tax / Year ($)</Label><AmountInput  value={form.propertyTaxYear} onValueChange={(nv) => setForm({ ...form, propertyTaxYear: nv })} /></div>
            <div><Label>Maintenance / Year ($)</Label><AmountInput  value={form.maintenanceYear} onValueChange={(nv) => setForm({ ...form, maintenanceYear: nv })} /></div>
          </div>
          <Button onClick={calculate} disabled={loading} className="w-full">
            <Calculator className="h-4 w-4 mr-1" /> {loading ? "Calculating..." : "Calculate"}
          </Button>
        </div>
      </SectionCard>

      {result ? (
        <>
          <MetricGrid
            metrics={[
              { label: "Monthly Mortgage", value: result.monthlyPayment, currency: displayCurrency },
              { label: "Total Monthly Cost", value: result.monthlyCashFlow, currency: displayCurrency, tone: "neg" },
              { label: "Down Payment", value: result.downPayment, currency: displayCurrency },
              { label: "Total Interest", value: result.totalInterest, currency: displayCurrency, tone: "neg" },
            ]}
          />
          <SectionCard label="Mortgage balance over time">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={result.balanceOverTime}>
                <XAxis dataKey="year" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `Yr ${v}`} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v), displayCurrency)} />
                <Legend />
                <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={false} name="Remaining Balance" />
                <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} name="Equity" />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
          <MetricGrid
            metrics={[
              { label: "Monthly Property Tax", value: result.monthlyPropertyTax, currency: displayCurrency },
              { label: "Monthly Maintenance", value: result.monthlyMaintenance, currency: displayCurrency },
              { label: "Total Payments", value: result.totalPayments, currency: displayCurrency },
            ]}
          />
        </>
      ) : (
        <Placeholder text="Enter purchase details and click Calculate" />
      )}
    </div>
  );
}

// ===== EXTRA SAVINGS TAB =====
function ExtraSavingsTab() {
  const { displayCurrency } = useDisplayCurrency();
  const [form, setForm] = useState({ monthlySavings: "500", returnRate: "7", years: "20" });
  const [result, setResult] = useState<ExtraSavingsResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    const res = await fetch("/api/scenarios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "extra-savings",
        monthlySavings: parseFloat(form.monthlySavings),
        returnRate: parseFloat(form.returnRate),
        years: parseInt(form.years),
      }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <SectionCard label="Savings details">
        <div className="space-y-4">
          <div className={FORM_GRID}>
            <div><Label>Additional Monthly Savings ($)</Label><AmountInput  value={form.monthlySavings} onValueChange={(nv) => setForm({ ...form, monthlySavings: nv })} /></div>
            <div><Label>Expected Annual Return (%)</Label><AmountInput  step="0.5" value={form.returnRate} onValueChange={(nv) => setForm({ ...form, returnRate: nv })} /></div>
            <div><Label>Time Horizon (years)</Label><Input type="number" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} /></div>
          </div>
          <Button onClick={calculate} disabled={loading} className="w-full">
            <Calculator className="h-4 w-4 mr-1" /> {loading ? "Calculating..." : "Calculate"}
          </Button>
        </div>
      </SectionCard>

      {result ? (
        <>
          <MetricGrid
            metrics={[
              { label: "Future Value", value: result.futureValue, currency: displayCurrency, tone: "pos" },
              { label: "Total Contributed", value: result.totalContributions, currency: displayCurrency },
              { label: "Investment Growth", value: result.totalGrowth, currency: displayCurrency },
            ]}
          />
          <SectionCard label="Growth over time">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={result.projections}>
                <XAxis dataKey="year" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `Yr ${v}`} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v), displayCurrency)} />
                <Legend />
                <Area type="monotone" dataKey="contributions" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} name="Contributions" />
                <Area type="monotone" dataKey="growth" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Investment Growth" />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>
        </>
      ) : (
        <Placeholder text="Enter savings details and click Calculate" />
      )}
    </div>
  );
}

/** One payoff strategy: totals as tiles, then the order the debts are cleared in. */
function StrategyCard({ title, hint, data, currency }: { title: string; hint: string; data: DebtStrategy; currency: string }) {
  return (
    <SectionCard label={`${title} · ${hint}`}>
      <div className="space-y-4">
        <MetricGrid
          metrics={[
            { label: "Total Interest", value: data.totalInterest, currency, tone: "neg" },
            { label: "Months to Debt-Free", text: String(data.totalMonths) },
          ]}
        />
        <div className="divide-y divide-border/50">
          {data.order.map((o, i) => (
            <ListRow key={`${o.name}-${i}`} title={`${i + 1}. ${o.name}`} subtitle={`Paid off in month ${o.paidOffMonth}`} />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// ===== DEBT PAYOFF TAB =====
function DebtPayoffTab() {
  const { displayCurrency } = useDisplayCurrency();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [extraBudget, setExtraBudget] = useState("200");
  const [result, setResult] = useState<DebtPayoffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loansLoading, setLoansLoading] = useState(true);

  useEffect(() => {
    fetch("/api/loans")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLoans(data);
        setLoansLoading(false);
      })
      .catch(() => setLoansLoading(false));
  }, []);

  async function calculate() {
    if (loans.length === 0) return;
    setLoading(true);
    const debts = loans.map((l) => ({
      id: l.id,
      name: l.name,
      balance: l.remainingBalance,
      rate: l.annualRate,
      minPayment: l.monthlyPayment,
    }));
    const res = await fetch("/api/scenarios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "debt-payoff", debts, extraBudget: parseFloat(extraBudget) || 0 }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  // Merge timelines for chart
  const chartData = result ? (() => {
    const maxMonth = Math.max(
      result.avalancheTimeline[result.avalancheTimeline.length - 1]?.month ?? 0,
      result.snowballTimeline[result.snowballTimeline.length - 1]?.month ?? 0,
    );
    const avMap = new Map(result.avalancheTimeline.map((r) => [r.month, r.totalDebt]));
    const snMap = new Map(result.snowballTimeline.map((r) => [r.month, r.totalDebt]));
    const step = Math.max(1, Math.floor(maxMonth / 60));
    const data: { month: number; avalanche: number; snowball: number }[] = [];
    for (let m = 0; m <= maxMonth; m += step) {
      data.push({
        month: m,
        avalanche: avMap.get(m) ?? (avMap.get(m - 1) ?? 0),
        snowball: snMap.get(m) ?? (snMap.get(m - 1) ?? 0),
      });
    }
    return data;
  })() : [];

  return (
    <div className="space-y-4">
      <SectionCard label="Your debts">
        {loansLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-shimmer rounded" />
            ))}
          </div>
        ) : loans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No loans found. Add loans on the Loans page first.</p>
        ) : (
          <div className="space-y-4">
            <div className="divide-y divide-border/50">
              {loans.map((l) => (
                <ListRow
                  key={l.id}
                  title={l.name}
                  subtitle={`${l.annualRate}% · min ${formatCurrency(l.monthlyPayment, displayCurrency)} / mo`}
                  value={<Amount value={l.remainingBalance} currency={displayCurrency} size="md" tone="none" />}
                />
              ))}
            </div>
            <div>
              <Label>Extra Monthly Budget ($)</Label>
              <AmountInput  value={extraBudget} onValueChange={(nv) => setExtraBudget(nv)} />
            </div>
            <Button onClick={calculate} disabled={loading} className="w-full">
              <Calculator className="h-4 w-4 mr-1" /> {loading ? "Calculating..." : "Compare Strategies"}
            </Button>
          </div>
        )}
      </SectionCard>

      {result ? (
        <>
          <StrategyCard title="Avalanche" hint="Highest rate first" data={result.avalanche} currency={displayCurrency} />
          <StrategyCard title="Snowball" hint="Lowest balance first" data={result.snowball} currency={displayCurrency} />

          {result.avalanche.totalInterest !== result.snowball.totalInterest && (
            <SectionCard className="bg-pos/10 border-pos/30">
              <p className="text-sm text-pos">
                {result.avalanche.totalInterest < result.snowball.totalInterest
                  ? `Avalanche saves you ${formatCurrency(result.snowball.totalInterest - result.avalanche.totalInterest, displayCurrency)} in interest and ${result.snowball.totalMonths - result.avalanche.totalMonths} months.`
                  : `Snowball saves you ${formatCurrency(result.avalanche.totalInterest - result.snowball.totalInterest, displayCurrency)} in interest.`}
              </p>
            </SectionCard>
          )}

          <SectionCard label="Total debt over time">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `Mo ${v}`} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v), displayCurrency)} />
                <Legend />
                <Line type="monotone" dataKey="avalanche" stroke="#6366f1" strokeWidth={2} dot={false} name="Avalanche" />
                <Line type="monotone" dataKey="snowball" stroke="#f59e0b" strokeWidth={2} dot={false} name="Snowball" />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>
        </>
      ) : (
        loans.length > 0 && <Placeholder text="Click Compare Strategies to see results" />
      )}
    </div>
  );
}

/** One side of the income comparison: the figures for that income. */
function IncomeSide({ label, data, currency }: { label: string; data: IncomeChangeResult["current"]; currency: string }) {
  return (
    <SectionCard label={label}>
      <MetricGrid
        metrics={[
          { label: "Annual Income", value: data.annualIncome, currency },
          { label: "Monthly Take-Home", value: data.monthlyNet, currency },
          { label: "Monthly Savings", value: data.monthlySavings, currency },
          { label: "Savings Rate", text: `${data.savingsRate}%` },
        ]}
      />
    </SectionCard>
  );
}

// ===== INCOME CHANGE TAB =====
function IncomeChangeTab() {
  const { displayCurrency } = useDisplayCurrency();
  const [form, setForm] = useState({ currentIncome: "70000", newIncome: "85000", currentSavingsRate: "20" });
  const [result, setResult] = useState<IncomeChangeResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function calculate() {
    setLoading(true);
    const res = await fetch("/api/scenarios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "income-change",
        currentIncome: parseFloat(form.currentIncome),
        newIncome: parseFloat(form.newIncome),
        currentSavingsRate: parseFloat(form.currentSavingsRate),
      }),
    });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <SectionCard label="Income details">
        <div className="space-y-4">
          <div className={FORM_GRID}>
            <div><Label>Current Annual Income ($)</Label><AmountInput  value={form.currentIncome} onValueChange={(nv) => setForm({ ...form, currentIncome: nv })} /></div>
            <div><Label>New Annual Income ($)</Label><AmountInput  value={form.newIncome} onValueChange={(nv) => setForm({ ...form, newIncome: nv })} /></div>
            <div><Label>Current Savings Rate (%)</Label><AmountInput  value={form.currentSavingsRate} onValueChange={(nv) => setForm({ ...form, currentSavingsRate: nv })} /></div>
          </div>
          <Button onClick={calculate} disabled={loading} className="w-full">
            <Calculator className="h-4 w-4 mr-1" /> {loading ? "Calculating..." : "Calculate Impact"}
          </Button>
        </div>
      </SectionCard>

      {result ? (
        <>
          <IncomeSide label="Current" data={result.current} currency={displayCurrency} />
          <IncomeSide label="New" data={result.new} currency={displayCurrency} />
          <SectionCard label="Impact summary" cardClassName="bg-info/10 border-info/30">
            <MetricGrid
              metrics={[
                { label: "Extra Monthly Take-Home", value: result.difference.monthlyNet, currency: displayCurrency, tone: "pos", showSign: true },
                { label: "Extra Monthly Savings", value: result.difference.monthlySavings, currency: displayCurrency, tone: "pos", showSign: true },
                { label: "Additional Annual Tax", value: result.difference.annualTax, currency: displayCurrency, tone: "neg", showSign: true },
                { label: "Annual Income Increase", value: result.difference.annualIncome, currency: displayCurrency, showSign: true },
              ]}
            />
          </SectionCard>
        </>
      ) : (
        <Placeholder text="Enter income details and click Calculate Impact" />
      )}
    </div>
  );
}

// ===== MAIN PAGE =====
function ScenariosPageContent() {
  return (
    <SectionPage
      id="scenarios"
      title="Scenarios"
      subtitle="Model financial decisions and see their long-term impact"
      width="report"
      center
    >
      <Tabs defaultValue="home-purchase">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="home-purchase">Home Purchase</TabsTrigger>
          <TabsTrigger value="extra-savings">Extra Savings</TabsTrigger>
          <TabsTrigger value="debt-payoff">Debt Payoff</TabsTrigger>
          <TabsTrigger value="income-change">Income Change</TabsTrigger>
        </TabsList>
        <TabsContent value="home-purchase" className="mt-6"><HomePurchaseTab /></TabsContent>
        <TabsContent value="extra-savings" className="mt-6"><ExtraSavingsTab /></TabsContent>
        <TabsContent value="debt-payoff" className="mt-6"><DebtPayoffTab /></TabsContent>
        <TabsContent value="income-change" className="mt-6"><IncomeChangeTab /></TabsContent>
      </Tabs>
    </SectionPage>
  );
}

export default function ScenariosPage() { return <DevModeGuard><ScenariosPageContent /></DevModeGuard>; }
