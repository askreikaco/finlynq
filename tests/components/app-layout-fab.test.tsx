/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import * as flagModule from "@/lib/quick-add/flag";

afterEach(cleanup);

vi.mock("@/lib/quick-add/flag", () => ({
  isQuickAddEnabled: vi.fn(),
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
  ReportingRecomputeIndicator: () => null,
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

describe("AppLayout with QuickAddFAB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render QuickAddFAB when flag is enabled", () => {
    vi.mocked(flagModule.isQuickAddEnabled).mockReturnValue(true);

    render(<AppLayout><div>Test Content</div></AppLayout>);

    // FAB is rendered with correct href when flag is on
    const fab = screen.getByLabelText("Add transaction");
    expect(fab).toBeInTheDocument();
    expect(fab).toHaveAttribute("href", "/transactions/new");
  });

  it("should not render QuickAddFAB when flag is disabled", () => {
    vi.mocked(flagModule.isQuickAddEnabled).mockReturnValue(false);

    render(<AppLayout><div>Test Content</div></AppLayout>);

    // FAB is not in the document when flag is off
    const fab = screen.queryByLabelText("Add transaction");
    expect(fab).not.toBeInTheDocument();
  });
});
