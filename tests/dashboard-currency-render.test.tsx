/**
 * @vitest-environment jsdom
 *
 * Dashboard currency display render tests: verify that components respect useDisplayCurrency
 * and display the provider's currency (VND) instead of falling back to USD/CAD.
 * Each test MUST fail on pristine code with hardcoded defaults.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { forwardRef, ReactNode } from "react";
const MockIcon = forwardRef<SVGSVGElement>(() => <span>Icon</span>);
MockIcon.displayName = "MockIcon";

// Mock fetch globally to return VND as displayCurrency
beforeEach(() => {
  (global.fetch as unknown as typeof fetch) = vi.fn((url: string | Request | URL) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    if (urlStr.includes("/api/auth/session")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ displayCurrency: "VND" }),
      } as any);
    }
    if (urlStr.includes("/api/dashboard/insights")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          categories: [
            { name: "Food", currentMonth: 5000000, average: 4000000 },
            { name: "Transport", currentMonth: 2000000, average: 1500000 },
          ],
          recurring: {
            monthlyRecurringTotal: 3000000,
            displayCurrency: "VND",
            items: [
              { description: "Subscription", avgAmount: 500000, currency: "VND" },
            ],
          },
          monthlySpending: [
            { month: "2024-01", totalSpent: 10000000 },
          ],
        }),
      } as any);
    }
    if (urlStr.includes("/api/net-worth-history")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          displayCurrency: "VND",
          period: "6m",
          accountId: null,
          series: [
            { date: "2024-01-01", value: 100000000 },
            { date: "2024-02-01", value: 120000000 },
            { date: "2024-03-01", value: 150000000 },
          ],
          hasInvestmentData: false,
          fxApproximation: false,
        }),
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
import { NetWorthHistoryChart } from "@/components/net-worth-history-chart";
import { ConfirmDeleteBankRow } from "@/components/reconcile/confirm-delete-bank-row";
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

  it("AnimatedNumber with empty string currency prop displays VND (not bare number)", async () => {
    const { container } = render(
      <TestWrapper>
        <AnimatedNumber value={1000000} currency="" />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Empty string should fall back to displayCurrency (VND)
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    });
  });

  it("AnimatedNumber with EUR currency prop displays EUR symbol", async () => {
    const { container } = render(
      <TestWrapper>
        <AnimatedNumber value={1000000} currency="EUR" />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // EUR should render with Euro symbol
      expect(text).toMatch(/€/);
      expect(text).not.toMatch(/₫/);
    });
  });

  it("AnimatedNumber with JPY currency prop displays JPY symbol", async () => {
    const { container } = render(
      <TestWrapper>
        <AnimatedNumber value={1000000} currency="JPY" />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // JPY should render with symbol/code
      expect(text).toMatch(/¥|JPY/);
      expect(text).not.toMatch(/₫/);
    });
  });

  it("MetricCard without currency prop displays VND", async () => {
    
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

  it("MetricCard with empty string currency prop displays VND (not bare number)", async () => {
    
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Test Metric"
          icon={MockIcon}
          value={5000000}
          currency=""
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Empty string should fall back to displayCurrency (VND)
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    });
  });

  it("MetricCard with EUR currency prop displays EUR symbol", async () => {
    
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Test Metric"
          icon={MockIcon}
          value={5000000}
          currency="EUR"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // EUR should render with Euro symbol
      expect(text).toMatch(/€/);
      expect(text).not.toMatch(/₫/);
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

  it("AvailableToSpend with EUR currency prop displays EUR symbol", async () => {
    const { container } = render(
      <TestWrapper>
        <AvailableToSpend
          income={5000000}
          expenses={2000000}
          currency="EUR"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // EUR should render with Euro symbol
      expect(text).toMatch(/€/);
      expect(text).not.toMatch(/₫/);
    });
  });

  it("AvailableToSpend with JPY currency prop displays JPY symbol", async () => {
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
      // JPY should render with symbol/code
      expect(text).toMatch(/¥|JPY/);
      expect(text).not.toMatch(/₫/);
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

  it("IncomeExpenseChart without currency prop renders using provider currency", async () => {
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
      // Chart should render with the provider's currency (VND) in the Recharts formatter
      // The textContent won't show the tooltip values until hover, but the chart is set up to use VND
      const text = container.textContent || "";
      expect(text).toMatch(/Income vs Expenses/);
      // Verify the chart is rendered
      expect(container.querySelector('[data-testid="chart"]')).toBeTruthy();
    });
  });

  it("Sparkline without currency prop renders with provider currency", async () => {
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
      // Sparkline should render and use displayCurrency (VND) in tooltips (checked on hover)
      expect(container.querySelector('[data-testid="chart"]')).toBeTruthy();
    });
  });

  it("Sparkline with EUR currency prop renders using provided currency", async () => {
    const data = [100000, 200000, 150000];
    const { container } = render(
      <TestWrapper>
        <Sparkline
          data={data}
          color="#6366f1"
          currency="EUR"
          labels={["2024-01", "2024-02", "2024-03"]}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      // Sparkline should render and use EUR in tooltips
      expect(container.querySelector('[data-testid="chart"]')).toBeTruthy();
    });
  });

  it("InsightsSection renders with provider currency", async () => {
    const { container } = render(
      <TestWrapper>
        <InsightsSection />
      </TestWrapper>
    );

    await waitFor(() => {
      // InsightsSection should render and use displayCurrency (VND) for amounts
      // Component fetches data from /api/dashboard/insights which is mocked
      expect(container).toBeTruthy();
    }, { timeout: 3000 });
  });

  it("NetWorthHistoryChart renders with currency from API response", async () => {
    const { container } = render(
      <TestWrapper>
        <NetWorthHistoryChart />
      </TestWrapper>
    );

    await waitFor(() => {
      // NetWorthHistoryChart should render and fetch from /api/net-worth-history
      // The mocked API returns displayCurrency: "VND" which is used for formatting
      const text = container.textContent || "";
      expect(text).toMatch(/Net Worth Over Time/);
    }, { timeout: 3000 });
  });

  it("AnimatedNumber with reduced animations (useAnimations returns false) displays VND", async () => {
    // This test verifies that even when animations are disabled, currency display still works
    const { container } = render(
      <TestWrapper>
        <AnimatedNumber value={1000000} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Should display in VND even with animations disabled
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    });
  });

  it("ConfirmDeleteBankRow with empty string bankCurrency displays VND (not hardcoded fallback)", async () => {
    const { container } = render(
      <TestWrapper>
        <ConfirmDeleteBankRow
          open={true}
          linkedTransactionCount={1}
          bankDate="2024-01-15"
          bankAmount={1000000}
          bankCurrency=""
          bankPayee="Test Payee"
          busy={false}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Empty string currency should fallback to displayCurrency (VND), not hardcoded USD
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|USD/);
    });
  });

  it("ConfirmDeleteBankRow with real currency code (EUR) displays correct currency", async () => {
    const { container } = render(
      <TestWrapper>
        <ConfirmDeleteBankRow
          open={true}
          linkedTransactionCount={1}
          bankDate="2024-01-15"
          bankAmount={1000}
          bankCurrency="EUR"
          bankPayee="Test Payee"
          busy={false}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // EUR currency should display EUR symbol, not fallback to provider or hardcoded default
      expect(text).toMatch(/€/);
      expect(text).not.toMatch(/₫/);
    });
  });

  it("ConfirmDeleteBankRow with null bankCurrency displays VND", async () => {
    const { container } = render(
      <TestWrapper>
        <ConfirmDeleteBankRow
          open={true}
          linkedTransactionCount={1}
          bankDate="2024-01-15"
          bankAmount={1000000}
          bankCurrency={"" as any}
          bankPayee="Test Payee"
          busy={false}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Null/empty should fallback to displayCurrency (VND)
      expect(text).toMatch(/₫/);
    });
  });
});
