/**
 * Multi-account cap (5) + re-login of an account that is already in the bundle.
 */
import {
  test,
  expect,
  registerUser,
  signIn,
  addViaMenu,
  openMenu,
  accountsList,
  session,
  freshIp,
  expectHardReload,
  MAX_ACCOUNTS,
  type TestUser,
} from "./fixtures";

test.describe.configure({ mode: "serial" });

test("cap: 5 accounts, 6th add blocked; cancel clears pf_add; locked account re-login allowed at the cap", async ({ page, context, srv, baseURL }) => {
  const users: TestUser[] = [];
  for (let i = 0; i < MAX_ACCOUNTS; i++) users.push(await registerUser(baseURL!, `u${i}`));
  const [U1, U2, U3, U4, U5] = users;

  await signIn(page, U1);
  for (const u of [U2, U3, U4, U5]) await addViaMenu(page, u);

  let list = await accountsList(page);
  expect(list).toHaveLength(MAX_ACCOUNTS);
  expect(list.find((a) => a.active)?.userId).toBe(U5.id);

  // ── 6th add is blocked: menu item disabled, API 409 account_cap ─────────
  await openMenu(page);
  const addItem = page.getByRole("menuitem", { name: /add another account/i });
  await expect(addItem).toHaveAttribute("aria-disabled", "true");
  await addItem.click({ force: true });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.keyboard.press("Escape");
  const intent = await page.evaluate(async () => {
    const r = await fetch("/api/auth/add-intent", { method: "POST" });
    return { status: r.status, body: await r.json().catch(() => null) };
  });
  expect(intent.status).toBe(409);
  expect(intent.body).toEqual({ error: "account_cap" });
  expect((await context.cookies()).find((c) => c.name === "pf_add")).toBeUndefined();

  // a 6th login can only REPLACE (no pf_add): the bundle never exceeds 5
  list = await accountsList(page);
  expect(list).toHaveLength(MAX_ACCOUNTS);

  // ── Cancel on /cloud?add=1 clears pf_add (needs a free slot) ────────────
  await openMenu(page);
  await expectHardReload(page, () => page.getByRole("menuitem", { name: /sign out of this account/i }).click());
  await page.waitForURL(/\/dashboard/);
  expect(await accountsList(page)).toHaveLength(MAX_ACCOUNTS - 1);
  await openMenu(page);
  await page.getByRole("menuitem", { name: /add another account/i }).click();
  await page.waitForURL(/\/cloud\?add=1/);
  expect((await context.cookies()).find((c) => c.name === "pf_add")).toBeDefined();
  await expect(page.getByTestId("add-cancel")).toBeVisible();
  await page.getByTestId("add-cancel").click();
  await page.waitForURL(/\/dashboard/);
  expect((await context.cookies()).find((c) => c.name === "pf_add")).toBeUndefined();
  expect(await accountsList(page)).toHaveLength(MAX_ACCOUNTS - 1);

  // refill to the cap with U5 again (fresh sign-in of the account just signed out)
  await addViaMenu(page, U5);
  expect(await accountsList(page)).toHaveLength(MAX_ACCOUNTS);

  // ── locked entries: restart the server => every in-memory DEK is gone ───
  const before = (await accountsList(page)).map((a) => a.userId).sort();
  await srv.restart();
  await page.goto("/dashboard");
  const locked = await accountsList(page);
  expect(locked).toHaveLength(MAX_ACCOUNTS);
  expect(locked.every((a) => a.status === "locked")).toBe(true);

  // At the cap, re-signing-in an account that is ALREADY in the bundle must work
  // (it replaces its own entry); a stranger still cannot be added.
  const stranger = await page.evaluate(async () => (await fetch("/api/auth/add-intent", { method: "POST" })).status);
  expect(stranger).toBe(409);

  const target = U2;
  await openMenu(page);
  await page.getByRole("menuitem", { name: new RegExp(target.email.replace(/[.+]/g, "\\$&")) }).click();
  await page.waitForURL(/\/cloud\?add=1/);
  await expect(page.getByPlaceholder(/username or/i)).toHaveValue(target.email);
  await freshIp(context);
  await page.locator('input[type="password"]').fill(target.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/);
  await expect.poll(async () => (await session(page)).userId).toBe(target.id);

  const after = await accountsList(page);
  expect(after).toHaveLength(MAX_ACCOUNTS); // not 6, nobody evicted
  expect(after.map((a) => a.userId).sort()).toEqual(before);
  expect(new Set(after.map((a) => a.userId)).size).toBe(MAX_ACCOUNTS); // no duplicate
  expect(after.find((a) => a.active)?.userId).toBe(target.id);
  expect(after.find((a) => a.userId === target.id)?.status).toBe("ok");
  expect((await context.cookies()).find((c) => c.name === "pf_add")).toBeUndefined();

  // the 6th, unknown account is still blocked
  expect(await page.evaluate(async () => (await fetch("/api/auth/add-intent", { method: "POST" })).status)).toBe(409);
});
