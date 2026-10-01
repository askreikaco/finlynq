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
import { SharingTab } from "@/app/(app)/family/_components/sharing-tab";
import { OverviewTab } from "@/app/(app)/family/_components/overview-tab";
import { MFA_SETUP_HREF } from "@/lib/family/strings";
import { FAMILY_SECTIONS_V1 } from "@/lib/family/sections";

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
    { date: "2026-01-31", value: net - 500 },
    { date: "2026-06-30", value: net },
  ],
  historyFxApproximation: false,
});

const ME = member({
  sections: {
    net_worth: nw(1000),
    accounts: {
      accounts: [
        {
          ref: "a1", label: "My Checking", labelIsGeneric: false, type: "checking", group: "Cash", archived: false,
          currency: "USD", balance: 250, converted: 250, basis: "ledger", asOf: null,
        },
      ],
      groups: [],
    },
    goals: {
      goals: [
        {
          ref: "g1", label: "House", labelIsGeneric: false, type: "savings", status: "active", currency: "USD",
          targetAmount: 1000, currentAmount: 250, progress: 25, remaining: 750, monthlyNeeded: 50, deadline: "2027-03-05",
        },
      ],
    },
  },
});
const ALICE = member({
  id: SID,
  relation: "shared",
  name: "Alice",
  sections: { net_worth: nw(2000) },
  notShared: ["accounts", "investments", "goals", "budgets", "loans", "cashflow"],
});
const overviewBody = (members: unknown[], o: Record<string, unknown> = {}) => ({
  displayCurrency: "USD",
  period: "1y",
  asOf: "2026-10-01",
  partial: false,
  members,
  ...o,
});

const share = (o: Record<string, unknown> = {}) => ({
  id: SID,
  role: "owner",
  status: "active",
  sections: ["net_worth", "accounts"],
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
  window.history.replaceState(null, "", "/family");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ───────────────────────── Overview ─────────────────────────
describe("Overview tab", () => {
  it("renders members, sections and household totals from /api/family/overview", async () => {
    installFetch({ "GET /api/family/overview": json(overviewBody([ME, ALICE])) });
    render(<OverviewTab />);

    expect(await screen.findByText("My Checking")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy(); // shared member card title
    expect(screen.getByText("House")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy(); // progress is already 0..100
    // household = 1000 + 2000 (both share net worth, complete data)
    const kpi = screen.getByText("Net Worth", { selector: "div,h3,p,[data-slot=card-title]" });
    expect(kpi).toBeTruthy();
    expect(screen.getAllByText("$3,000.00").length).toBeGreaterThan(0);
    expect(callsTo("GET", "/api/family/overview")[0].search).toBe("?period=1y");
    // asOf rendered dd/mm/yyyy
    expect(screen.getByText(/01\/10\/2026/)).toBeTruthy();
  });

  it("notShared sections render as 'Not shared' chips, never as 0 or an empty section", async () => {
    installFetch({ "GET /api/family/overview": json(overviewBody([ALICE])) });
    const { container } = render(<OverviewTab />);
    const card = await screen.findByTestId(`member-${SID}`);

    expect(within(card).getByText("Not shared")).toBeTruthy();
    for (const label of ["Accounts", "Investments", "Goals", "Budgets", "Loans", "Cashflow"]) {
      expect(within(card).getByText(label)).toBeTruthy(); // as a chip
    }
    // no section box (h4) for them and no zero amounts anywhere in the card
    const headings = Array.from(card.querySelectorAll("h4")).map((h) => h.textContent);
    expect(headings).not.toContain("Loans");
    expect(headings).not.toContain("Accounts");
    expect(card.textContent).not.toMatch(/\$0(\.00)?(?!\d)/);
    expect(container.textContent).not.toMatch(/\b0%/);
  });

  it("excludes notShared / partial members from household totals and says so", async () => {
    const noNw = member({ id: SID2, relation: "shared", name: "Bob", sections: { goals: { goals: [] } }, notShared: ["net_worth"] });
    const partial = member({
      id: "44444444-4444-4444-8444-444444444444", relation: "shared", name: "Carol", sections: { net_worth: nw(5000) },
      partial: true, partialReasons: ["fx_rate_missing"],
    });
    installFetch({ "GET /api/family/overview": json(overviewBody([ME, noNw, partial], { partial: true })) });
    render(<OverviewTab />);
    await screen.findByText("My Checking");

    const note = screen.getByTestId("household-note");
    // only ME (1000) is counted; Carol's 5000 and Bob's missing net worth are not
    expect(screen.getAllByText("$1,000.00").length).toBeGreaterThan(0);
    expect(screen.queryByText("$6,000.00")).toBeNull();
    expect(note.textContent).toMatch(/Bob \(net worth not shared\)/);
    expect(note.textContent).toMatch(/Carol \(partial data\)/);
    expect(screen.getByText("Some rates unavailable — partial amounts shown")).toBeTruthy();
  });

  it("shows a dash, not 0, when no member qualifies for the household total", async () => {
    installFetch({ "GET /api/family/overview": json(overviewBody([member({ sections: {}, notShared: ["net_worth"] })])) });
    render(<OverviewTab />);
    expect(await screen.findByText(/No member shares complete net worth data/)).toBeTruthy();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it("shows the generic-label hint and per-row marker when labels fell back", async () => {
    const generic = member({
      sections: {
        accounts: {
          accounts: [
            { ref: "a1", label: "Account #1 - checking - USD", labelIsGeneric: true, type: "checking", group: "Cash",
              archived: false, currency: "USD", balance: 10, converted: 10, basis: "ledger", asOf: null },
          ],
          groups: [],
        },
      },
      genericLabels: true,
    });
    installFetch({ "GET /api/family/overview": json(overviewBody([generic])) });
    render(<OverviewTab />);
    expect(await screen.findByText("Some labels encrypted — shown generically")).toBeTruthy();
    expect(screen.getByText("Account #1 - checking - USD").getAttribute("title")).toBe("Generic labels");
  });

  it("403 mfa_required shows the 2FA CTA linking to the real 2FA settings route", async () => {
    installFetch({ "GET /api/family/overview": json({ error: "mfa_required", message: "x" }, 403) });
    render(<OverviewTab />);
    const link = await screen.findByRole("link", { name: "Set up 2FA" });
    expect(link.getAttribute("href")).toBe("/settings/account");
    expect(MFA_SETUP_HREF).toBe("/settings/account");
    expect(screen.queryByText("Net Worth")).toBeNull();
  });

  it("429 shows the rate limit message with a retry that refetches", async () => {
    installFetch({
      "GET /api/family/overview": [
        json({ error: "Too many requests. Try again later." }, 429),
        json(overviewBody([ME])),
      ],
    });
    render(<OverviewTab />);
    expect(await screen.findByText("Too many requests. Try again later.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("My Checking")).toBeTruthy();
    expect(callsTo("GET", "/api/family/overview")).toHaveLength(2);
  });

  it("switching the period refetches with that period", async () => {
    installFetch({ "GET /api/family/overview": json(overviewBody([ME])) });
    render(<OverviewTab />);
    await screen.findByText("My Checking");
    await user.click(screen.getByRole("button", { name: "Last 6 months" }));
    await waitFor(() => expect(callsTo("GET", "/api/family/overview")).toHaveLength(2));
    expect(callsTo("GET", "/api/family/overview")[1].search).toBe("?period=6m");
    await user.click(screen.getByRole("button", { name: "All time" }));
    await waitFor(() => expect(callsTo("GET", "/api/family/overview")).toHaveLength(3));
    expect(callsTo("GET", "/api/family/overview")[2].search).toBe("?period=all");
  });

  it("renders labels and names as text (no HTML injection)", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    const m = member({
      id: SID, relation: "shared", name: evil,
      sections: {
        goals: {
          goals: [
            { ref: "g", label: evil, labelIsGeneric: false, type: "t", status: "active", currency: "USD",
              targetAmount: 10, currentAmount: 1, progress: 10, remaining: 9, monthlyNeeded: null, deadline: null },
          ],
        },
      },
    });
    installFetch({ "GET /api/family/overview": json(overviewBody([m])) });
    const { container } = render(<OverviewTab />);
    await screen.findAllByText(evil);
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("<img");
  });

  it("formats money with the app helpers: VND without decimals, dates dd/mm/yyyy", async () => {
    installFetch({
      "GET /api/family/overview": json(overviewBody([member({ sections: { net_worth: nw(1234567000) } })], { displayCurrency: "VND" })),
    });
    render(<OverviewTab />);
    await screen.findByTestId("member-me");
    expect(screen.getAllByText(/₫\s?1,234,567,000$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Converted to VND at 01\/10\/2026 rates/)).toBeTruthy();
  });

  it("charts expose a text alternative per member (net worth + investments trend)", async () => {
    const m = member({
      sections: {
        net_worth: nw(1000),
        investments: {
          holdingsValue: 900, asOf: "2026-09-30", accountsPriced: 1, accountsUnpriced: 0,
          holdings: [{ ref: "h", label: "VN30 ETF", labelIsGeneric: false, currency: "VND", quantity: 10, isCrypto: false }],
          trend: [{ date: "2026-08-01", value: 800 }, { date: "2026-09-30", value: 900 }],
        },
      },
    });
    installFetch({ "GET /api/family/overview": json(overviewBody([m])) });
    render(<OverviewTab />);
    await screen.findByTestId("member-me");
    const imgs = screen.getAllByRole("img");
    const labels = imgs.map((i) => i.getAttribute("aria-label") ?? "");
    expect(labels.some((l) => l.startsWith("Net worth trend for Minh") && l.includes("31/01/2026"))).toBe(true);
    expect(labels.some((l) => l.startsWith("Investments trend for Minh") && l.includes("30/09/2026"))).toBe(true);
    expect(screen.getByText("VN30 ETF")).toBeTruthy();
  });
});

// ───────────────────────── Page / tabs ─────────────────────────
describe("Family page tabs", () => {
  it("tabs are keyboard operable (arrow keys move selection)", async () => {
    installFetch({
      "GET /api/family/overview": json(overviewBody([ME])),
      "GET /api/family/manage/list": json(listBody()),
    });
    render(<FamilyPage />);
    const overviewTab = await screen.findByRole("tab", { name: "Overview" });
    overviewTab.focus();
    expect(overviewTab.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Sharing" })));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("tab", { name: "Sharing" }).getAttribute("aria-selected")).toBe("true"));
    expect(await screen.findByText("I share")).toBeTruthy();
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
    await user.click(within(dialog).getByLabelText(/^Budgets/)); // uncheck budgets
    await user.click(within(dialog).getByLabelText(/^Loans/)); // uncheck loans
    await user.click(within(dialog).getByLabelText("Require them to share back"));
    // disclosure follows the selection
    const disclosure = within(dialog).getByRole("region", { name: "Share disclosure" });
    expect(within(disclosure).queryByText("Budgets")).toBeNull();
    expect(within(disclosure).queryByText("Loans")).toBeNull();
    expect(within(disclosure).getByText("Accounts")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(callsTo("POST", "/api/family/manage/invite")).toHaveLength(1));
    const body = callsTo("POST", "/api/family/manage/invite")[0].body;
    expect(body).toEqual({
      viewerEmail: "Family@Example.com",
      sections: FAMILY_SECTIONS_V1.filter((s) => s !== "budgets" && s !== "loans"),
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
      "GET /api/family/manage/list": json(listBody([share({ sections: ["net_worth", "accounts"] })])),
      "PUT /api/family/manage/update-sections": json(share({ sections: ["net_worth"] })),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    expect((within(dialog).getByLabelText(/^Net Worth/) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText(/^Goals/) as HTMLInputElement).checked).toBe(false);
    expect((within(dialog).getByRole("button", { name: "Save sections" }) as HTMLButtonElement).disabled).toBe(true); // unchanged
    await user.click(within(dialog).getByLabelText(/^Accounts/));
    await user.click(within(dialog).getByRole("button", { name: "Save sections" }));
    expect(await screen.findByText("Sections updated")).toBeTruthy();
    expect(callsTo("PUT", "/api/family/manage/update-sections")).toHaveLength(1);
    expect(callsTo("PUT", "/api/family/manage/update-sections")[0].body).toEqual({ shareId: SID, sections: ["net_worth"] });
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("change sections, widen: step-up then retry with currentPassword", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ sections: ["net_worth"] })])),
      "PUT /api/family/manage/update-sections": [STEP_UP_401(), json(share({ sections: ["net_worth", "goals"] }))],
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    await user.click(within(dialog).getByLabelText(/^Goals/));
    await user.click(within(dialog).getByRole("button", { name: "Save sections" }));
    await user.type(await screen.findByLabelText("Password"), "pw-123");
    await user.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("Sections updated")).toBeTruthy();
    const puts = callsTo("PUT", "/api/family/manage/update-sections");
    expect(puts).toHaveLength(2);
    expect(puts[0].body).toEqual({ shareId: SID, sections: ["net_worth", "goals"] });
    expect(puts[1].body).toEqual({ shareId: SID, sections: ["net_worth", "goals"], currentPassword: "pw-123" });
  });

  it("change sections: reciprocal shrink below the required minimum shows the 409 message", async () => {
    installFetch({
      "GET /api/family/manage/list": json(listBody([share({ sections: ["net_worth", "accounts"] })])),
      "PUT /api/family/manage/update-sections": json(
        { error: "Cannot remove sections required for must-share-back", requiredSections: ["accounts"] },
        409,
      ),
    });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    await user.click(within(dialog).getByLabelText(/^Accounts/));
    await user.click(within(dialog).getByRole("button", { name: "Save sections" }));
    expect(await within(dialog).findByText(/Cannot remove sections required for must-share-back \(Accounts\)/)).toBeTruthy();
    expect(callsTo("PUT", "/api/family/manage/update-sections")).toHaveLength(1);
  });

  it("must-share-back minimum is shown as locked, checked boxes on the reciprocal share", async () => {
    const parent = share({
      id: PARENT, role: "viewer", mustShareBack: true, requiredBackSections: ["net_worth", "accounts"],
      counterparty: { name: "Alice" },
    });
    const recip = share({ isReciprocal: true, reciprocalOf: PARENT, sections: ["net_worth", "accounts", "goals"], counterparty: { email: "alice@example.com", name: "Alice" } });
    installFetch({ "GET /api/family/manage/list": json(listBody([recip], [parent])) });
    render(<SharingTab />);
    await user.click(await screen.findByRole("button", { name: "Change sections" }));
    const dialog = await screen.findByRole("dialog", { name: "Change shared sections" });
    for (const re of [/^Net Worth/, /^Accounts/]) {
      const box = within(dialog).getByLabelText(re) as HTMLInputElement;
      expect(box.checked).toBe(true);
      expect(box.disabled).toBe(true);
    }
    expect((within(dialog).getByLabelText(/^Goals/) as HTMLInputElement).disabled).toBe(false);
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
    "GET /api/family/overview": json(overviewBody([ME])),
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
    await screen.findByText("My Checking");
    expect(screen.queryByRole("button", { name: "Accept invite" })).toBeNull();
  });
});
