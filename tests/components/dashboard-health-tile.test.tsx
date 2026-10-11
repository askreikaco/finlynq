/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { HealthScoreCard } from "@/app/(app)/dashboard/_components/health-score-card";
import { KeyMetrics } from "@/app/(app)/dashboard/_components/key-metrics";

vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "VND" }) }));
vi.mock("@/components/sparkline", () => ({ Sparkline: () => null }));
vi.mock("@/app/(app)/dashboard/_components/health-info-dialog", () => ({
  HealthInfoDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="health-dialog" /> : null),
}));

afterEach(cleanup);

const health = { score: 72, grade: "B", components: [], savingsRatePct: 25, dti: { pct: 30, reliable: true } } as never;

describe("Home small tiles", () => {
  it("health tile shows score + grade only and a tap opens the details dialog", () => {
    render(<HealthScoreCard health={health} />);
    expect(screen.getByText("72")).toBeTruthy();
    expect(screen.queryByTestId("health-dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Financial health details" }));
    expect(screen.getByTestId("health-dialog")).toBeTruthy();
  });

  it("KeyMetrics tiles mode renders two bare tiles (no wrapping grid)", () => {
    const { container } = render(<KeyMetrics health={health} tiles />);
    expect(container.querySelector(".grid")).toBeNull();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
  });

  it("KeyMetrics default keeps its own grid (Family overview)", () => {
    const { container } = render(<KeyMetrics health={health} />);
    expect(container.querySelector(".grid")).not.toBeNull();
  });
});
