/**
 * @vitest-environment jsdom
 *
 * Dashboard currency display render tests: verify that components respect useDisplayCurrency
 * and display the provider's currency (VND) instead of falling back to USD/CAD.
 * Each test MUST fail on pristine code with hardcoded defaults.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { forwardRef, ReactNode, cloneElement } from "react";
import { formatCurrency } from "@/lib/currency";
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
    if (urlStr.includes("/api/insights")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          anomalies: [
            { category: "Food", currentMonth: 5000000, average: 4000000, percentAbove: 25, severity: "high" },
            { category: "Transport", currentMonth: 2000000, average: 1500000, percentAbove: 15, severity: "medium" },
          ],
          trends: [],
          topMerchants: [
            { payee: "TestStore", totalSpent: 3000000, count: 5 },
          ],
          spendingByDay: [],
        }),
      } as any);
    }
    if (urlStr.includes("/api/recurring")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          recurring: [
            { payee: "Subscription", avgAmount: 500000, currency: "VND", frequency: "monthly", nextDate: "2026-11-06" },
          ],
          displayCurrency: "VND",
          monthlyRecurringTotal: 500000,
          count: 1,
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

// Mock hooks with mutable state for testing both animated and non-animated paths
const animationsState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/hooks/use-animations", () => ({
  useAnimations: () => animationsState.enabled,
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
  Tooltip: ({ content, formatter }: any) => {
    let rendered = null;
    if (content && typeof content === "object" && content.type) {
      // content is a React element (like <ChartTooltip ... /> or <PieTooltip ... /> or <SparklineTooltip ... />)
      // Clone it with tooltip props that Recharts would normally pass
      const mockPayload = [{ value: 1234567, name: "test", payload: { date: "2024-01", total: 1234567 } }];
      rendered = cloneElement(content, { active: true, payload: mockPayload, label: "2024-01" });
    } else if (typeof content === "function") {
      // content is a component function
      const mockPayload = [{ value: 1234567, name: "test", payload: { date: "2024-01", total: 1234567 } }];
      rendered = content({ active: true, payload: mockPayload, label: "2024-01" });
    } else if (formatter) {
      // Use formatter to format values
      const formattedValue = formatter(1234567, "test");
      rendered = <div>{Array.isArray(formattedValue) ? formattedValue[0] : formattedValue}</div>;
    }
    return <div data-testid="tooltip">{rendered}</div>;
  },
  ReferenceLine: () => null,
}));

vi.mock("@/components/chart-breakdown-list", () => ({
  TooltipBreakdownList: () => null,
}));

vi.mock("@/app/(app)/dashboard/_components/chart-tooltip", () => ({
  ChartTooltip: ({ currency }: any) => (
    <div>
      {currency && formatCurrency(1000000, currency)}
    </div>
  ),
  PieTooltip: ({ currency }: any) => (
    <div>
      {currency && formatCurrency(500000, currency)}
    </div>
  ),
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
  animate: (from: number, to: number, options: any) => {
    // Call onUpdate callback synchronously to simulate animation completion
    if (options?.onUpdate) {
      options.onUpdate(to);
    }
    return {
      stop: () => {},
    };
  },
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
      const text = container.textContent || "";
      // Chart should display amounts using displayCurrency (VND) in the Tooltip
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
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
      const text = container.textContent || "";
      // Sparkline should render and use displayCurrency (VND) in tooltips
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD|€/);
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
      const text = container.textContent || "";
      // Sparkline should render and use EUR in tooltips
      expect(text).toMatch(/€/);
      expect(text).not.toMatch(/₫/);
    });
  });

  it("InsightsSection renders with provider currency", async () => {
    const { container } = render(
      <TestWrapper>
        <InsightsSection />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // InsightsSection should render amounts using displayCurrency (VND)
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
    }, { timeout: 3000 });
  });

  it("NetWorthHistoryChart resolves currency from provider when API response has no displayCurrency", async () => {
    // Create a fetch mock that handles all endpoints, returning VND for session
    // but NO displayCurrency/seriesCurrency for net-worth endpoint
    const originalFetch = global.fetch;
    (global.fetch as unknown as typeof fetch) = vi.fn((url: string | Request | URL) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes("/api/auth/session")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ displayCurrency: "VND" }),
        } as any);
      }
      if (urlStr.includes("/api/net-worth-history")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            // Explicitly NO displayCurrency or seriesCurrency - should fall back to provider's VND
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
      return Promise.resolve({ ok: false } as any);
    });

    try {
      const { container } = render(
        <TestWrapper>
          <NetWorthHistoryChart />
        </TestWrapper>
      );

      await waitFor(() => {
        const text = container.textContent || "";
        expect(text).toMatch(/Net Worth Over Time/);
        // Component should use provider's displayCurrency (VND) when API response has none
        expect(text).toMatch(/₫/);
        expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
      }, { timeout: 3000 });
    } finally {
      // Restore original fetch
      global.fetch = originalFetch;
    }
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
          bankCurrency={null as unknown as string}
          bankPayee="Test Payee"
          busy={false}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // Null should fallback to displayCurrency (VND)
      expect(text).toMatch(/₫/);
    });
  });
});

describe("Dashboard Currency Render Tests - Animation Cases", () => {
  describe("With useAnimations disabled", () => {
    // useAnimations is mocked to false by default
    it("AnimatedNumber with animations disabled displays VND", async () => {
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
  });

  describe("With useAnimations enabled", () => {
    beforeEach(() => {
      animationsState.enabled = true;
    });

    afterEach(() => {
      animationsState.enabled = false;
    });

    it("AnimatedNumber with animations enabled displays VND in animated path", async () => {
      const { container } = render(
        <TestWrapper>
          <AnimatedNumber value={1000000} />
        </TestWrapper>
      );

      await waitFor(() => {
        const text = container.textContent || "";
        // Should display VND currency symbol in both initial render and animated onUpdate
        expect(text).toMatch(/₫/);
        expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
      });
    });

    it("MetricCard with animations enabled displays VND in animated path", async () => {
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
        // Should display VND currency symbol in both initial render and animated onUpdate
        expect(text).toMatch(/₫/);
        expect(text).not.toMatch(/\$|US\$|CA\$|CAD|USD/);
      });
    });
  });
});
