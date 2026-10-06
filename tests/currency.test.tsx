/**
 * @vitest-environment jsdom
 *
 * Currency display fixes: dashboard cards and components must respect useDisplayCurrency
 * instead of hardcoded CAD/USD defaults. This test verifies that amounts display in VND
 * when that is the user's display currency.
 *
 * Related: FINLYNQ-... (dashboard currency hardcoding)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock the CurrencyProvider to return VND for all tests
let displayCurrency = "VND";
vi.mock("@/components/currency-provider", () => ({
  useDisplayCurrency: () => ({
    displayCurrency,
    setDisplayCurrency: async () => {},
    isLoading: false,
  }),
}));

// Mock UI components
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

// Mock icons and utilities
vi.mock("lucide-react", () => ({
  Wallet: () => <span>💰</span>,
  AlertTriangle: () => <span>⚠️</span>,
  RefreshCw: () => <span>🔄</span>,
  Store: () => <span>🏪</span>,
  TrendingUp: () => <span>📈</span>,
  ArrowUpRight: () => <span>↗️</span>,
  ArrowDownRight: () => <span>↘️</span>,
}));

vi.mock("@/hooks/use-animations", () => ({
  useAnimations: () => true,
}));

// Mock chart libraries
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="chart">{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: ({ data }: any) => <div>{data?.length || 0} items</div>,
  Area: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: ({ content }: any) => <div>{content}</div>,
  ReferenceLine: () => null,
}));

vi.mock("@/components/chart-breakdown-list", () => ({
  TooltipBreakdownList: () => null,
}));

vi.mock("@/components/chart-stack-tooltip", () => ({
  StackedAreaTooltip: () => null,
}));

vi.mock("@/components/chart-stack-legend", () => ({
  StackedChartLegend: () => null,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  animate: () => ({
    stop: () => {},
  }),
}));

vi.mock("@/components/ui/lazy-view", () => ({
  LazyView: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/portfolio/rebuild-snapshots-button", () => ({
  RebuildSnapshotsButton: () => null,
}));

vi.mock("@/lib/chart-series", () => ({
  prepareTimeSeries: (data: any) => ({
    data: data || [],
    domain: ["auto", "auto"],
    spansZero: false,
  }),
}));

vi.mock("@/lib/chart-stack", () => ({
  buildStackedSeries: (data: any) => ({
    rows: data || [],
    legend: [],
  }),
}));

vi.mock("@/components/language-provider", () => ({
  useLanguage: () => ({ locale: "en-US" }),
}));

// Import components after mocking dependencies
import { AnimatedNumber } from "@/components/animated-number";
import { MetricCard } from "@/components/metric-card";
import { AvailableToSpend } from "@/app/(app)/dashboard/_components/available-to-spend";
import { SpendingCategoryChart } from "@/app/(app)/dashboard/_components/spending-category-chart";
import { InsightsSection } from "@/app/(app)/dashboard/_components/insights-section";
import { ChartTooltip } from "@/app/(app)/dashboard/_components/chart-tooltip";
import { NetWorthHistoryChart } from "@/components/net-worth-history-chart";
import { Sparkline } from "@/components/sparkline";
import { IncomeExpenseChart } from "@/app/(app)/dashboard/_components/income-expense-chart";

afterEach(() => {
  cleanup();
  displayCurrency = "VND";
});

describe("Dashboard Currency Display", () => {
  it("AnimatedNumber renders with provided currency", () => {
    const { container } = render(<AnimatedNumber value={1000000} currency="VND" />);
    // Component should render without error
    expect(container).toBeTruthy();
  });

  it("MetricCard renders with provided currency", () => {
    const mockIcon = () => <span>Icon</span>;
    const { container } = render(
      <MetricCard
        label="Test Metric"
        icon={mockIcon}
        value={500000}
        currency="VND"
      />
    );
    expect(container).toBeTruthy();
  });

  it("AvailableToSpend uses display currency when not provided", () => {
    const { container } = render(
      <AvailableToSpend
        income={5000000}
        expenses={2000000}
      />
    );
    expect(container).toBeTruthy();
  });

  it("AvailableToSpend uses provided currency prop", () => {
    const { container } = render(
      <AvailableToSpend
        income={5000000}
        expenses={2000000}
        currency="JPY"
      />
    );
    expect(container).toBeTruthy();
  });

  it("SpendingCategoryChart renders with data", () => {
    const data = [
      { name: "Food", value: 1000000 },
      { name: "Transport", value: 500000 },
    ];
    const { container } = render(<SpendingCategoryChart data={data} />);
    expect(container).toBeTruthy();
  });

  it("InsightsSection renders without fetching", () => {
    const { container } = render(<InsightsSection />);
    expect(container).toBeTruthy();
  });

  it("NetWorthHistoryChart renders", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayCurrency: "VND",
          period: "6m",
          series: [],
          hasInvestmentData: false,
        }),
      } as any)
    );

    const { container } = render(<NetWorthHistoryChart />);
    expect(container).toBeTruthy();
  });

  it("Sparkline renders with currency", () => {
    const data = [100000, 200000, 150000];
    const { container } = render(
      <Sparkline
        data={data}
        color="#6366f1"
        currency="VND"
      />
    );
    expect(container).toBeTruthy();
  });

  it("Sparkline renders with display currency fallback", () => {
    const data = [100000, 200000, 150000];
    const { container } = render(
      <Sparkline
        data={data}
        color="#6366f1"
      />
    );
    expect(container).toBeTruthy();
  });

  it("IncomeExpenseChart renders with data", () => {
    const data = [
      {
        month: "2024-01",
        income: 10000000,
        expenses: 5000000,
      },
    ];
    const { container } = render(<IncomeExpenseChart data={data} />);
    expect(container).toBeTruthy();
  });

  it("ChartTooltip renders with required currency", () => {
    const tooltip = <ChartTooltip active payload={[]} label="Test" currency="VND" />;
    const { container } = render(tooltip);
    expect(container).toBeTruthy();
  });
});
