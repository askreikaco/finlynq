/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";

vi.mock("@/lib/categories/flag", () => ({
  isCategoriesMergedEnabled: vi.fn(),
}));

vi.mock("@/lib/admin/instance-flag", () => ({
  isInstanceAdminEnabled: vi.fn(() => false),
}));

vi.mock("@/components/more-menu", () => ({
  MoreMenu: ({ instanceAdminEnabled, categoriesMerged }: { instanceAdminEnabled?: boolean; categoriesMerged?: boolean }) => (
    <div data-testid="more-menu" data-instance-admin={instanceAdminEnabled} data-categories-merged={categoriesMerged}>
      MoreMenu
    </div>
  ),
}));

import * as categoriesFlagModule from "@/lib/categories/flag";
import MorePage from "@/app/(app)/more/page";

describe("MorePage with categoriesMerged wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should pass categoriesMerged={true} to MoreMenu when flag is enabled", () => {
    vi.mocked(categoriesFlagModule.isCategoriesMergedEnabled).mockReturnValue(true);

    rtlRender(<MorePage />);

    const moreMenu = screen.getByTestId("more-menu");
    expect(moreMenu).toHaveAttribute("data-categories-merged", "true");
  });

  it("should pass categoriesMerged={false} to MoreMenu when flag is disabled", () => {
    vi.mocked(categoriesFlagModule.isCategoriesMergedEnabled).mockReturnValue(false);

    rtlRender(<MorePage />);

    const moreMenu = screen.getByTestId("more-menu");
    expect(moreMenu).toHaveAttribute("data-categories-merged", "false");
  });
});
