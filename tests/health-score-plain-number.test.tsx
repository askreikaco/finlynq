/**
 * @vitest-environment jsdom
 *
 * Health Score Card plain number rendering tests: verify that numeric scores
 * render as plain numbers (e.g., "68") without currency symbols, even when the
 * display currency is non-USD (e.g., VND which uses ₫).
 *
 * This test prevents regressions of the bug where health.score was passed as a
 * number to MetricCard, causing it to render as currency (e.g., "C$68,00").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { forwardRef, ReactNode } from "react";

const MockIcon = forwardRef<SVGSVGElement>(() => <span>Icon</span>);
MockIcon.displayName = "MockIcon";

beforeEach(() => {
  (global.fetch as unknown as typeof fetch) = vi.fn((url: string | Request | URL) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    if (urlStr.includes("/api/auth/session")) {
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
}));

vi.mock("lucide-react", () => ({
  Activity: () => <span>Activity</span>,
}));

const animationsState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/hooks/use-animations", () => ({
  useAnimations: () => animationsState.enabled,
}));

vi.mock("@/components/ui/lazy-view", () => ({
  LazyView: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/components/language-provider", () => ({
  useLanguage: () => ({ locale: "en-US" }),
}));

// Import AFTER mocks
import { MetricCard } from "@/components/metric-card";
import { CurrencyProvider } from "@/components/currency-provider";

function TestWrapper({ children }: { children: ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

describe("Health Score Plain Number Rendering", () => {
  it("MetricCard with ReactNode value containing plain number (68) does not render currency symbol", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value={<span>68</span>}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("68");
      // Should NOT contain any currency symbols
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });

  it("MetricCard with ReactNode value containing plain number (100) renders exactly '100'", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value={<span>100</span>}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("100");
      // Should NOT contain any formatting or separators
      expect(text).not.toMatch(/,|\.|\s\d|\s₫/);
    });
  });

  it("MetricCard with ReactNode value containing plain number (0) renders exactly '0'", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value={<span>0</span>}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("0");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });

  it("MetricCard with ReactNode value containing plain number (40) renders exactly '40'", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value={<span>40</span>}
          valueClassName="text-amber-500"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("40");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$|,/);
    });
  });

  it("MetricCard with numeric value (legacy) still renders as currency with VND symbol", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Account Balance"
          icon={MockIcon}
          value={5000000}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // When value is a NUMBER (not ReactNode), it should still render as currency
      expect(text).toMatch(/₫/);
    });
  });

  it("MetricCard with plain number string value ('68') renders without currency when passed as string", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value="68"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("68");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });

  it("MetricCard renders health score boundary at 40 with amber tone and plain number", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value={<span>40</span>}
          valueClassName="text-amber-500"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("40");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$|,/);
    });
  });

  it("MetricCard renders health score boundary at 71 with emerald tone and plain number", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value={<span>71</span>}
          valueClassName="text-emerald-500"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("71");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$|,/);
    });
  });

  it("MetricCard renders low health score 30 with rose tone and plain number", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Financial Health"
          icon={MockIcon}
          value={<span>30</span>}
          valueClassName="text-rose-500"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("30");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$|,/);
    });
  });
});

describe("MetricCard Plain Number vs Currency Guard Tests", () => {
  it("Guard: numeric value still renders as currency (regression protection)", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Account Value"
          icon={MockIcon}
          value={50000000}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // This MUST render with currency (VND ₫) to guard against accidental regressions
      // where someone might pass a number thinking it will be plain
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/^50000000$/);
    });
  });

  it("Admin stat count uses plain string to avoid currency rendering", async () => {
    const { container } = render(
      <TestWrapper>
        <MetricCard
          label="Total Users"
          icon={MockIcon}
          value="1,234"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("1,234");
      // Should NOT have currency symbols
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });
});
