/**
 * @vitest-environment jsdom
 *
 * Family Wealth P5: component tests against the REAL API shapes (src/lib/family/overview/dto.ts,
 * manage-guard.ts:toShareDto, the /api/family/manage/* routes) with a mocked fetch. Components,
 * dialogs and charts are not mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FamilyPage from "@/app/(app)/family/page";
import FamilySharePage from "@/app/(app)/family/share/page";
import { SharingTab } from "@/app/(app)/family/_components/sharing-tab";
import { OverviewTab } from "@/app/(app)/family/_components/overview-tab";
import { legacySharingRedirect } from "@/app/(app)/family/_components/share-path";
import { MFA_SETUP_HREF } from "@/lib/family/strings";
import { FAMILY_OVERVIEW_SECTIONS } from "@/lib/family/sections";

const routerReplace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  usePathname: () => "/family",
}));
// Dashboard cards count up from 0 with framer-motion; jump straight to the value in tests.
vi.mock("framer-motion", async (orig) => {
  const actual = await orig<typeof import("framer-motion")>();
  return {
    ...actual,
    animate: (_from: number, to: number, opts?: { onUpdate?: (v: number) => void }) => {
      opts?.onUpdate?.(to);
      return { stop() {} };
    },
  };
});

// ───────────────────────── fetch harness ─────────────────────────
interface Call {
  method: string;
  path: string;
  search: string;
  url: string;
  body: Record<string, unknown> | null;
}
type Responder = Response | ((call: Call) => Response | Promise<Response>);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let calls: Call[] = [];

/** routes: "METHOD /path" -> Response | fn | array (served in order, last one repeats). */
function installFetch(routes: Record<string, Responder | Responder[]>) {
  const counters = new Map<string, number>();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();
      const call: Call = {
        method,
        path: url.pathname,
        search: url.search,
        url: url.pathname + url.search,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      };
      calls.push(call);
      const key = `${method} ${url.pathname}`;
      const r = routes[key];
      if (!r) throw new Error(`unmocked fetch ${key}`);
      let pick: Responder = r as Responder;
      if (Array.isArray(r)) {
        const n = counters.get(key) ?? 0;
        counters.set(key, n + 1);
        pick = r[Math.min(n, r.length - 1)];
      }
      const res = typeof pick === "function" ? await pick(call) : pick;
      return res.clone();
    }),
  );
}
const callsTo = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

// ───────────────────────── fixtures ─────────────────────────
const SID = "11111111-1111-4111-8111-111111111111";
const SID2 = "22222222-2222-4222-8222-222222222222";
const PARENT = "33333333-3333-4333-8333-333333333333";

const member = (o: Record<string, unknown>) => ({
  id: "me",
  relation: "me",
  name: "Minh",
  sections: {},
  notShared: [],
  unavailable: [],
  partial: false,
  partialReasons: [],
  genericLabels: false,
  ...o,
});

const nw = (net: number, assets = net + 100, liabilities = 100) => ({
  assets,
  liabilities,
  net,
  history: [
    { date: "2026-10-01", value: net - 500 },
    { date: "2026-10-02", value: net },
  ],
  historyFxApproximation: false,
});

const cashflow = (o: Record<string, unknown> = {}) => ({
  from: "2026-10-01",
  windowMonths: 1,
  income: 3000,
  expenses: 1200,
  monthly: [{ month: "2026-10", income: 3000, expenses: 1200 }],
  daily: [
    { date: "2026-10-01", income: 3000, expenses: 0 },
    { date: "2026-10-02", income: 0, expenses: 1200 },
  ],
  savings: { income: 3000, expenses: 1200, ratePct: 60 },
  debtToIncome: { pct: 25, reliable: true, debtPayments12m: 9000, income12m: 36000 },
  ...o,
});

const investments = {
  holdingsValue: 900,
  asOf: "2026-09-30",
  accountsPriced: 1,
  accountsUnpriced: 0,
  performance: {
    from: "2026-10-01",
    to: "2026-10-01",
    series: [
      { date: "2026-09-01", marketValue: 800, costBasis: 700 },
      { date: "2026-09-30", marketValue: 900, costBasis: 700 },
    ],
    twrr: { period: 0.05, annualized: 0.6 },
    mwrr: { irr: 0.04, converged: true },
    gapsFilledDays: 0,
  },
};

const loans = {
  loans: [
    {
      ref: "l1", label: "Car loan", labelIsGeneric: false, type: "auto", currency: "USD", principal: 10000, annualRate: 5,
      remainingBalance: 4000, remainingBalanceConverted: 4000, balanceSource: "projection", monthlyPayment: 300, payoffDate: "2027-12-01",
    },
  ],
};

const ME = member({ sections: { net_worth: nw(1000), cashflow: cashflow(), investments, loans } });
const ALICE = member({
  id: SID,
  relation: "shared",
  name: "Alice",
  sections: { net_worth: nw(2000) },
  notShared: ["investments", "loans", "cashflow"],
});
const overviewBody = (members: unknown[], o: Record<string, unknown> = {}) => ({
  displayCurrency: "USD",
  period: "month",
  asOf: "2026-10-01",
  partial: false,
  members,
  ...o,
});
const MOVERS = {
  topGainers: [{ key: "AAPL", symbol: "AAPL", name: "Apple", image: null, dayChangeDisplay: 12, changePct: 1.2 }],
  topLosers: [],
};
/** overview + the viewer's own portfolio movers (fetched for "me" only) */
const ovRoutes = (body: unknown, extra: Record<string, Responder | Responder[]> = {}) => ({
  "GET /api/family/overview": json(body),
  "GET /api/portfolio/overview": json(MOVERS),
  ...extra,
});

const share = (o: Record<string, unknown> = {}) => ({
  id: SID,
  role: "owner",
  status: "active",
  sections: ["net_worth", "loans"],
  mustShareBack: false,
  requiredBackSections: [],
  isReciprocal: false,
  reciprocalOf: null,
  reconsentRequired: false,
  reconsentSections: [],
  createdAt: "2026-09-01T10:00:00.000Z",
  counterparty: { email: "bob@example.com", name: "Bob" },
  ...o,
});
const listBody = (outgoing: unknown[] = [], incoming: unknown[] = []) => ({ outgoing, incoming });

const STEP_UP_401 = () => json({ error: "Step-up required: provide currentPassword or sign in again", code: "step_up_required" }, 401);

let user: ReturnType<typeof userEvent.setup>;
beforeEach(() => {
  user = userEvent.setup();
  routerReplace.mockReset();
  window.history.replaceState(null, "", "/family");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const titles = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("[data-slot=card-title], .uppercase")).map((n) => n.textContent?.trim());

// ───────────────────────── Overview ─────────────────────────
describe("Overview", () => {
  it("defaults to Everyone + This month, sends period=month, and renders the household and fetches lifetime data for charts", async () => {
    installFetch(ovRoutes(overviewBody([ME, ALICE])));
    render(<OverviewTab />);
    const household = await screen.findByTestId("household");
    // Fetches period=month for main data
    expect(callsTo("GET", "/api/family/overview")[0].search).toBe("?period=month");
    // Fetches period=all separately for chart data
    expect(callsTo("GET", "/api/family/overview")[1].search).toBe("?period=all");
    expect(screen.getByRole("radio", { name: /Everyone/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "This month" }).getAttribute("aria-checked")).toBe("true");
    // household net worth = 1000 + 2000 (both share net worth with complete data)
    expect(within(household).getAllByText("$3,000.00").length).toBeGreaterThan(0);
    // household income/expenses: only ME shares cashflow; Alice is listed as left out
    expect(within(household).getAllByText("$3,000.00").length).toBeGreaterThan(0);
    expect(within(household).getByText("$1,200.00")).toBeTruthy();
    expect(screen.getByTestId("household-note").textContent).toMatch(/Alice \(not shared\)/);
    // asOf rendered dd/mm/yyyy
    expect(screen.getAllByText(/01\/10\/2026/).length).toBeGreaterThan(0);
  });

  it("member card shows the dashboard / reports / portfolio cards and no Accounts / Goals / Budgets", async () => {
    installFetch(ovRoutes(overviewBody([ME])));
    render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Minh/ }));
    const card = await screen.findByTestId("member-me");
    await within(card).findByText("AAPL"); // Top Gainers from the viewer's own /api/portfolio/overview
    const t = titles(card);
    for (const title of [
      "Total Net Worth", "Monthly Income", "Monthly Expenses", "Savings Rate", "Debt-to-Income",
      "Net Worth Over Time", "Income vs Expenses", "Performance", "Top Gainers", "Top Losers", "Loans",
    ]) {
      expect(t.some((x) => x?.toLowerCase() === title.toLowerCase()), title).toBe(true);
    }
    for (const gone of ["Accounts", "Goals", "Budgets", "Investments"]) {
      expect(t.some((x) => x === gone), gone).toBe(false);
    }
    expect(within(card).getByText("60%")).toBeTruthy(); // savings rate
    expect(within(card).getByText("25%")).toBeTruthy(); // DTI
    expect(within(card).getByText(/TWRR \(period\)/)).toBeTruthy();
    expect(within(card).getByText("Car loan")).toBeTruthy();
    expect(callsTo("GET", "/api/portfolio/overview")[0].search).toBe("?currency=USD");
  });

  it("not-shared data renders as 'Not shared' (chips + dashes), never as 0", async () => {
    installFetch(ovRoutes(overviewBody([ALICE])));
    render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Alice/ }));
    const card = await screen.findByTestId(`member-${SID}`);
    expect(within(card).getAllByText("Not shared").length).toBeGreaterThan(0);
    for (const label of ["Investments", "Loans", "Cashflow"]) {
      expect(within(card).getByText(label)).toBeTruthy(); // as a chip
    }
    // no charts / performance / movers / loans for unshared sections
    const t = titles(card);
    for (const absent of ["Performance", "Top Gainers", "Income vs Expenses", "Loans"]) {
      expect(t.includes(absent), absent).toBe(false);
    }
    expect(within(card).getByText("Needs Loans and Cashflow shared")).toBeTruthy();
    expect(card.textContent).not.toMatch(/\$0(\.00)?(?!\d)/);
    expect(card.textContent).not.toMatch(/\b0%/);
    // a shared member never triggers the viewer's own portfolio fetch
    expect(callsTo("GET", "/api/portfolio/overview")).toHaveLength(0);
  });

  it("debt-to-income shows the not-shared state when loans are not shared, even with cashflow", async () => {
    const bob = member({
      id: SID2, relation: "shared", name: "Bob",
      sections: { cashflow: cashflow({ debtToIncome: null }) }, notShared: ["net_worth", "investments", "loans"],
    });
    installFetch(ovRoutes(overviewBody([bob])));
    render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Bob/ }));
    const card = await screen.findByTestId(`member-${SID2}`);
    expect(within(card).getByText("60%")).toBeTruthy();
    expect(within(card).getByText("Needs Loans and Cashflow shared")).toBeTruthy();
    expect(within(card).queryByText("25%")).toBeNull();
  });

  it("selecting a member shows only that member (no household block)", async () => {
    installFetch(ovRoutes(overviewBody([ME, ALICE])));
    render(<OverviewTab />);
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Alice/ }));
    expect(screen.getByRole("radio", { name: /Alice/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("household")).toBeNull();
    expect(screen.getByTestId(`member-${SID}`)).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /Minh/ }));
    expect(screen.getByTestId("member-me")).toBeTruthy();
    expect(screen.queryByTestId(`member-${SID}`)).toBeNull();
    await user.click(screen.getByRole("radio", { name: /Everyone/ }));
    expect(screen.getByTestId("household")).toBeTruthy();
  });

  it("excludes notShared / partial members from household totals and says so", async () => {
    const noNw = member({ id: SID2, relation: "shared", name: "Bob", sections: { loans: { loans: [] } }, notShared: ["net_worth"] });
    const partial = member({
      id: "44444444-4444-4444-8444-444444444444", relation: "shared", name: "Carol", sections: { net_worth: nw(5000) },
      partial: true, partialReasons: ["fx_rate_missing"],
    });
    installFetch(ovRoutes(overviewBody([ME, noNw, partial], { partial: true })));
    render(<OverviewTab />);
    const household = await screen.findByTestId("household");
    const note = screen.getByTestId("household-note");
    // only ME (1000) is counted; Carol's 5000 and Bob's missing net worth are not
    expect(within(household).getAllByText("$1,000.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$6,000.00")).toBeNull();
    expect(note.textContent).toMatch(/Bob \(net worth not shared\)/);
    expect(note.textContent).toMatch(/Carol \(partial data\)/);
    expect(screen.getByText("Some rates unavailable — partial amounts shown")).toBeTruthy();
  });

  it("shows a dash, not 0, when no member qualifies for the household total", async () => {
    installFetch(ovRoutes(overviewBody([member({ sections: {}, notShared: ["net_worth", "cashflow"] })])));
    render(<OverviewTab />);
    expect((await screen.findAllByText(/No member shares complete net worth data/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it("generic loan labels are marked and explained", async () => {
    const generic = member({
      sections: { loans: { loans: [{ ...loans.loans[0], label: "Loan 1", labelIsGeneric: true }] } },
      notShared: ["net_worth", "investments", "cashflow"],
      genericLabels: true,
    });
    installFetch(ovRoutes(overviewBody([generic])));
    render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Minh/ }));
    expect(await screen.findByText("Some labels encrypted — shown generically")).toBeTruthy();
    expect(screen.getByText("Loan 1").getAttribute("title")).toBe("Generic labels");
  });

  it("403 mfa_required shows the 2FA CTA linking to the real 2FA settings route", async () => {
    installFetch({ "GET /api/family/overview": json({ error: "mfa_required", message: "x" }, 403) });
    render(<OverviewTab />);
    const link = await screen.findByRole("link", { name: "Set up 2FA" });
    expect(link.getAttribute("href")).toBe("/settings/account");
    expect(MFA_SETUP_HREF).toBe("/settings/account");
    expect(screen.queryByText("Total Net Worth")).toBeNull();
  });

  it("429 shows the rate limit message with a retry that refetches", async () => {
    installFetch(ovRoutes(overviewBody([ME]), {
      "GET /api/family/overview": [
        json({ error: "Too many requests. Try again later." }, 429),
        json(overviewBody([ME])),
        json(overviewBody([ME], { period: "all" })),
      ],
    }));
    render(<OverviewTab />);
    expect(await screen.findByText("Too many requests. Try again later.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("household")).toBeTruthy();
    // Initial fetch failed, then succeeds for month + all
    expect(callsTo("GET", "/api/family/overview").length).toBeGreaterThanOrEqual(2);
  });

  it("the time range refetches with month / year / all; charts always get lifetime data", async () => {
    installFetch(ovRoutes(overviewBody([ME])));
    render(<OverviewTab />);
    await screen.findByTestId("household");
    // Initial: period=month for main + period=all for charts
    expect(callsTo("GET", "/api/family/overview")).toHaveLength(2);
    expect(callsTo("GET", "/api/family/overview")[0].search).toBe("?period=month");
    expect(callsTo("GET", "/api/family/overview")[1].search).toBe("?period=all");

    await user.click(screen.getByRole("radio", { name: "This year" }));
    await waitFor(() => expect(callsTo("GET", "/api/family/overview").length).toBeGreaterThan(2));
    expect(callsTo("GET", "/api/family/overview").find((c) => c.search === "?period=year")).toBeTruthy();

    await user.click(screen.getByRole("radio", { name: "All time" }));
    await waitFor(() => {
      const withAllTime = callsTo("GET", "/api/family/overview").filter((c) => c.search === "?period=all");
      expect(withAllTime.length).toBeGreaterThanOrEqual(2); // One for initial chart fetch, one for time selection
    });
    // the old rolling windows are no longer offered in the UI
    expect(screen.queryByRole("radio", { name: "Last 6 months" })).toBeNull();
  });

  it("flow cards read naturally for the range (Income / Expenses with a caption); charts always show All time", async () => {
    installFetch(ovRoutes(overviewBody([ME], { period: "year" })));
    render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Minh/ }));
    const card = await screen.findByTestId("member-me");
    const t = titles(card).map((x) => x?.toLowerCase());
    expect(t).toContain("income");
    expect(t).toContain("expenses");
    expect(t).not.toContain("monthly income");
    expect(within(card).getAllByText(/This year/).length).toBeGreaterThan(0);
    // Charts are fed from lifetime data, so they caption "All time"
    expect(within(card).getAllByText(/All time/).length).toBeGreaterThan(0);
  });

  it("renders labels and names as text (no HTML injection)", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const m = member({
      id: SID, relation: "shared", name: evil,
      sections: { loans: { loans: [{ ...loans.loans[0], label: evil }] } },
      notShared: ["net_worth", "investments", "cashflow"],
    });
    installFetch(ovRoutes(overviewBody([m])));
    const { container } = render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    // The member name is escaped as text, so we can find it by the exact string
    await user.click(screen.getByRole("radio", { name: new RegExp(evil.split(" ")[0]) })); // First word is the aria-label
    await screen.findAllByText(evil);
    // No actual img elements are rendered (HTML is properly escaped)
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });

  it("formats money with the app helpers: VND without decimals, dates dd/mm/yyyy", async () => {
    installFetch(ovRoutes(overviewBody([member({ sections: { net_worth: nw(1234567000) }, notShared: ["investments", "loans", "cashflow"] })], { displayCurrency: "VND" })));
    render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Minh/ }));
    await screen.findByTestId("member-me");
    expect(screen.getAllByText(/₫\s?1,234,567,000$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Converted to VND at 01\/10\/2026 rates/)).toBeTruthy();
  });

  it("charts expose a text alternative per member (net worth over time)", async () => {
    installFetch(ovRoutes(overviewBody([ME])));
    render(<OverviewTab />);
    // Wait for household to load, then select the individual member to see the member card
    await screen.findByTestId("household");
    await user.click(screen.getByRole("radio", { name: /Minh/ }));
    const card = await screen.findByTestId("member-me");
    const labels = within(card).getAllByRole("img").map((i) => i.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.startsWith("Net Worth Over Time for Minh") && l.includes("02/10/2026"))).toBe(true);
  });
});

// ───────────────────────── Page / share page ─────────────────────────
describe("Family page", () => {
  it("has no tabs; a Share icon in the header links to /family/share", async () => {
    installFetch(ovRoutes(overviewBody([ME])));
    render(<FamilyPage />);
    // Wait for household to load (showing Everyone by default)
    await screen.findByTestId("household");
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    const link = screen.getByRole("link", { name: "Share" });
    expect(link.getAttribute("href")).toBe("/family/share");
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("legacy /family?tab=sharing redirects to /family/share keeping the other params", async () => {
    window.history.replaceState(null, "", "/family?tab=sharing&x=1");
    installFetch(ovRoutes(overviewBody([ME])));
    render(<FamilyPage />);
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/family/share?x=1"));
  });

  it("legacySharingRedirect never redirects an invite link", () => {
    expect(legacySharingRedirect("?tab=sharing")).toBe("/family/share");
    expect(legacySharingRedirect("?tab=overview")).toBeNull();
    expect(legacySharingRedirect("")).toBeNull();
    expect(legacySharingRedirect("?tab=sharing&token=abc")).toBeNull();
  });

  it("/family/share renders the sharing list with a back link to /family", async () => {
    installFetch({ "GET /api/family/manage/list": json(listBody([share({ status: "pending" })])) });
    render(<FamilySharePage />);
    expect(await screen.findByText("bob@example.com")).toBeTruthy();
    expect(screen.getByText("I share")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Family Wealth" }).getAttribute("href")).toBe("/family");
  });
});

// ───────────────────────── Sharing tab ─────────────────────────
describe("Sharing tab: list", () => {
  it("lists outgoing and incoming shares with status and sections", async () => {
    installFetch({
      "GET /api/family/manage/list": json(
        listBody(
          [share({ status: "pending" })],
          [share({ id: SID2, role: "viewer", counterparty: { name: "Alice" }, sections: ["net_worth"] })],
        ),
      ),
    });
    render(<SharingTab />);
    expect(await screen.findByText("bob@example.com")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });
});

describe("Invite dialog", () => {
  const openInvite = async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody()),
      "POST /api/family/manage/invite": json({ shareId: SID }, 201),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: /Invite/ }));
    return screen.findByRole("dialog", { name: "Invite family member" });
  };

  it("shows the net-worth disclosure and sends the exact payload (email, sections, mustShareBack)", async () => {
    const dialog = await openInvite();
    // disclosure visible before sending
    expect(within(dialog).getByText(/They will see your total net worth, assets and liabilities/)).toBeTruthy();

    await user.type(within(dialog).getByLabelText("Email address"), " Family@Example.com ");
    // retired sections are not offered any more
    for (const gone of [/^Accounts/, /^Goals/, /^Budgets/]) expect(within(dialog).queryByLabelText(gone)).toBeNull();
    await user.click(within(dialog).getByLabelText(/^Investments/)); // uncheck investments
    await user.click(within(dialog).getByLabelText(/^Loans/)); // uncheck loans
    await user.click(within(dialog).getByLabelText("Require them to share back"));
    // disclosure follows the selection
    const disclosure = within(dialog).getByRole("region", { name: "Share disclosure" });
    expect(within(disclosure).queryByText("Investments")).toBeNull();
    expect(within(disclosure).queryByText("Loans")).toBeNull();
    expect(within(disclosure).getByText("Cashflow")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(callsTo("POST", "/api/family/manage/invite")).toHaveLength(1));
    const body = callsTo("POST", "/api/family/manage/invite")[0].body;
    expect(body).toEqual({
      viewerEmail: "Family@Example.com",
      sections: FAMILY_OVERVIEW_SECTIONS.filter((s) => s !== "investments" && s !== "loans"),
      mustShareBack: true,
    });
    expect(await screen.findByText("Invite sent to Family@Example.com")).toBeTruthy();
    // the list was reloaded
    await waitFor(() => expect(callsTo("GET", "/api/family/manage/list").length).toBeGreaterThan(1));
  });

  it("without net worth selected the disclosure explains totals are still inferable", async () => {
    const dialog = await openInvite();
    await user.click(within(dialog).getByLabelText(/^Net Worth/));
    expect(within(dialog).getByText(/Net worth is not selected, but totals can still be worked out/)).toBeTruthy();
    expect(within(dialog).queryByText(/They will see your total net worth/)).toBeNull();
  });

  it("step-up 401 opens the password dialog; retry carries currentPassword; wrong password errors without looping", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody()),
      "POST /api/family/manage/invite": [STEP_UP_401(), STEP_UP_401(), json({ shareId: SID }, 201)],
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: /Invite/ }));
    const dialog = await screen.findByRole("dialog", { name: "Invite family member" });
    await user.type(within(dialog).getByLabelText("Email address"), "a@b.co");
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));

    const pw = await screen.findByLabelText("Password");
    expect(callsTo("POST", "/api/family/manage/invite")).toHaveLength(1);
    expect(callsTo("POST", "/api/family/manage/invite")[0].body).not.toHaveProperty("currentPassword");

    await user.type(pw, "wrong-pass");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Incorrect password")).toBeTruthy();
    expect(callsTo("POST", "/api/family/manage/invite")).toHaveLength(2);
    expect(callsTo("POST", "/api/family/manage/invite")[1].body).toMatchObject({ currentPassword: "wrong-pass" });
    // no automatic loop: still exactly 2 calls a moment later and the prompt is still there
    await new Promise((r) => setTimeout(r, 50));
    expect(callsTo("POST", "/api/family/manage/invite")).toHaveLength(2);
    expect(screen.getByLabelText("Password")).toBeTruthy();

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "right-pass");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("Invite sent to a@b.co");
    const all = callsTo("POST", "/api/family/manage/invite");
    expect(all).toHaveLength(3);
    expect(all[2].body).toMatchObject({ viewerEmail: "a@b.co", currentPassword: "right-pass", mustShareBack: false });
  });

  it("429 shows the limit message and keeps the dialog open", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody()),
      "POST /api/family/manage/invite": json({ error: "Invitation limit reached. Try again tomorrow." }, 429),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: /Invite/ }));
    const dialog = await screen.findByRole("dialog", { name: "Invite family member" });
    await user.type(within(dialog).getByLabelText("Email address"), "a@b.co");
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));
    expect(await within(dialog).findByText("Invitation limit reached. Try again tomorrow.")).toBeTruthy();
    expect(callsTo("POST", "/api/family/manage/invite")).toHaveLength(1);
  });

  it("Escape closes the dialog and fields have labels", async () => {
    const dialog = await openInvite();
    expect(within(dialog).getByRole("group", { name: "Share access to" })).toBeTruthy(); // fieldset/legend
    expect(within(dialog).getByLabelText("Email address")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("Revoke, resend, change sections", () => {
  it("revoke: confirm dialog posts {shareId} and reloads the list", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share()])),
      "POST /api/family/manage/revoke": json({ status: "revoked", rotation: "done" }),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke access" });
    expect(within(dialog).getByText(/Labels they've already seen will remain readable/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(callsTo("POST", "/api/family/manage/revoke")).toHaveLength(1));
    expect(callsTo("POST", "/api/family/manage/revoke")[0].body).toEqual({ shareId: SID });
    expect(await screen.findByText("Access ended")).toBeTruthy();
    await waitFor(() => expect(callsTo("GET", "/api/family/manage/list").length).toBeGreaterThan(1));
  });

  it("resend: pending share posts {shareId}", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ status: "pending" })])),
      "POST /api/family/manage/resend": json({ status: "resent" }),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Resend invite" }));
    expect(await screen.findByText("Invite resent")).toBeTruthy();
    expect(callsTo("POST", "/api/family/manage/resend")[0].body).toEqual({ shareId: SID });
  });

  it("resend 429 surfaces the server message", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ status: "pending" })])),
      "POST /api/family/manage/resend": json({ error: "Invitation limit reached. Try again tomorrow." }, 429),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Resend invite" }));
    expect(await screen.findByText("Invitation limit reached. Try again tomorrow.")).toBeTruthy();
  });

  it("change sections, narrow: PUT without password, no prompt", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ sections: ["net_worth", "loans"] })])),
      "PUT /api/family/manage/update-sections": json(share({ sections: ["net_worth"] })),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    expect((within(dialog).getByLabelText(/^Net Worth/) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText(/^Investments/) as HTMLInputElement).checked).toBe(false);
    expect((within(dialog).getByRole("button", { name: "Save sections" }) as HTMLButtonElement).disabled).toBe(true); // unchanged
    await user.click(within(dialog).getByLabelText(/^Loans/));
    await user.click(within(dialog).getByRole("button", { name: "Save sections" }));
    expect(await screen.findByText("Sections updated")).toBeTruthy();
    expect(callsTo("PUT", "/api/family/manage/update-sections")).toHaveLength(1);
    expect(callsTo("PUT", "/api/family/manage/update-sections")[0].body).toEqual({ shareId: SID, sections: ["net_worth"] });
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("change sections, widen: step-up then retry with currentPassword", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ sections: ["net_worth"] })])),
      "PUT /api/family/manage/update-sections": [STEP_UP_401(), json(share({ sections: ["net_worth", "investments"] }))],
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    await user.click(within(dialog).getByLabelText(/^Investments/));
    await user.click(within(dialog).getByRole("button", { name: "Save sections" }));
    await user.type(await screen.findByLabelText("Password"), "pw-123");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Sections updated")).toBeTruthy();
    const puts = callsTo("PUT", "/api/family/manage/update-sections");
    expect(puts).toHaveLength(2);
    expect(puts[0].body).toEqual({ shareId: SID, sections: ["net_worth", "investments"] });
    expect(puts[1].body).toEqual({ shareId: SID, sections: ["net_worth", "investments"], currentPassword: "pw-123" });
  });

  it("change sections: a retired section of an older share is not offered but is kept as-is", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ sections: ["net_worth", "accounts"] })])),
      "PUT /api/family/manage/update-sections": json(share({ sections: ["net_worth", "accounts", "loans"] })),
    });
    render(<SharingTab />);
    expect(await screen.findByText(/1 of 4/)).toBeTruthy(); // counts only sections the overview shows
    await user.click(screen.getByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    expect(within(dialog).queryByLabelText(/^Accounts/)).toBeNull();
    await user.click(within(dialog).getByLabelText(/^Loans/));
    await user.click(within(dialog).getByRole("button", { name: "Save sections" }));
    expect(await screen.findByText("Sections updated")).toBeTruthy();
    expect(callsTo("PUT", "/api/family/manage/update-sections")[0].body).toEqual({
      shareId: SID,
      sections: ["net_worth", "accounts", "loans"],
    });
  });

  it("change sections: reciprocal shrink below the required minimum shows the 409 message", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ sections: ["net_worth", "loans"] })])),
      "PUT /api/family/manage/update-sections": json(
        { error: "Cannot remove sections required for must-share-back", requiredSections: ["loans"] },
        409,
      ),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    await user.click(within(dialog).getByLabelText(/^Loans/));
    await user.click(within(dialog).getByRole("button", { name: "Save sections" }));
    expect(await within(dialog).findByText(/Cannot remove sections required for must-share-back \(Loans\)/)).toBeTruthy();
    expect(callsTo("PUT", "/api/family/manage/update-sections")).toHaveLength(1);
  });

  it("must-share-back minimum is shown as locked, checked boxes on the reciprocal share", async () => {
    const parent = share({
      id: PARENT, role: "viewer", mustShareBack: true, requiredBackSections: ["net_worth", "loans"],
      counterparty: { name: "Alice" },
    });
    const recip = share({ isReciprocal: true, reciprocalOf: PARENT, sections: ["net_worth", "loans", "cashflow"], counterparty: { email: "alice@example.com", name: "Alice" } });
    installFetch({ "GET /api/family/manage/list": json(listBody([recip], [parent])) });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    for (const re of [/^Net Worth/, /^Loans/]) {
      const box = within(dialog).getByLabelText(re) as HTMLInputElement;
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(true);
    }
    expect((within(dialog).getByLabelText(/^Investments/) as HTMLInputElement).disabled).toBe(false);
  });
});

describe("Re-consent", () => {
  const parent = share({
    id: PARENT, role: "viewer", mustShareBack: true, requiredBackSections: ["net_worth", "goals"],
    sections: ["net_worth", "goals"], reconsentRequired: true, reconsentSections: ["goals"],
    counterparty: { name: "Alice" },
  });
  const recip = share({
    id: SID2, isReciprocal: true, reciprocalOf: PARENT, sections: ["net_worth"],
    counterparty: { email: "alice@example.com", name: "Alice" },
  });

  it("banner offers one-click widen of my reciprocal share (union of sections, step-up on 401)", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([recip], [parent])),
      "PUT /api/family/manage/update-sections": [STEP_UP_401(), json(share({ id: SID2, sections: ["net_worth", "goals"] }))],
    });
    render(<SharingTab />);
    const btn = await screen.findByRole("button", { name: "Share back now" });
    expect(screen.getByText(/Share back to keep seeing Alice/)).toBeTruthy();
    await user.click(btn);
    await user.type(await screen.findByLabelText("Password"), "pw-xyz");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("You now share back the requested sections")).toBeTruthy();
    const puts = callsTo("PUT", "/api/family/manage/update-sections");
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual({ shareId: SID2, sections: ["net_worth", "goals"], currentPassword: "pw-xyz" });
  });

  it("no banner when nothing is pending", async () => {
    installFetch({ "GET /api/family/manage/list": json(listBody([recip], [{ ...parent, reconsentRequired: false, reconsentSections: [] }])) });
    render(<SharingTab />);
    await screen.findByText("I share");
    expect(screen.queryByRole("button", { name: "Share back now" })).toBeNull();
  });

  it("owner side shows that approval is pending", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([{ ...parent, role: "owner", counterparty: { email: "bob@example.com" } }], [])),
    });
    render(<SharingTab />);
    expect(await screen.findByText(/Waiting for approval of: Goals/)).toBeTruthy();
  });
});

// ───────────────────────── Deep link accept / decline ─────────────────────────
describe("Invite deep link (?token=)", () => {
  const TOKEN = "tok_ABC123-secret_value";
  const routes = (extra: Record<string, Responder | Responder[]> = {}) => ({
    ...ovRoutes(overviewBody([ME])),
    "GET /api/family/manage/list": json(listBody()),
    ...extra,
  });

  it("accept: posts the token in the body only, removes it from the URL, never logs it", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    window.history.replaceState(null, "", `/family?token=${TOKEN}&x=1`);
    installFetch(routes({ "POST /api/family/manage/accept": json({ shareId: SID }) }));
    render(<FamilyPage />);

    const btn = await screen.findByRole("button", { name: "Accept invite" });
    // stripped from the address bar as soon as it was read, other params preserved
    expect(window.location.search).toBe("?x=1");
    expect(window.location.href).not.toContain(TOKEN);

    await user.click(btn);
    expect(await screen.findByText(/Invite accepted/)).toBeTruthy();
    const accepts = callsTo("POST", "/api/family/manage/accept");
    expect(accepts).toHaveLength(1);
    expect(accepts[0].body).toEqual({ token: TOKEN });
    expect(window.location.href).not.toContain(TOKEN);
    // token never appears in any request URL
    expect(calls.some((c) => c.url.includes(TOKEN))).toBe(false);
    // ...nor in any console output
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(TOKEN);
  });

  it("accept with must-share-back: step-up 401 -> password -> retry includes currentPassword", async () => {
    window.history.replaceState(null, "", `/family?token=${TOKEN}`);
    installFetch(routes({ "POST /api/family/manage/accept": [STEP_UP_401(), json({ shareId: SID })] }));
    render(<FamilyPage />);
    await user.click(await screen.findByRole("button", { name: "Accept invite" }));
    await user.type(await screen.findByLabelText("Password"), "my-password");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText(/Invite accepted/)).toBeTruthy();
    const accepts = callsTo("POST", "/api/family/manage/accept");
    expect(accepts.map((a) => a.body)).toEqual([{ token: TOKEN }, { token: TOKEN, currentPassword: "my-password" }]);
    expect(window.location.search).toBe("");
  });

  it("decline: posts {token} and removes it from the URL", async () => {
    window.history.replaceState(null, "", `/family?token=${TOKEN}`);
    installFetch(routes({ "POST /api/family/manage/decline": json({ status: "declined" }) }));
    render(<FamilyPage />);
    await user.click(await screen.findByRole("button", { name: "Decline invite" }));
    expect(await screen.findByText("Invite declined.")).toBeTruthy();
    expect(callsTo("POST", "/api/family/manage/decline")[0].body).toEqual({ token: TOKEN });
    expect(window.location.search).toBe("");
  });

  it("410 shows the invalid/expired message and does not leave the token in the URL", async () => {
    window.history.replaceState(null, "", `/family?token=${TOKEN}`);
    installFetch(routes({ "POST /api/family/manage/accept": json({ error: "Invitation not found or already used" }, 410) }));
    render(<FamilyPage />);
    await user.click(await screen.findByRole("button", { name: "Accept invite" }));
    expect(await screen.findByText("This invite has expired or is no longer valid")).toBeTruthy();
    expect(window.location.search).toBe("");
  });

  it("renders nothing when there is no token", async () => {
    installFetch(routes());
    render(<FamilyPage />);
    // Wait for household to load (showing Everyone by default)
    await screen.findByTestId("household");
    expect(screen.queryByRole("button", { name: "Accept invite" })).toBeNull();
  });
});
