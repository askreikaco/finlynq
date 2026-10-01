# Multi-account switcher

Several accounts signed in at once in one browser, one active at a time, one-click switch. Managed (Postgres) edition only. Code: `src/lib/auth/session-bundle.ts`, `src/app/api/auth/{accounts,switch,add-intent,logout}`, `src/components/account-switcher.tsx`, `src/lib/client/{hard-reload,user-storage}.ts`.

## Cookies

| cookie | holds | Path | lifetime | read by |
|---|---|---|---|---|
| `pf_session` | the ACTIVE account's session JWT (unchanged format) | `/` | 24 h | middleware, auth strategies, OAuth authorize, every data route |
| `pf_accounts` | INACTIVE accounts' session JWTs, `base64url(JSON [{t:jwt}])`, most recently used first, max 4 | `/api/auth` | 24 h, refreshed on write | `/api/auth/*` routes only |
| `pf_add` | short-lived signed "add another account" intent (purpose `add-account`), bound to the active session's `jti` | `/api/auth` | 10 min | login commit paths |
| `pf_device` | trusted-device list `<id>.<secret>[,<id>.<secret>...]`, max 5, one entry per account | `/api/auth` | `PF_TRUSTED_DEVICE_DAYS` (30) | login/unlock/recovery routes |

All are HttpOnly, SameSite=Lax, Secure in production. Tokens never appear in a response body.

## Limits

- 5 accounts per browser (1 active + 4 stashed). Enforced at `POST /api/auth/add-intent` (409 `account_cap`) and again at commit (race: the oldest stash entry is evicted and its session revoked).
- Re-signing in an account that is ALREADY in the bundle (status `locked` / needs login) is never blocked by the cap: the UI sends `POST /api/auth/add-intent {userId}` and the commit replaces that account's own entry (old `jti` revoked, no duplicate, nobody evicted). An unknown `userId` at the cap is still 409.
- Cancel on `/cloud?add=1` calls `DELETE /api/auth/add-intent` (clears `pf_add`; session-only, CSRF-checked), then returns to `/dashboard`. No session changes.
- A background account loses its DEK after 2 h idle (or a server restart): it shows "Sign in again" and switching to it goes through the add flow with a password prompt.
- Mobile / API-key / MCP / OAuth-bearer clients are unaffected: Bearer and `X-API-Key` are resolved before cookies and never touch the bundle (bundle routes reject them with 403).

## Security model

- One user per request. Data routes read `pf_session` only. `pf_accounts` is not sent outside `/api/auth`; a request with only `pf_accounts` is 401 on data routes. There is no `?as=` / header override.
- The stash cookie is not trusted: on every read each token is re-verified (signature, deploy generation, `jti` denylist, `session_not_before`, expiry). Dead, pending, duplicate-user, deleted-user and overflow entries are dropped. Nothing in the bundle code mints a token, so a user can only be added by a real credential login (password, MFA, Google, register).
- Switch (`POST /api/auth/switch {userId}`): session-cookie auth only, JSON content type, middleware Origin/Referer CSRF check, rate limited (30/min per user, 60/min per IP). Target must be in the stash (otherwise 404, same body as unknown); it is re-verified and its DEK must still be cached, else 409 `needs_login`. On success the target token becomes `pf_session` and the old active token moves to the stash in one response.
- DEK cache is keyed by `jti` AND `userId`; each account has its own `jti`, DEK entry and revocation row. A background account's DEK stays cached until its own idle/hard expiry or its logout.
- Client: switch, login and logout end in a full page load (`hardReload`), so SWR cache, React state and in-flight fetches of the previous account are discarded. Per-user localStorage keys are namespaced `<key>:<userId>` (`pf-chat-history`, `pf-dismissed-tips`, `pf-spotlight-dismissed`); legacy bare keys are dropped, never migrated. Device-level keys (`pf-font`, sidebar state, analytics consent) are shared. No service worker or Cache API is used.
- `zero-click-login` never replaces an existing valid session (prefetch side effect).
- OAuth consent binds to the ACTIVE account and shows which one. Admin is computed per request from the active user's DB role.
- Stash cookie theft has the same blast radius as `pf_session` theft (HttpOnly, restricted path).

## Recovery interaction

- Recovery (`session_not_before`): enforced inside token verification, so a recovered user's stashed token dies; the account appears as needing sign-in and is pruned from the cookie.
- Trusted devices: `pf_device` is a per-user list. Logging in account B on the same browser adds B's entry and keeps A's; redeem/rotate touches only the signed-in user's entry. Device-based recovery (`/api/auth/recovery/device/*`) has no signed-in user: it uses the first valid entry (the most recently issued), so on a browser with several accounts it resets that account. An account picker is not implemented.
- Deleting the active account (`delete-account`) drops it without revoking and promotes the next usable account.

## Logout semantics

| action | effect |
|---|---|
| Sign out of this account (`POST /api/auth/logout`) | revoke active `jti` + wipe its DEK; promote the first still-switchable stash entry to active (response `activeUserId`), UI reloads `/dashboard`. Leftovers without a DEK cannot be used without a password: they are revoked and the bundle clears, UI goes to `/`. |
| Sign out of all (`?all=1`) | revoke every `jti` in the bundle, wipe every DEK, clear `pf_session`, `pf_accounts`, `pf_add`. UI goes to `/`. |
| `?everywhere=1` | additionally revokes trusted devices (active user; every bundle user with `all=1`) and removes only those users' entries from `pf_device`. |
| default | `pf_device` kept: trusted devices of all accounts survive a normal logout. |

Per-user localStorage of the signed-out account(s) is cleared by the client.

## Tests

- vitest (real Postgres `*_test`): `tests/auth/session-bundle-b1.test.ts`, `tests/auth/multi-device-b2.test.ts`, `tests/auth/dek-cache.test.ts`, `tests/components/account-switcher.test.tsx`, `tests/components/cloud-add-account.test.tsx`.
- Playwright e2e: `e2e/multi-account/*.spec.ts` with `playwright.multiacct.config.ts`. Starts its own `next dev --webpack` on a free port against a `*_test` DB with throwaway secrets (never reads `.env`); can restart the server to evict all DEKs.
  ```
  DATABASE_URL=postgresql://USER:PW@127.0.0.1:55432/ma4_test node scripts/run-migrations.mjs
  DATABASE_URL=... npx playwright test -c playwright.multiacct.config.ts
  ```
  `MA_E2E_CHROMIUM=<path>` selects a pre-installed Chromium.
- Mutation checks (each must turn a named test red): skip stashed-token re-verify; DEK cache by `jti` only; drop dedupe (commit and load); `pf_device` single-entry overwrite; `router.push` instead of `hardReload`; ignore re-login exemption at the cap.
