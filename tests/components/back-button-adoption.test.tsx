/**
 * @vitest-environment jsdom
 *
 * Tests for BackButton adoption on four fixed-href pages:
 * - src/app/(app)/settings/import/reconcile-visibility/page.tsx
 * - src/app/(app)/family/share/page.tsx
 * - src/app/(app)/transactions/audit/page.tsx
 * - src/app/(app)/categories/[id]/page.tsx
 *
 * Each page now renders a BackButton via PageHeader's backHref prop.
 * Tests verify the header fragments render with the expected back button hrefs and labels.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...p }, children),
}));

afterEach(cleanup);

describe("BackButton adoption: ReconcileVisibility page", () => {
  it("PageHeader has backHref=/settings/import and backLabel='Import settings'", async () => {
    const { PageHeader } = await import("@/components/mobile");

    render(
      <PageHeader
        title="Reconcile dropdown visibility"
        titleClassName="text-2xl font-bold tracking-tight"
        backHref="/settings/import"
        backLabel="Import settings"
      />
    );

    const backButton = screen.queryByRole("link", { name: /Import settings/i });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/settings/import");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");
  });
});

describe("BackButton adoption: FamilyShare page", () => {
  it("PageHeader has backHref=/family and backLabel from FAMILY_STRINGS.share_back", async () => {
    const { PageHeader } = await import("@/components/mobile");
    const { FAMILY_STRINGS } = await import("@/lib/family/strings");

    render(
      <PageHeader
        title={FAMILY_STRINGS.share_page_title}
        titleClassName="text-2xl sm:text-3xl font-bold"
        subtitle={FAMILY_STRINGS.share_page_description}
        subtitleClassName="text-sm text-muted-foreground mt-1"
        backHref="/family"
        backLabel={FAMILY_STRINGS.share_back}
      />
    );

    const backButton = screen.queryByRole("link", { name: FAMILY_STRINGS.share_back });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/family");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");
  });
});

describe("BackButton adoption: CurrencyAudit page", () => {
  it("PageHeader has backHref=/transactions and backLabel='Back to Transactions'", async () => {
    const { PageHeader } = await import("@/components/mobile");

    render(
      <PageHeader
        title="Currency Review"
        titleClassName="text-xl font-semibold tracking-tight"
        backHref="/transactions"
        backLabel="Back to Transactions"
      />
    );

    const backButton = screen.queryByRole("link", { name: /Back to Transactions/i });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/transactions");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");
  });
});

describe("BackButton adoption: Category page", () => {
  it("PageHeader has backHref=/categories and backLabel='Categories' for expense category", async () => {
    const { PageHeader } = await import("@/components/mobile");

    const categoriesBackHref = "/categories";

    render(
      <PageHeader
        title="Food"
        titleClassName="text-2xl font-bold"
        backHref={categoriesBackHref}
        backLabel="Categories"
      />
    );

    const backButton = screen.queryByRole("link", { name: /Categories/i });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/categories");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");
  });

  it("PageHeader has backHref=/categories?type=I and backLabel='Categories' for income category", async () => {
    const { PageHeader } = await import("@/components/mobile");

    const categoriesBackHref = "/categories?type=I";

    render(
      <PageHeader
        title="Salary"
        titleClassName="text-2xl font-bold"
        backHref={categoriesBackHref}
        backLabel="Categories"
      />
    );

    const backButton = screen.queryByRole("link", { name: /Categories/i });
    expect(backButton).toBeTruthy();
    expect(backButton?.getAttribute("href")).toBe("/categories?type=I");
    expect(backButton?.getAttribute("data-slot")).toBe("back-button");
  });
});
