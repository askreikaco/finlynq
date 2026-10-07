/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import * as categoriesFlagModule from "@/lib/categories/flag";

afterEach(cleanup);

vi.mock("@/lib/categories/flag", () => ({
  isCategoriesMergedEnabled: vi.fn(),
}));

vi.mock("@/lib/quick-add/flag", () => ({
  isQuickAddEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/admin/instance-flag", () => ({
  isInstanceAdminEnabled: vi.fn(() => false),
}));

vi.mock("@/components/nav", () => ({
  Nav: ({ categoriesMerged }: { categoriesMerged?: boolean }) => (
    <div data-testid="nav" data-categories-merged={categoriesMerged}>Nav</div>
  ),
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

vi.mock("@/components/quick-add-fab", () => ({
  QuickAddFAB: () => null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Import after mocking
import { screen } from "@testing-library/react";
import AppLayout from "@/app/(app)/layout";

describe("AppLayout with categoriesMerged wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should pass categoriesMerged={true} to Nav when flag is enabled", () => {
    vi.mocked(categoriesFlagModule.isCategoriesMergedEnabled).mockReturnValue(true);

    render(<AppLayout><div>Test Content</div></AppLayout>);

    const nav = screen.getByTestId("nav");
    expect(nav).toHaveAttribute("data-categories-merged", "true");
  });

  it("should pass categoriesMerged={false} to Nav when flag is disabled", () => {
    vi.mocked(categoriesFlagModule.isCategoriesMergedEnabled).mockReturnValue(false);

    render(<AppLayout><div>Test Content</div></AppLayout>);

    const nav = screen.getByTestId("nav");
    expect(nav).toHaveAttribute("data-categories-merged", "false");
  });
});
