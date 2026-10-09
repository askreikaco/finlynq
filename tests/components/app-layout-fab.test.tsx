/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

vi.mock("@/components/mobile/page-fab", () => ({
  PageFab: vi.fn(() => <div data-testid="page-fab" />),
  PageFabProvider: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-fab-provider">{children}</div>
  )),
}));

vi.mock("@/components/nav", () => ({
  Nav: () => <div data-testid="nav">Nav</div>,
}));

vi.mock("@/components/unlock-gate", () => ({
  UnlockGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/announcement-banner", () => ({
  AnnouncementBanner: () => null,
}));

vi.mock("@/components/prompt-gate", () => ({
  PromptGate: () => null,
}));

vi.mock("@/components/currency-provider", () => ({
  CurrencyProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/dropdown-order-provider", () => ({
  DropdownOrderProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/language-provider", () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/font-provider", () => ({
  FontProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/animation-provider", () => ({
  AnimationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/reporting-recompute-indicator", () => ({
  ReportingRecomputeIndicator: vi.fn(() => null),
}));

vi.mock("@/components/version-gate", () => ({
  VersionGate: () => null,
}));

vi.mock("@/lib/data", () => ({
  DataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/web-vitals", () => ({
  WebVitals: () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Import after mocking
import AppLayout from "@/app/(app)/layout";
import * as indicatorModule from "@/components/reporting-recompute-indicator";
import * as pageFabModule from "@/components/mobile/page-fab";

describe("AppLayout mounts the per-page FAB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("renders PageFab inside PageFabProvider", () => {
    render(<AppLayout><div>Test Content</div></AppLayout>);

    const provider = screen.getByTestId("page-fab-provider");
    expect(provider).toBeInTheDocument();
    expect(provider.querySelector("[data-testid='page-fab']")).not.toBeNull();
    expect(pageFabModule.PageFab).toHaveBeenCalled();
  });

  it("renders PageFab regardless of FINLYNQ_QUICK_ADD (flag no longer gates it)", () => {
    vi.stubEnv("FINLYNQ_QUICK_ADD", "0");
    render(<AppLayout><div>Test Content</div></AppLayout>);
    expect(screen.getByTestId("page-fab")).toBeInTheDocument();

    cleanup();
    vi.stubEnv("FINLYNQ_QUICK_ADD", "1");
    render(<AppLayout><div>Test Content</div></AppLayout>);
    expect(screen.getByTestId("page-fab")).toBeInTheDocument();
  });

  it("no longer passes avoidFab to ReportingRecomputeIndicator", () => {
    render(<AppLayout><div>Test Content</div></AppLayout>);

    const callArgs = vi.mocked(indicatorModule.ReportingRecomputeIndicator).mock.calls[0] as unknown as [Record<string, unknown>];
    expect(callArgs[0]).not.toHaveProperty("avoidFab");
  });

  it("does not render the legacy quick-add button", () => {
    render(<AppLayout><div>Test Content</div></AppLayout>);
    expect(screen.queryByLabelText("Add transaction")).not.toBeInTheDocument();
  });
});
