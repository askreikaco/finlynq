/**
 * Family Wealth end-to-end (plan P6): invite -> accept (deep link, UI) -> share back -> overview ->
 * widen + re-consent -> revoke + key rotation, plus the logged-out deep-link token-leak check.
 * Real app (next dev), real Postgres, real 2FA (TOTP), real mail capture. No mocks.
 */
import { test, expect, type Browser } from "@playwright/test";
import {
  BASE_URL,
  TestUser,
  capturedMails,
  eventually,
  inviteTokenFrom,
  sharedMembers,
  waitForMail,
  withDb,
  type Member,
} from "./family-helpers";

const CANARY_PAYEE = "CANARY_PAYEE_e2e_91ac";
const CANARY_NOTE = "CANARY_NOTE_e2e_17fd";

test.describe.configure({ mode: "serial" });

let A: TestUser;
let B: TestUser;
let C: TestUser;
let shareAB = "";
let shareBA = "";
let shareAC = "";
const accounts: Record<string, number> = {};

const overviewOf = async (u: TestUser) => u.json<{ members: Member[]; displayCurrency: string }>(await u.overview());
const inviteMail = (to: string, after = 0) => waitForMail(to, inviteTokenFrom, { after });

test.beforeAll(async () => {
  A = await TestUser.register("alice");
  B = await TestUser.register("bob");
  C = await TestUser.register("carol");

  // A's world: two accounts, a goal, a loan; transactions carry canary payee/note that must never surface.
  const cat = await A.createCategory(`Groceries ${A.username}`);
  accounts.checking = await A.createAccount("Alice Checking Zeta");
  accounts.savings = await A.createAccount("Alice Savings Omega");
  await A.addTransaction(accounts.checking, cat, 4200, { payee: CANARY_PAYEE, note: CANARY_NOTE });
  await A.addTransaction(accounts.savings, cat, 9000);
  await A.json(
    await A.post("/api/goals", { name: "Alice Goal Kappa", type: "savings", targetAmount: 10000, currency: "USD" }),
    201,
  );
  await A.json(
    await A.post("/api/loans", {
      name: "Alice Loan Sigma",
      type: "auto",
      principal: 8000,
      annualRate: 5,
      termMonths: 48,
      startDate: "2025-01-01",
      currency: "USD",
    }),
    201,
  );
  // B owns something too.
  const bcat = await B.createCategory(`Food ${B.username}`);
  const bacc = await B.createAccount("Bob Wallet Lambda");
  await B.addTransaction(bacc, bcat, 777);

  // The 2FA gate applies to every viewer; A is a viewer once B shares back, C views A.
  await A.enableTotp();
  await B.enableTotp();
  await C.enableTotp();
});

test.afterAll(async () => {
  await Promise.all([A, B, C].map((u) => u?.dispose()));
});

test("2FA gate: a viewer without a second factor gets no data", async () => {
  const D = await TestUser.register("dave");
  try {
    const res = await D.overview();
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("mfa_required");
    expect(body.members).toBeUndefined();
  } finally {
    await D.dispose();
  }
});

test("A invites B (net_worth + accounts, must-share-back); B accepts via the emailed deep link; B shares back", async ({ browser }) => {
  const before = capturedMails().length;
  const inv = await A.json(
    await A.post("/api/family/manage/invite", {
      viewerEmail: B.email,
      sections: ["net_worth", "accounts"],
      mustShareBack: true,
    }),
    201,
  );
  shareAB = inv.shareId;
  const mail = await waitForMail(B.email, (m) => (/family\/accept\?token=/.test(m.text ?? m.html) ? m : null), { after: before });
  const token = inviteTokenFrom(mail)!;
  expect(token).toMatch(/^[0-9a-f]{64}$/);
  // The mail carries a link only: no amounts, no key material, no section names of data.
  expect(`${mail.html}${mail.text}`).not.toMatch(/Zeta|Omega|4200|9000/);

  // B opens the link in a browser signed in as B and clicks Accept (UI deep link, step-up not needed: fresh login).
  const page = await signedInPage(browser, B);
  await page.goto(`/family/accept?token=${token}`);
  await page.getByRole("button", { name: "Accept invite" }).click();
  await expect(page.getByText("Invite accepted")).toBeVisible({ timeout: 30_000 });
  // The token is gone from the address bar (history.replaceState) and from history.
  expect(page.url()).not.toContain(token);
  await page.context().close();

  // Single use: the same token is now dead (same generic 410 as an unknown token).
  expect((await B.post("/api/family/manage/accept", { token })).status()).toBe(410);

  const list = await B.json(await B.get("/api/family/manage/list"));
  const out = list.outgoing.find((s: any) => s.isReciprocal);
  expect(out, "B has a reciprocal (share-back) share").toBeTruthy();
  expect(out.sections).toEqual(expect.arrayContaining(["net_worth", "accounts"]));
  shareBA = out.id;
});

test("A's overview shows B right away; B's shows A only after A's login sweep, and only the shared sections", async () => {
  // B -> A is active at accept time (B was online): A sees B immediately.
  const aView = await overviewOf(A);
  const b = sharedMembers(aView).find((m) => Object.keys(m.sections).length > 0)!;
  expect(b, "A sees B").toBeTruthy();
  expect(Object.keys(b.sections).sort()).toEqual(["accounts", "net_worth"]);
  expect(b.sections.accounts.accounts.map((x: any) => x.label)).toContain("Bob Wallet Lambda");

  // A -> B needs the owner to be present once: A's next login finalizes grants (awaiting_owner_unlock -> active).
  await A.login();
  const bView = await eventually(async () => {
    const v = await overviewOf(B);
    return sharedMembers(v).length > 0 ? v : false;
  }, "B sees A after A's login sweep");
  const a = sharedMembers(bView)[0];
  expect(Object.keys(a.sections).sort()).toEqual(["accounts", "net_worth"]);
  expect(a.notShared).toEqual(expect.arrayContaining(["goals", "loans", "budgets", "investments", "cashflow"]));
  const labels = a.sections.accounts.accounts.map((x: any) => x.label);
  expect(labels).toEqual(expect.arrayContaining(["Alice Checking Zeta", "Alice Savings Omega"]));
  expect(a.genericLabels).toBe(false);
  expect(a.sections.net_worth.net).toBe(13200);

  // Nothing from non-shared sections or the owner's free text anywhere in the body.
  const raw = JSON.stringify(bView);
  for (const secret of [CANARY_PAYEE, CANARY_NOTE, "Alice Goal Kappa", "Alice Loan Sigma"]) {
    expect(raw).not.toContain(secret);
  }
  // B's own data is member "me".
  expect(bView.members.find((m) => m.relation === "me")).toBeTruthy();
});

test("the Family Wealth page renders the shared member for B (UI)", async ({ browser }) => {
  const page = await signedInPage(browser, B);
  await page.goto("/family");
  await expect(page.getByRole("heading", { name: "Family Wealth" }).first()).toBeVisible();
  await expect(page.getByText("Alice Checking Zeta").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(CANARY_PAYEE)).toHaveCount(0);
  await page.context().close();
});

test("A widens (adds goals): B sees no new section until B re-consents; B approves; goals flow", async () => {
  await A.json(
    await A.put("/api/family/manage/update-sections", {
      shareId: shareAB,
      sections: ["net_worth", "accounts", "goals"],
    }),
  );
  // Effective A->B sections = intersection with what B shares back.
  let a = sharedMembers(await overviewOf(B))[0];
  expect(Object.keys(a.sections).sort()).toEqual(["accounts", "net_worth"]);

  const list = await B.json(await B.get("/api/family/manage/list"));
  const incoming = list.incoming.find((s: any) => s.id === shareAB);
  expect(incoming.reconsentRequired).toBe(true);
  expect(incoming.reconsentSections).toEqual(["goals"]);

  // B approves by widening B->A to include goals.
  await B.json(
    await B.put("/api/family/manage/update-sections", {
      shareId: shareBA,
      sections: ["net_worth", "accounts", "goals"],
    }),
  );
  // Numbers flow immediately; the goal label key can only be sealed by the owner (A's DEK), so until
  // A is next present the label is the generic fallback, never an error and never a leak.
  a = await eventually(async () => {
    const m = sharedMembers(await overviewOf(B))[0];
    return m && m.sections.goals ? m : false;
  }, "B sees A's goals after consenting");
  expect(Object.keys(a.sections).sort()).toEqual(["accounts", "goals", "net_worth"]);
  expect(a.sections.goals.goals[0].labelIsGeneric).toBe(true);
  expect(JSON.stringify(a)).not.toContain("Alice Goal Kappa");
  await A.login(); // owner presence -> login sweep seals the goals key to B and builds the sidecar
  a = await eventually(async () => {
    const m = sharedMembers(await overviewOf(B))[0];
    return m?.sections.goals?.goals.some((g: any) => g.label === "Alice Goal Kappa") ? m : false;
  }, "B reads the real goal label after A's sweep");
  expect(JSON.stringify(a)).not.toContain("Alice Loan Sigma");
  const after = await B.json(await B.get("/api/family/manage/list"));
  expect(after.incoming.find((s: any) => s.id === shareAB).reconsentRequired).toBe(false);
});

test("A also shares accounts with C; A revokes B: B loses A, keys rotate, C is unaffected, old label rows are re-keyed", async () => {
  const inv = await A.json(
    await A.post("/api/family/manage/invite", { viewerEmail: C.email, sections: ["accounts"] }),
    201,
  );
  shareAC = inv.shareId;
  const token = await inviteMail(C.email);
  await C.json(await C.post("/api/family/manage/accept", { token }));
  await A.login(); // owner presence finalizes C's grants
  await eventually(async () => sharedMembers(await overviewOf(C)).length > 0, "C sees A");

  const snap = () =>
    withDb(async (db) => {
      const keys = await db.query(
        "SELECT section, max(epoch)::int AS epoch FROM family_section_keys WHERE owner_id=$1 GROUP BY section ORDER BY section",
        [A.id],
      );
      const labels = await db.query(
        "SELECT section, entity_id, epoch, label_ct FROM family_labels WHERE owner_id=$1 AND section='accounts' ORDER BY entity_id",
        [A.id],
      );
      const grants = await db.query("SELECT section FROM family_key_grants WHERE share_id=$1", [shareAB]);
      return { keys: keys.rows, labels: labels.rows, grants: grants.rows };
    });
  const before = await snap();
  expect(before.grants.length).toBeGreaterThan(0);
  const epochBefore = Object.fromEntries(before.keys.map((r: any) => [r.section, r.epoch]));

  await A.json(await A.post("/api/family/manage/revoke", { shareId: shareAB }));

  // B no longer sees A (and cannot get A's data any other way: no member, no leftover grant rows).
  expect(sharedMembers(await overviewOf(B)).filter((m) => m.name !== "")).toEqual([]);
  const after = await snap();
  expect(after.grants).toEqual([]);

  // Rotation: every section B held a key for moved to a new epoch; the accounts labels were
  // re-encrypted under the new key (different ciphertext + epoch), so B's old key opens none of them.
  const epochAfter = Object.fromEntries(after.keys.map((r: any) => [r.section, r.epoch]));
  expect(epochAfter.accounts).toBeGreaterThan(epochBefore.accounts);
  expect(after.labels.length).toBe(before.labels.length);
  for (const [i, row] of after.labels.entries()) {
    expect(row.epoch).toBeGreaterThan(before.labels[i].epoch);
    expect(row.label_ct).not.toEqual(before.labels[i].label_ct);
  }

  // A renames an account AFTER the revoke: the new label exists only under the new epoch ...
  await A.json(await A.put("/api/accounts", { id: accounts.checking, name: "Alice Renamed Theta" }));
  const renamed = await eventually(async () => {
    const s = await snap();
    return s.labels.find((r: any) => r.epoch === epochAfter.accounts && r.entity_id === accounts.checking) &&
      !s.labels.some((r: any) => before.labels.some((o: any) => o.label_ct === r.label_ct))
      ? s
      : false;
  }, "renamed label re-synced under the current epoch");
  expect(renamed.labels.every((r: any) => r.epoch === epochAfter.accounts)).toBe(true);

  // ... C (still granted, re-sealed after rotation) reads it; B (revoked) can read nothing.
  const cView = await eventually(async () => {
    const v = await overviewOf(C);
    const m = sharedMembers(v)[0];
    return m?.sections.accounts?.accounts.some((x: any) => x.label === "Alice Renamed Theta") ? v : false;
  }, "C reads the post-rotation label");
  expect(sharedMembers(cView)[0].genericLabels).toBe(false);
  expect(JSON.stringify(await overviewOf(B))).not.toContain("Alice Renamed Theta");

  // A -> B revoked; B -> A stays (constraint lifted): A still sees B.
  const aView = await overviewOf(A);
  expect(sharedMembers(aView).some((m) => Object.keys(m.sections).length > 0)).toBe(true);
  const blist = await B.json(await B.get("/api/family/manage/list"));
  expect(blist.incoming.find((s: any) => s.id === shareAB).status).toBe("revoked");
  void shareAC;
});

test("logged-out visit to /family/accept?token=... never carries the token into the redirect, later requests or storage", async ({ browser }) => {
  const token = "ab".repeat(32);
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();
  const urls: Array<{ url: string; referer?: string; kind: string }> = [];
  page.on("request", (r) => urls.push({ url: r.url(), referer: r.headers()["referer"], kind: "request" }));
  page.on("response", (r) => {
    const loc = r.headers()["location"];
    if (loc) urls.push({ url: loc, kind: "redirect-location" });
  });
  const consoleLines: string[] = [];
  page.on("console", (m) => consoleLines.push(m.text()));

  const first = await page.goto(`/family/accept?token=${token}`);
  // Invite pages send no Referer, so the token cannot ride along on any later request or log line.
  expect(first!.headers()["referrer-policy"]).toBe("no-referrer");
  // Unauthenticated: the app gate sends the visitor to the sign-in page.
  await page.waitForURL((u) => !u.pathname.startsWith("/family"), { timeout: 30_000 });
  expect(page.url()).not.toContain(token);
  expect(page.url()).not.toMatch(/token=/);

  // The first document request necessarily carries the link the user clicked; nothing after it may.
  const rest = urls.slice(1);
  // /__nextjs_* are next-dev-only internal endpoints (font/stack-frame helpers, not in a production build).
  const leaks = rest.filter(
    (u) => !new URL(u.url).pathname.startsWith("/__nextjs_") && (u.url.includes(token) || (u.referer ?? "").includes(token)),
  );
  expect(leaks, JSON.stringify(leaks)).toEqual([]);
  expect(consoleLines.join("\n")).not.toContain(token);
  // The address bar was cleaned, so history/Referer cannot leak it to anything the page loads next.
  const nav = await page.evaluate(() => ({ href: location.href, ref: document.referrer, hist: history.length }));
  expect(nav.href).not.toContain(token);
  expect(nav.ref).not.toContain(token);
  await ctx.close();
});

// ---- helpers ----
async function signedInPage(browser: Browser, u: TestUser) {
  const state = await u.ctx.storageState();
  const ctx = await browser.newContext({ baseURL: BASE_URL, storageState: state });
  return ctx.newPage();
}
