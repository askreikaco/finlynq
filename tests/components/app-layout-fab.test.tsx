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
  AppTabs: () => <div data-testid="nav">Nav</div>,
  isTabBarHidden: () => false,
}));

vi.mock("@/components/unlock-gate", () => ({
  UnlockGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

vi.mock("@/components/notice/feeds", () => ({
  NoticeFeed: vi.fn(() => null),
}));


vi.mock("@/lib/data", () => ({
  DataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/web-vitals", () => ({
  WebVitals: () => null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));

// Import after mocking
import AppLayout from "@/app/(app)/layout";
import * as feedsModule from "@/components/notice/feeds";
import * as pageFabModule from "@/components/mobile/page-fab";

describe("AppLayout has no floating action button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("keeps PageFabProvider but mounts no floating button", () => {
    render(<AppLayout><div>Test Content</div></AppLayout>);

    expect(screen.getByTestId("page-fab-provider")).toBeInTheDocument();
    expect(screen.queryByTestId("page-fab")).toBeNull();
    expect(pageFabModule.PageFab).not.toHaveBeenCalled();
  });

  it("mounts no floating button regardless of FINLYNQ_QUICK_ADD", () => {
    vi.stubEnv("FINLYNQ_QUICK_ADD", "0");
    render(<AppLayout><div>Test Content</div></AppLayout>);
    expect(screen.queryByTestId("page-fab")).toBeNull();

    cleanup();
    vi.stubEnv("FINLYNQ_QUICK_ADD", "1");
    render(<AppLayout><div>Test Content</div></AppLayout>);
    expect(screen.queryByTestId("page-fab")).toBeNull();
  });

  it("mounts the announcement and recompute notices without avoidFab", () => {
    render(<AppLayout><div>Test Content</div></AppLayout>);

    const calls = vi.mocked(feedsModule.NoticeFeed).mock.calls as unknown as [Record<string, unknown>][];
    const sources = calls.map((c) => c[0].source);
    expect(sources).toContain("reporting-recompute");
    expect(sources).toContain("announcement");
    for (const [props] of calls) expect(props).not.toHaveProperty("avoidFab");
  });

  it("does not render the legacy quick-add button", () => {
    render(<AppLayout><div>Test Content</div></AppLayout>);
    expect(screen.queryByLabelText("Add transaction")).not.toBeInTheDocument();
  });
});
