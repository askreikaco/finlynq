/**
 * @vitest-environment jsdom
 */
// Batch 4 mobile-design pages (/import, /settings, /admin, /api-docs, /chat, /family, ...): one layout at every size.
// Tables became native ListRows (ColumnList for DataTable callers), settings and admin pages sit in the shared
// SectionPage column, and the reconcile panes stack in one column. Static checks cover every converted file;
// render checks cover the pages that mount without a live backend.
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { DataTableColumn } from "@/components/ui/data-table";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const H = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: H.push, replace: H.replace, back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  usePathname: () => "/",
}));
vi.mock("@/components/dev-mode-guard", () => ({ DevModeGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/onboarding-tips", () => ({ OnboardingTips: () => null }));

import { ColumnList } from "@/components/mobile/column-list";
import { TwoPaneLayout } from "@/components/import/reconcile/two-pane-layout";

/** The pages and shared files this batch converted. None of them may render a <table>. */
const CONVERTED = [
  "src/app/(app)/import/components/import-preview-dialog.tsx",
  "src/app/(app)/import/components/excel-mapper-dialog.tsx",
  "src/app/(app)/import/components/connector-reconciliation-dialog.tsx",
  "src/app/(app)/import/components/column-mapping-dialog.tsx",
  "src/app/(app)/import/components/generic-csv-connector-tab.tsx",
  "src/app/(app)/import/components/connector-tab.tsx",
  "src/app/(app)/import/components/ofx-confirm-dialog.tsx",
  "src/components/import/reconcile/db-pane.tsx",
  "src/components/import/reconcile/file-pane.tsx",
  "src/components/settings/sections/data-section.tsx",
  "src/app/(app)/settings/investments/page.tsx",
  "src/app/(app)/settings/backfill/[runId]/page.tsx",
  "src/app/(app)/admin/page.tsx",
  "src/app/(app)/admin/email-inbox/page.tsx",
  "src/app/(app)/admin/(env)/api-log/page.tsx",
  "src/app/(app)/admin/(env)/system/page.tsx",
  "src/app/(app)/admin/(env)/diagnostics/page.tsx",
  "src/app/(app)/admin/(env)/price-cache/page.tsx",
  "src/app/(app)/api-docs/page.tsx",
  "src/app/(app)/chat/page.tsx",
  "src/app/(app)/import/page.tsx",
];

describe("Batch 4: converted files render no <table>", () => {
  for (const f of CONVERTED) {
    it(`${f} has no <table, <Table or ui/table import`, () => {
      const src = read(f);
      expect(src).not.toMatch(/<table\b/);
      expect(src).not.toMatch(/<Table\b/);
      expect(src).not.toMatch(/from "@\/components\/ui\/table"/);
    });
  }

  it("the rows that replaced the tables are ListRows (or the ColumnList that renders them)", () => {
    // /import itself has no table: its staging, reconcile and to-approve panes are the inbox tabs.
    for (const f of CONVERTED.filter((x) => x !== "src/app/(app)/import/page.tsx")) {
      const src = read(f);
      expect(/ListRow|ColumnList/.test(src), f).toBe(true);
    }
  });
});

describe("Batch 4: pages sit in the shared SectionPage column", () => {
  const PAGES = [
    "src/app/(app)/settings/investments/page.tsx",
    "src/app/(app)/settings/backfill/[runId]/page.tsx",
    "src/app/(app)/admin/page.tsx",
    "src/app/(app)/admin/email-inbox/page.tsx",
    "src/app/(app)/admin/(env)/api-log/page.tsx",
    "src/app/(app)/admin/(env)/system/page.tsx",
    "src/app/(app)/admin/(env)/diagnostics/page.tsx",
    "src/app/(app)/admin/(env)/price-cache/page.tsx",
    "src/app/(app)/api-docs/page.tsx",
    "src/app/(app)/import/page.tsx",
  ];
  for (const f of PAGES) {
    it(`${f} renders through SectionPage (one shared header, centred)`, () => {
      const src = read(f);
      expect(src).toMatch(/<SectionPage\b/);
      expect(src).toMatch(/from "@\/components\/templates"/);
      expect(src).not.toMatch(/max-w-7xl|max-w-5xl|container mx-auto/);
    });
  }

  it("admin stat grids use the shared MetricGrid (2 / 3 / 4 columns), not ad-hoc desktop grids", () => {
    const src = read("src/app/(app)/admin/page.tsx");
    expect(src).toMatch(/<MetricGrid\b/);
    expect(src).not.toMatch(/grid-cols-1 regular:grid-cols-2 wide:grid-cols-4/);
  });

  it("the reconcile panes are one column at every width (no side-by-side wide grid)", () => {
    const src = read("src/components/import/reconcile/two-pane-layout.tsx");
    expect(src).not.toMatch(/wide:grid-cols-/);
    expect(src).toContain("grid grid-cols-1");
  });
});

describe("ColumnList (DataTable rows as native ListRows)", () => {
  type Row = { id: number; name: string; count: number; state: string };
  const ROWS: Row[] = [
    { id: 1, name: "Beta", count: 20, state: "ok" },
    { id: 2, name: "Alpha", count: 5, state: "warn" },
    { id: 3, name: "Gamma", count: 12, state: "ok" },
  ];
  const COLUMNS: DataTableColumn<Row>[] = [
    { key: "name", header: "Name", accessor: (r) => r.name },
    { key: "count", header: "Count", align: "right", accessor: (r) => r.count },
    { key: "state", header: "State", accessor: (r) => r.state, render: (r) => <span>{r.state.toUpperCase()}</span> },
  ];

  it("renders one list row per row, no table, the last column as the value", () => {
    const { container } = render(<ColumnList columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(container.querySelector("table")).toBeNull();
    const rows = container.querySelectorAll('[data-slot="list-row"]');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain("Beta");
    expect(rows[0].textContent).toContain("OK");
  });

  it("a sort pill orders the rows and a second tap reverses them", () => {
    const { container } = render(<ColumnList columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    const names = () => Array.from(container.querySelectorAll('[data-slot="list-row"] .font-semibold')).map((n) => n.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Count" }));
    expect(names()).toEqual(["Alpha", "Gamma", "Beta"]);
    fireEvent.click(screen.getByRole("button", { name: /Count/ }));
    expect(names()).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  it("a row tap calls onRowPress with the row", () => {
    const onRowPress = vi.fn();
    render(<ColumnList columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} onRowPress={onRowPress} />);
    fireEvent.click(screen.getByRole("button", { name: /Gamma/ }));
    expect(onRowPress).toHaveBeenCalledWith(ROWS[2]);
  });

  it("shows the empty state when there are no rows", () => {
    render(<ColumnList columns={COLUMNS} rows={[]} rowKey={(r) => r.id} emptyState={<p>Nothing here</p>} />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });
});

describe("TwoPaneLayout stacks the reconcile panes", () => {
  it("renders both panes in one column with a scroll cap each", () => {
    const { container } = render(
      <TwoPaneLayout leftLabel="Bank" left={<div>left rows</div>} rightLabel="File" right={<div>right rows</div>} />,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).not.toContain("wide:");
    expect(screen.getByText("left rows")).toBeTruthy();
    expect(screen.getByText("right rows")).toBeTruthy();
    expect(within(container).getAllByRole("heading", { level: 2 }).length).toBe(2);
  });
});

// ─── Render checks (pages that mount without a live backend) ─────────────────

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const ADMIN_USER = {
  id: "u1", username: "ada", email: "ada@example.com", displayName: "Ada Lovelace", role: "user",
  emailVerified: 1, mfaEnabled: 0, onboardingComplete: 1, plan: "pro", planExpiresAt: null,
  lastActiveAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  transactionCount: 42, activeSpanDays: 3,
};
const ADMIN_STATS = {
  totalUsers: 1, totalTransactions: 42, totalAccounts: 2, registrationsLast7Days: 1, registrationsLast30Days: 1,
  verifiedUsers: 1, mfaEnabledUsers: 0, planBreakdown: { free: 0, pro: 1 }, totalLogins: 3,
  activeUsersLast7Days: 1, activeUsersLast30Days: 1, activeUsersLast15Min: 0, activeUsersLast60Min: 0,
  activeUsersLast24Hours: 1, recentLogins: [], promptAcks: [],
};

describe("Admin console: one layout", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.startsWith("/api/admin/users")) return json({ users: [ADMIN_USER], total: 1 });
        if (u.startsWith("/api/admin/stats")) return json(ADMIN_STATS);
        if (u.startsWith("/api/admin/oauth-grants")) return json({ grants: [] });
        return json({});
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("the users are ListRows (no table), under the shared header, with a compact sort control", async () => {
    const AdminPage = (await import("@/app/(app)/admin/page")).default;
    const { container } = render(<AdminPage />);
    await screen.findByRole("button", { name: /Ada Lovelace/ });
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[data-slot="page-header"] h1')?.textContent?.trim()).toBe("Admin");
    expect(screen.getByRole("group", { name: "Sort users" })).toBeTruthy();
    expect(screen.getByLabelText("Filter by role")).toBeTruthy();
  });

  it("a user row opens a detail sheet whose actions include Make Admin and the plan control", async () => {
    const AdminPage = (await import("@/app/(app)/admin/page")).default;
    render(<AdminPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ada Lovelace/ }));
    expect(await screen.findByRole("button", { name: "Make Admin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByLabelText("Plan")).toBeTruthy();
  });
});

describe("API docs: one layout", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the shared header and no table", async () => {
    const ApiDocsPage = (await import("@/app/(app)/api-docs/page")).default;
    const { container } = render(<ApiDocsPage />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[data-slot="page-header"] h1')?.textContent?.trim()).toBe("API Docs");
  });
});
