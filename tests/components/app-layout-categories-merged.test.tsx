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
  AppTabs: (props: Record<string, unknown>) => (
    <div data-testid="nav" data-props={JSON.stringify(props ?? {})}>Nav</div>
  ),
  isTabBarHidden: () => false,
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

vi.mock("@/components/mobile/page-fab", () => ({
  PageFab: () => null,
  PageFabProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

// Import after mocking
import { screen } from "@testing-library/react";
import AppLayout from "@/app/(app)/layout";

describe("AppLayout with categoriesMerged wiring", () => {
  // The tab bar and rail have no categories tab, so the categories flag never reaches them.
  // The label switch is on More (more/page.tsx passes the flag there).
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([true, false])("renders AppTabs with no props when categoriesMerged is %s", (merged) => {
    vi.mocked(categoriesFlagModule.isCategoriesMergedEnabled).mockReturnValue(merged);

    render(<AppLayout><div>Test Content</div></AppLayout>);

    const nav = screen.getByTestId("nav");
    expect(nav).toHaveAttribute("data-props", "{}");
  });
});
