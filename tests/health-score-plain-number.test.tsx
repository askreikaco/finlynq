/**
 * @vitest-environment jsdom
 *
 * Health Score Card plain number rendering tests: verify that the real HealthScoreCard
 * component renders numeric scores as plain numbers (e.g., "68") without currency symbols,
 * even when the display currency is non-USD (e.g., VND which uses ₫, or CAD which uses C$).
 *
 * This test prevents regressions of the bug where health.score was passed as a
 * number to MetricCard, causing it to render as currency (e.g., "C$68,00").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { forwardRef, ReactNode } from "react";
import type { HealthData } from "@/app/(app)/dashboard/_components/types";

const MockIcon = forwardRef<SVGSVGElement>(() => <span>Icon</span>);
MockIcon.displayName = "MockIcon";

beforeEach(() => {
  (global.fetch as unknown as typeof fetch) = vi.fn((url: string | Request | URL) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
    if (urlStr.includes("/api/auth/session")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ displayCurrency: "VND" }),
      } as Response);
    }
    return Promise.resolve({
      ok: false,
    } as Response);
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock UI components
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<'div'>) => <div data-testid="card" {...props}>{children}</div>,
  CardContent: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
}));

vi.mock("lucide-react", () => ({
  Activity: () => <span>Activity</span>,
}));

const animationsState = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/hooks/use-animations", () => ({
  useAnimations: () => animationsState.enabled,
}));

vi.mock("@/components/ui/lazy-view", () => ({
  LazyView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
}));

vi.mock("@/components/language-provider", () => ({
  useLanguage: () => ({ locale: "en-US" }),
}));

vi.mock("@/app/(app)/dashboard/_components/health-info-dialog", () => ({
  HealthInfoDialog: () => null,
}));

// Import AFTER mocks
import { HealthScoreCard } from "@/app/(app)/dashboard/_components/health-score-card";
import { MetricCard } from "@/components/metric-card";
import { CurrencyProvider } from "@/components/currency-provider";

function TestWrapper({ children }: { children: ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

// Create minimal valid HealthData for testing
function createMockHealth(score: number): HealthData {
  return {
    score,
    grade: score > 70 ? "A" : score >= 40 ? "B" : "C",
    components: [
      {
        name: "Liquidity",
        score: 50,
        weight: 0.25,
        weighted: 12.5,
        detail: "Test component",
      },
    ],
  };
}

describe("HealthScoreCard Plain Number Rendering (VND)", () => {
  it("Renders health score 68 as exactly '68' with VND currency provider", async () => {
    const health = createMockHealth(68);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("68");
      // Should NOT contain any currency symbols
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });

  it("Renders health score 100 as exactly '100'", async () => {
    const health = createMockHealth(100);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("100");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });

  it("Renders health score 0 as exactly '0'", async () => {
    const health = createMockHealth(0);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("0");
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });

  it("Rounds 67.6 to '68'", async () => {
    const health = createMockHealth(67.6);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("68");
      expect(text).not.toContain("67");
      expect(text).not.toMatch(/\./);
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });
});

describe("HealthScoreCard Tone Boundaries (VND)", () => {
  it("Score 71 triggers emerald tone", async () => {
    const health = createMockHealth(71);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("71");
      // Check that emerald class is applied to the icon wrapper
      const iconWrapper = container.querySelector('.bg-emerald-100');
      expect(iconWrapper).toBeTruthy();
      // Also check the value color class
      const valueDiv = container.querySelector('.text-emerald-500');
      expect(valueDiv).toBeTruthy();
    });
  });

  it("Score 70 triggers amber tone (not >70, so >=40)", async () => {
    const health = createMockHealth(70);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("70");
      const iconWrapper = container.querySelector('.bg-amber-100');
      expect(iconWrapper).toBeTruthy();
      const valueDiv = container.querySelector('.text-amber-500');
      expect(valueDiv).toBeTruthy();
    });
  });

  it("Score 40 triggers amber tone (>=40)", async () => {
    const health = createMockHealth(40);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("40");
      const iconWrapper = container.querySelector('.bg-amber-100');
      expect(iconWrapper).toBeTruthy();
      const valueDiv = container.querySelector('.text-amber-500');
      expect(valueDiv).toBeTruthy();
    });
  });

  it("Score 39 triggers rose tone (else)", async () => {
    const health = createMockHealth(39);
    const { container } = render(
      <TestWrapper currency="VND">
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("39");
      const iconWrapper = container.querySelector('.bg-rose-100');
      expect(iconWrapper).toBeTruthy();
      const valueDiv = container.querySelector('.text-rose-500');
      expect(valueDiv).toBeTruthy();
    });
  });
});

describe("HealthScoreCard Plain Number Rendering (CAD)", () => {
  beforeEach(() => {
    // Mock fetch to return CAD currency
    (global.fetch as unknown as typeof fetch) = vi.fn((url: string | Request | URL) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;
      if (urlStr.includes("/api/auth/session")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ displayCurrency: "CAD" }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
      } as Response);
    });
  });

  it("Renders health score 68 as exactly '68' with CAD currency provider", async () => {
    const health = createMockHealth(68);
    const { container } = render(
      <TestWrapper>
        <HealthScoreCard health={health} />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      expect(text).toContain("68");
      // Should NOT contain any currency symbols, even with CAD
      expect(text).not.toMatch(/₫|€|\$|USD|EUR|VND|C\$/);
    });
  });
});

describe("MetricCard Plain Number vs Currency Guard Tests", () => {
  it("Guard: numeric value still renders as currency (regression protection)", async () => {
    const { container } = render(
      <TestWrapper currency="VND">
        <MetricCard
          label="Account Balance"
          icon={MockIcon}
          value={5000000}
        />
      </TestWrapper>
    );

    await waitFor(() => {
      const text = container.textContent || "";
      // This MUST render with currency (VND ₫) to guard against accidental regressions
      // where someone might pass a number thinking it will be plain
      expect(text).toMatch(/₫/);
      expect(text).not.toMatch(/^5000000$/);
    });
  });
});
