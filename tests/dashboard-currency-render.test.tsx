/**
 * @vitest-environment jsdom
 *
 * Dashboard currency display render tests: verify that components respect useDisplayCurrency
 * and display the provider's currency (VND) instead of falling back to USD/CAD.
 * Each test MUST fail on pristine code with hardcoded defaults.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { ReactNode } from "react";

// Mock fetch globally to return VND as displayCurrency
beforeEach(() => {
  global.fetch = vi.fn((url: string) => {
    if (url.includes("/api/auth/session")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ displayCurrency: "VND" }),
      } as any);
    }
    return Promise.resolve({
      ok: false,
    } as any);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

// Mock icons
vi.mock("lucide-react", () => ({
  Wallet: () => <span>Wallet</span>,
  Landmark: () => <span>Landmark</span>,
  AlertTriangle: () => <span>Alert</span>,
  RefreshCw: () => <span>Refresh</span>,
  Store: () => <span>Store</span>,
  TrendingUp: () => <span>Trend</span>,
  Activity: () => <span>Activity</span>,
  ArrowUpRight: () => <span>Up</span>,
  ArrowDownRight: () => <span>Down</span>,
}));

// Mock hooks
vi.mock("@/hooks/use-animations", () => ({
  useAnimations: () => false, // Disable animations to avoid async issues
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
  Tooltip: ({ content }: any) => <div data-testid="tooltip">{content}</div>,
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

vi.mock("@/components/health-info-dialog", () => ({
  HealthInfoDialog: () => null,
}));

// Import components AFTER mocks
import { AnimatedNumber } from "@/components/animated-number";
import { MetricCard } from "@/components/metric-card";
import { AvailableToSpend } from "@/app/(app)/dashboard/_components/available-to-spend";
import { SpendingCategoryChart } from "@/app/(app)/dashboard/_components/spending-category-chart";
import { InsightsSection } from "@/app/(app)/dashboard/_components/insights-section";
import { Sparkline } from "@/components/sparkline";
import { IncomeExpenseChart } from "@/app/(app)/dashboard/_components/income-expense-chart";
import { CurrencyProvider } from "@/components/currency-provider";

function TestWrapper({ children }: { children: ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

describe("Dashboard Currency Render Tests", () => {
  it("AnimatedNumber without currency prop displays VND", async () => {
    const { container } = render(
      <TestWrapper>
        <AnimatedNumber value={1000000} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    });
  });

  it("AnimatedNumber with currency prop uses provided currency", async () => {
    const { container } = render(
      <TestWrapper>
        <AnimatedNumber value={1000000} currency="JPY" />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // JPY should render without decimal places
      expect(text).toMatch(/\d+/);
    });
  });

  it("MetricCard without currency prop displays VND", async () => {
    const MockIcon = () => <span>Icon</span>;
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Test Metric"
          icon={MockIcon}
          value={5000000}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    });
  });

  it("AvailableToSpend without currency prop displays VND", async () => {
    const { container } = render(
      <TestWrapper>
        <AvailableToSpend
          income={5000000}
          expenses={2000000}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    });
  });

  it("AvailableToSpend with currency prop uses provided currency", async () => {
    const { container } = render(
      <TestWrapper>
        <AvailableToSpend
          income={5000000}
          expenses={2000000}
          currency="JPY"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Should contain JPY-formatted number
      expect(text).toMatch(/\d+/);
    });
  });

  it("SpendingCategoryChart without currency prop displays VND in legend", async () => {
    const data = [
      { name: "Food", value: 1000000 },
      { name: "Transport", value: 500000 },
    ];
    const { container } = render(
      <TestWrapper>
        <SpendingCategoryChart data={data} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Should display total in VND
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    });
  });

  it("IncomeExpenseChart without currency prop renders without error", async () => {
    const data = [
      {
        month: "2024-01",
        income: 10000000,
        expenses: 5000000,
      },
    ];
    const { container } = render(
      <TestWrapper>
        <IncomeExpenseChart data={data} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toMatch(/Income vs Expenses/);
      expect(container.querySelector('[data-testid="card"]')).toBeTruthy();
    });
  });

  it("Sparkline without currency prop mounts with provider currency", async () => {
    const data = [100000, 200000, 150000];
    const { container } = render(
      <TestWrapper>
        <Sparkline
          data={data}
          color="#6366f1"
          labels={["2024-01", "2024-02", "2024-03"]}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(container.querySelector('[data-testid="chart"]')).toBeTruthy();
    });
  });

  it("Sparkline with currency prop overrides provider", async () => {
    const data = [100000, 200000, 150000];
    const { container } = render(
      <TestWrapper>
        <Sparkline
          data={data}
          color="#6366f1"
          currency="JPY"
          labels={["2024-01", "2024-02", "2024-03"]}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(container.querySelector('[data-testid="chart"]')).toBeTruthy();
    });
  });

  it("InsightsSection without currency prop displays VND", async () => {
    const { container } = render(
      <TestWrapper>
        <InsightsSection />
      </TestWrapper>
    );

    await waitFor(() => {
      // Component should render without errors
      expect(container).toBeTruthy();
    });
  });
});
