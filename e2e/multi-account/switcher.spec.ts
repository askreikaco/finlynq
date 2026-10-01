/**
 * Multi-account switcher e2e (plan .plan-multiacct.md §7, B4).
 * Real browser, real app (next dev), real Postgres (*_test), real cookies.
 */
import {
  test,
  expect,
  registerUser,
  signIn,
  addViaMenu,
  switchTo,
  openMenu,
  expectHardReload,
  session,
  accountsList,
  createDataAccount,
  dataAccountNames,
  expectActive,
  type TestUser,
} from "./fixtures";

test.describe.configure({ mode: "serial" });

test.describe("multi-account switcher", () => {
  let A: TestUser, B: TestUser, C: TestUser;

  test.beforeAll(async ({ baseURL }) => {
    A = await registerUser(baseURL!, "a");
    B = await registerUser(baseURL!, "b");
    C = await registerUser(baseURL!, "c");
  });

  test("add B and C via the menu, switch with no data/localStorage leak, sign out B then all", async ({ page, context }) => {
    // ── sign in A, give A data + A-only localStorage ───────────────────────
    await signIn(page, A);
    await createDataAccount(page, "A-private-account");
    // A dismisses the first-run tips: stored per user (pf-dismissed-tips:<A>)
    const tips = page.getByText("Tips for getting started");
    await expect(tips).toBeVisible();
    await page.getByRole("button", { name: "Dismiss all" }).click();
    await expect(tips).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem("pf-font", "device-level"));

    // ── add B via the menu; B is active, A stays in the bundle ──────────────
    await addViaMenu(page, B);
    await createDataAccount(page, "B-private-account");
    let list = await accountsList(page);
    expect(list.map((a) => a.userId).sort()).toEqual([A.id, B.id].sort());
    expect(list.find((a) => a.active)?.userId).toBe(B.id);

    // pf_add is gone after the commit; stash cookie is Path=/api/auth + httpOnly
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "pf_add")).toBeUndefined();
    const stash = cookies.find((c) => c.name === "pf_accounts");
    expect(stash?.path).toBe("/api/auth");
    expect(stash?.httpOnly).toBe(true);
    const active = cookies.find((c) => c.name === "pf_session");
    expect(active?.path).toBe("/");
    expect(active?.httpOnly).toBe(true);
    // the stash cookie is NOT sent to data routes
    const dataHeaders = await page.evaluate(async () => {
      const r = await fetch("/api/accounts", { cache: "no-store" });
      return r.status;
    });
    expect(dataHeaders).toBe(200);

    // ── switch A <-> B: identity + data are the right user's every time ─────
    for (const [target, mine, theirs] of [
      [A, "A-private-account", "B-private-account"],
      [B, "B-private-account", "A-private-account"],
      [A, "A-private-account", "B-private-account"],
    ] as Array<[TestUser, string, string]>) {
      await switchTo(page, target);
      await expect(page.getByText(target.email).first()).toBeVisible();
      const names = await dataAccountNames(page);
      expect(names).toContain(mine);
      expect(names).not.toContain(theirs);
      // the dashboard greeting never shows the other user
      const other = target === A ? B : A;
      await expect(page.getByText(other.email, { exact: true })).toHaveCount(0);
    }

    // ── per-user localStorage does not leak across the switch ───────────────
    // (currently on A after the loop; A dismissed the tips, B never did)
    await expect(tips).toHaveCount(0);
    await switchTo(page, B);
    await expect(tips).toBeVisible(); // A's dismissal did not leak to B
    const ls = await page.evaluate(() => {
      const o: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) o[localStorage.key(i)!] = localStorage.getItem(localStorage.key(i)!)!;
      return o;
    });
    expect(ls[`pf-dismissed-tips:${A.id}`]).toBeTruthy(); // A's data stays A's
    expect(ls[`pf-dismissed-tips:${B.id}`]).toBeUndefined();
    expect(ls["pf-dismissed-tips"]).toBeUndefined(); // no un-namespaced alias
    expect(ls["pf-font"]).toBe("device-level"); // device-level keys untouched
    await switchTo(page, A);
    await expect(tips).toHaveCount(0); // and A's dismissal survived the round trip
    await switchTo(page, B);

    // ── add C ───────────────────────────────────────────────────────────────
    await addViaMenu(page, C);
    await createDataAccount(page, "C-private-account");
    list = await accountsList(page);
    expect(list.map((a) => a.userId).sort()).toEqual([A.id, B.id, C.id].sort());

    // ── sign out B while B is active -> next account becomes active ─────────
    await switchTo(page, B);
    await openMenu(page);
    await expectHardReload(page, () => page.getByRole("menuitem", { name: /sign out of this account/i }).click());
    await page.waitForURL(/\/dashboard/);
    await expect.poll(async () => (await session(page)).userId).not.toBe(B.id);
    const afterB = await session(page);
    expect([A.id, C.id]).toContain(afterB.userId);
    list = await accountsList(page);
    expect(list.map((a) => a.userId)).not.toContain(B.id);
    expect(list).toHaveLength(2);
    expect(list.filter((a) => a.active)).toHaveLength(1);
    const names = await dataAccountNames(page);
    expect(names).not.toContain("B-private-account");

    // ── sign out of ALL accounts -> signed out, login page ──────────────────
    await openMenu(page);
    await expectHardReload(page, () => page.getByRole("menuitem", { name: /sign out of all accounts/i }).click());
    await expect.poll(async () => (await session(page)).userId).toBeNull();
    const after = await context.cookies();
    expect(after.find((c) => c.name === "pf_session")).toBeUndefined();
    expect(after.find((c) => c.name === "pf_accounts")).toBeUndefined();
    await page.goto("/dashboard");
    await page.waitForURL((u) => /\/cloud|\/auth|^\/$/.test(u.pathname) || u.pathname === "/", { timeout: 60_000 });
    expect(await accountsList(page)).toEqual([]);
    await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  });

  test("trusted device: A and B both keep working devices on the same browser", async ({ page, context }) => {
    await signIn(page, A);
    const idA = await page.evaluate(async () => (await (await fetch("/api/auth/device-current")).json()).id);
    expect(idA).toBeTruthy();

    await addViaMenu(page, B);
    const idB = await page.evaluate(async () => (await (await fetch("/api/auth/device-current")).json()).id);
    expect(idB).toBeTruthy();
    expect(idB).not.toBe(idA);

    // one pf_device cookie carrying BOTH entries; Path=/api/auth; httpOnly
    const dev = (await context.cookies()).find((c) => c.name === "pf_device");
    expect(dev?.path).toBe("/api/auth");
    expect(dev?.httpOnly).toBe(true);
    expect(decodeURIComponent(dev!.value).split(",")).toHaveLength(2);

    // back on A: A's device still resolves (not overwritten by B's login)
    await switchTo(page, A);
    const idA2 = await page.evaluate(async () => (await (await fetch("/api/auth/device-current")).json()).id);
    expect(idA2).toBe(idA);
    await switchTo(page, B);
    const idB2 = await page.evaluate(async () => (await (await fetch("/api/auth/device-current")).json()).id);
    expect(idB2).toBe(idB);

    // signing out of B keeps A's AND B's trusted devices (logout keeps pf_device)
    await openMenu(page);
    await expectHardReload(page, () => page.getByRole("menuitem", { name: /sign out of this account/i }).click());
    await page.waitForURL(/\/dashboard/);
    await expectActive(page, A);
    const idA3 = await page.evaluate(async () => (await (await fetch("/api/auth/device-current")).json()).id);
    expect(idA3).toBe(idA);
    const dev2 = (await context.cookies()).find((c) => c.name === "pf_device");
    expect(decodeURIComponent(dev2!.value).split(",")).toHaveLength(2);
  });
});
