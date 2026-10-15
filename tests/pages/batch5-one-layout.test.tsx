/**
 * @vitest-environment jsdom
 */
// Batch 5 mobile-design pages (admin inbox, integrations, system, family overview, more menu, feedback,
// what's new, admin announcements / feedback): one layout at every size. The inbox list/detail split became a
// single column (ListRows, tap opens a bottom Sheet), stat blocks sit in MetricGrid, and the remaining pages use
// SectionPage (report width, centred). Static checks cover every converted file; render checks cover the shared
// pieces and the inbox list without a live backend.
import { Wallet } from "lucide-react";
import * as React from "react";
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

vi.mock("next/link", () => ({
  default: ({ children, href, ...p }: React.PropsWithChildren<{ href: string }>) => React.createElement("a", { href, ...p }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({}),
  usePathname: () => "/admin/inbox",
}));
vi.mock("@/components/currency-provider", () => ({ useDisplayCurrency: () => ({ displayCurrency: "USD", isLoading: false }) }));
vi.mock("@/components/notice/feeds", () => ({ NoticeFeed: () => null }));

import { MetricGrid } from "@/components/mobile/metric-grid";
import { ListRow } from "@/components/mobile/list-row";

/** Every page or shared file this batch converted. None of them may render a <table>. */
const CONVERTED = [
  "src/app/(app)/admin/inbox/page.tsx",
  "src/app/(app)/admin/(env)/integrations/page.tsx",
  "src/app/(app)/admin/(env)/system/page.tsx",
  "src/app/(app)/family/_components/overview-cards.tsx",
  "src/app/(app)/family/_components/overview-tab.tsx",
  "src/app/(app)/feedback/page.tsx",
  "src/app/(app)/whats-new/page.tsx",
  "src/app/(app)/admin/announcements/page.tsx",
  "src/app/(app)/admin/feedback/page.tsx",
];

describe("Batch 5: converted files render no <table>", () => {
  for (const f of CONVERTED) {
    it(`${f} has no <table, <Table or ui/table import`, () => {
      const src = read(f);
      expect(src).not.toMatch(/<table\b/);
      expect(src).not.toMatch(/<Table\b/);
      expect(src).not.toMatch(/from "@\/components\/ui\/table"/);
    });
  }
});

// Desktop width becomes columns (owner 2026-10-13): these two files lay cards in wide: grids on purpose,
// pinned in tests/pages/desktop-columns.test.tsx. Everything else stays single-column.
const DESKTOP_GRIDDED = new Set([
  "src/app/(app)/family/_components/overview-tab.tsx",
  "src/app/(app)/admin/announcements/page.tsx",
]);

describe("Batch 5: one column at every width (no wide: / regular: column switches)", () => {
  for (const f of CONVERTED.filter((c) => !DESKTOP_GRIDDED.has(c))) {
    it(`${f} has no two-column wide:/regular: grid`, () => {
      const src = read(f);
      expect(src).not.toMatch(/wide:grid-cols-/);
      expect(src).not.toMatch(/regular:grid-cols-/);
      expect(src).not.toMatch(/wide:grid\b/);
      expect(src).not.toMatch(/wide:\[/);
    });
  }

  it("the admin inbox no longer splits list and thread side by side", () => {
    const src = read("src/app/(app)/admin/inbox/page.tsx");
    expect(src).not.toMatch(/340px/);
    expect(src).toMatch(/<ListRow\b/);
    expect(src).toMatch(/<Sheet\b/);
  });

  it("more-menu: groups one column on phone, 2 at regular, 1 at wide (column 1 of the cascading columns)", () => {
    const src = read("src/components/more-menu.tsx");
    expect(src).toMatch(/grid-cols-1[^"]*regular:grid-cols-2[^"]*wide:grid-cols-1/);
    expect(src).not.toMatch(/wide:max-w-3xl|max-w-xl|mx-auto/);
  });

  it("family overview headline stack is single-column; only the household charts pair up at wide", () => {
    expect(read("src/app/(app)/family/_components/overview-cards.tsx")).not.toMatch(/regular:col-span-2/);
    const tab = read("src/app/(app)/family/_components/overview-tab.tsx");
    expect(tab.match(/wide:grid-cols-2/g)?.length).toBe(1);
    expect(tab).toMatch(/data-slot="household-charts"[^>]*wide:grid-cols-2/);
    expect(tab).not.toMatch(/regular:grid-cols-/);
  });
});

describe("Batch 5: pages sit in the shared SectionPage column", () => {
  const PAGES = [
    "src/app/(app)/admin/inbox/page.tsx",
    "src/app/(app)/admin/(env)/integrations/page.tsx",
    "src/app/(app)/admin/(env)/system/page.tsx",
    "src/app/(app)/feedback/page.tsx",
    "src/app/(app)/whats-new/page.tsx",
    "src/app/(app)/admin/announcements/page.tsx",
    "src/app/(app)/admin/feedback/page.tsx",
  ];
  for (const f of PAGES) {
    it(`${f} renders through SectionPage (report width, centred, no PageHeader wrapper)`, () => {
      const src = read(f);
      expect(src).toMatch(/<SectionPage\b/);
      expect(src).toMatch(/from "@\/components\/templates(\/section-page)?"/);
      expect(src).toMatch(/width="report"/);
      expect(src).toMatch(/\bcenter\b/);
      expect(src).not.toMatch(/max-w-section|max-w-3xl|max-w-4xl/);
    });
  }

  it("the integrations provider chips are ListRows carrying the configured/not-configured labels", () => {
    const src = read("src/app/(app)/admin/(env)/integrations/page.tsx");
    expect(src).toMatch(/<ListRow\b/);
    expect(src).toMatch(/configured" : "not configured"/);
  });

  it("the system stat block is a MetricGrid and the sparklines stay inside the SectionCard", () => {
    const src = read("src/app/(app)/admin/(env)/system/page.tsx");
    expect(src).toMatch(/<MetricGrid\b/);
    expect(src).toMatch(/<MiniSpark values=\{cpuHistory\}/);
  });
});

describe("Batch 5: shared pieces render as one column", () => {
  it("MetricGrid with 3 items is a 2-column grid on mobile and never widens to 4 columns", () => {
    render(
      <MetricGrid
        metrics={[
          { icon: Wallet, label: "A", value: "1" },
          { icon: Wallet, label: "B", value: "2" },
          { icon: Wallet, label: "C", value: "3" },
        ]}
        columns={3}
      />,
    );
    const grid = document.querySelector('[data-slot="metric-grid"]') as HTMLElement;
    expect(grid).not.toBeNull();
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).not.toContain("wide:grid-cols-4");
    cleanup();
  });

  it("ListRow with onPress is a button that fires the handler", () => {
    const onPress = vi.fn();
    render(<ListRow title="Mail from a@b.test" subtitle="Hello" value="new" onPress={onPress} />);
    fireEvent.click(screen.getByRole("button", { name: /Mail from a@b\.test/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
    cleanup();
  });
});

describe("Batch 5: admin inbox list renders one column and opens the thread on tap", () => {
  const ROW = {
    id: "in-1",
    category: "mailbox",
    toAddress: "support@reika.test",
    fromAddress: "customer@example.test",
    subject: "Pricing question",
    bodyText: "hi",
    attachmentCount: 0,
    receivedAt: "2026-10-10T08:00:00.000Z",
    expiresAt: null,
    triagedAt: null,
  };
  const THREAD = {
    id: "in-1",
    category: "mailbox",
    subject: "Pricing question",
    counterparty: "customer@example.test",
    triagedAt: null,
    messages: [
      {
        kind: "inbound",
        id: "m1",
        fromAddress: "customer@example.test",
        toAddress: "support@reika.test",
        subject: "Pricing question",
        bodyText: "How much is the plan?",
        bodyHtml: null,
        at: "2026-10-10T08:00:00.000Z",
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.endsWith("/thread") ? THREAD : [ROW];
        return { ok: true, status: 200, json: async () => body } as Response;
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists the email as a row (no split pane) and opens the conversation on tap", async () => {
    const { default: AdminInboxPage } = await import("@/app/(app)/admin/inbox/page");
    render(<AdminInboxPage />);
    const rowBtn = await screen.findByRole("button", { name: /customer@example\.test/ });
    expect(screen.queryByText("Select a message to read and reply.")).toBeNull();
    fireEvent.click(rowBtn);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText("How much is the plan?")).toBeTruthy());
    expect(within(dialog).getByRole("button", { name: "Close thread" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Delete email" })).toBeTruthy();
  });
});
