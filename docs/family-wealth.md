# Family Wealth

Status: shipped behind the default-on switch `FAMILY_WEALTH_ENABLED` (see "Kill switch").
Code: `src/lib/family/**`, `src/app/api/family/**`, `src/app/(app)/family/**`, tables `family_*` + `user_keypairs`
(migrations `20261002_reika_family_*`, `20261003_reika_family_keys`, `20261006_reika_family_scope_guard_reconsent`).
E2E: `playwright.family.config.ts`, `e2e/family-wealth.spec.ts`, `e2e/family-perf.spec.ts`.

## What it is

Household members share chosen slices of their finances with each other and see them combined on ONE page
(`/family`, tabs Overview + Sharing). There is no "view as" mode and no per-page access: the only data
endpoint is `GET /api/family/overview`, and every existing route keeps behaving exactly as before for the
caller's own data.

Roles are per share: the **owner** gives, the **viewer** receives. A share is one direction. "Must share
back" makes an invite conditional on the invitee sharing back (two shares, the second is the reciprocal).

## Sections (what can be shared)

Registry: `src/lib/family/sections.ts` (`FAMILY_SECTIONS_V1`), the single source for validation, UI and builders.

| section | viewer sees |
|---|---|
| `net_worth` | net worth, assets, liabilities, history series |
| `accounts` | account list: label, type, group, currency, balance |
| `investments` | holdings value, allocation, trend (from daily portfolio snapshots, at most ~1 day old) |
| `goals` | goal label, target, progress, deadline |
| `budgets` | category budget vs actual for the month |
| `loans` | loan label, principal, rate, balance, payoff |
| `cashflow` | income/expense totals and monthly trend (aggregates only) |

Never shareable: transactions, payees, notes, tags, splits, rules, subscriptions, calendar, tax, import data,
settings. "View all" resolves to the explicit list at grant time; sections added to the registry later are NOT
granted automatically.

Net worth is derivable from other sections. `net_worth` controls whether the totals are displayed, not whether the
arithmetic is possible; the share dialog says so.

Sections a member did not share are listed as "not shared" and are never rendered as zero. Amounts are converted to
the viewer's display currency with the viewer's own rates (owner FX overrides are not applied); a missing rate marks
the member "partial", never 1:1.

## How it works

Numbers (balances, amounts, dates) are plaintext in the database already. What the encryption protects are
labels and free text. Family Wealth therefore shares numbers through the normal read queries and labels through a
separate keyed channel.

- **Section keys.** Per (owner, section, epoch) a random AES-256 key `K`, stored wrapped by the owner's DEK.
  The owner DEK itself is never shared, wrapped for, or reachable by a viewer.
- **Label sidecar.** `family_labels` holds each shared entity's label (account, goal, loan, holding, category name)
  re-encrypted under `K`. Only registered `name_ct` columns are ever decrypted (`label-registry.ts`); payee, note,
  tags, alias and rules are unreachable from the sweep.
- **Grants.** `K` is sealed to each viewer's X25519 public key (ECIES, AAD binds share, owner, viewer, section,
  epoch). A viewer's private key is wrapped by the viewer's DEK. `K` is used only inside `withSectionKeys()` while
  building one overview response, then zeroed. It is never returned, logged, emailed or accepted as a credential.
- **Sweeps** (`syncFamilyLabels`) run on login, after name edits (accounts, goals, loans, categories, holdings),
  on accept, on widen and on revoke. They are idempotent (hash-skip) and safe to run concurrently (advisory lock).
- **Offline owner.** Viewers never block on the owner. Numbers are always live. Labels refresh at the owner's next
  login or edit; until then a viewer sees a generic label (`Account 1`) for new entities and the old label for renames.
  Granting a new key to a viewer needs the owner's session (DEK) once, so a plain accept becomes active at the
  owner's next login sweep (status `awaiting_owner_unlock` until then).
- **One failing member** returns `unavailable` for that member, not a page error.

## Sharing lifecycle

| step | endpoint | notes |
|---|---|---|
| invite | `POST /api/family/manage/invite` | email, sections, `mustShareBack`; step-up; link `/family/accept?token=`; same 201 whether or not the address has an account; 10/day/user, 3/day/address |
| resend | `POST .../resend` | previous token invalidated |
| accept | `POST .../accept` | session whose verified email equals the invite email; single use, 7 days; unknown, foreign, consumed and self all return the same 410; with must-share-back the reciprocal share is created in the same transaction |
| decline | `POST .../decline` | decline-only; no partial accept |
| update sections | `PUT .../update-sections` | widen needs step-up; narrowing rotates the dropped sections |
| revoke / leave | `POST .../revoke` | owner or viewer |
| list | `GET .../list` | allow-list DTOs, no ids of other users, no key material |

Statuses: `pending`, `awaiting_owner_unlock`, `active`, `suspended`, `revoked`, `declined`, `expired`, `key_reset`
(`share-status.ts`). Only `active` shares are served by the overview.

Management routes are session-only (API keys and OAuth tokens get 403), strict zod bodies, CSRF-checked.
"Step-up" = session younger than 10 minutes or `currentPassword` in the body (5 wrong guesses / 15 min).

The invite token is stored only as a hash. The invite page removes the token from the address bar and sends no
Referer (`Referrer-Policy: no-referrer` for `/family*`, `src/middleware.ts`).

### Must-share-back and re-consent

- A invites B with sections S and must-share-back. B can only accept by sharing back at least S; the SQL trigger
  `family_shares_min_scope_guard` repeats the check. B declines or shares back.
- While A->B is live, B->A cannot shrink below S (409).
- A widens A->B: the requirement becomes the widened set. Until B widens B->A to cover it ("re-consent"), B
  receives only the intersection of A->B with what B shares. B approves by widening B->A. The new section's label
  key is sealed to B at A's next sweep; until then its numbers show with generic labels.
- B revokes B->A: A->B becomes `suspended` (B loses sight of A, A is notified). A revokes A->B: B->A stays and the
  constraint is lifted.

## 2FA requirement

A viewer without a second factor gets no data: `GET /api/family/overview` answers 403 `mfa_required` with an empty
body of data. The gate is recomputed on every request and needs both (a) TOTP enabled on the account and (b) this
session to carry the `mfa` claim, i.e. the user signed in with the second factor after enabling it. A registered
passkey alone does not satisfy it (password login never asks for it). The page shows a "turn on 2FA" call to
action. The owner side has no 2FA requirement.

## Revoke semantics

- Immediate: the next overview call excludes the share; the viewer's grant rows are deleted.
- Rotation: for every section the viewer held a key for, the owner's revoke rotates the epoch in the same
  transaction (new `K`, sidecar re-encrypted, remaining viewers re-sealed, old key row deleted). A key the viewer
  copied out earlier opens nothing written after rotation and none of the re-encrypted rows. If no viewer remains,
  the section key and sidecar are deleted.
- Viewer-initiated leave, or an owner revoking while locked: grant rows are kept as a marker and the owner's next
  sweep rotates (`rotation: "deferred"`).
- Cannot be recalled: labels and numbers the viewer already saw, and keys exfiltrated before rotation (they still
  open that section's labels as they were).
- Wipe, delete and password reset (fresh DEK, old ciphertext unreadable) cascade into the shares (end them or move
  them to `key_reset`); labels are rebuilt by the owner's next sweep.

## Threat model summary

| actor | exposure |
|---|---|
| valid viewer | per granted section: numbers and that section's labels, in the viewer's currency |
| compromised viewer session | same, through the one endpoint; `K` and private key never returned; 30 reads/min; owner sees `last_viewed_at` |
| compromised viewer session + DB read | labels of the sections shared with that viewer only; not payees/notes, not other sections, not the owner DEK |
| operator / DB-only | already sees all numbers; sidecar and keys are ciphertext under keys wrapped by user DEKs/public keys |
| revoked viewer | denied next request; old `K` reads pre-rotation labels of that section only |
| invite-link thief | needs a logged-in session whose verified email equals the invite email; single use, 7 days, hashed |
| viewer without 2FA | no data |

Enforcement: the overview route exports GET only and middleware answers 405 to other methods; section builders
import only the read-query barrel; `grant.ts` is importable only from `src/lib/family/overview/**`; allow-list
serializer strips unknown keys; no `?as=`, no owner id on any viewer request.

Residual risks: numbers are plaintext for the operator as before; the in-process rate limiter is per process;
the viewer-leave rotation window; labels already seen stay known. Invite URLs necessarily appear in the request line
of the first page load (reverse-proxy access logs, `next dev` console). Treat them as single-use bearer links.

## Kill switch

`FAMILY_WEALTH_ENABLED` (runtime env, default ON; `0`/`false`/`off`/`no` disables). Disabled: `/family*` pages and
`/api/family/*` answer 404 in `src/middleware.ts`, the nav entry is hidden (`/api/auth/session` reports
`familyWealthEnabled`). Share rows and keys are untouched; re-enabling restores everything.

## Tests

- vitest `tests/family/*` (real Postgres): section x state matrix, taint/crypto taint, write impossibility,
  rotation, must-share-back, 2FA gate, flag.
- Playwright e2e (real app, real Postgres, real TOTP, captured mail): invite -> accept -> share-back -> overview ->
  widen/re-consent -> revoke/rotation, 2FA gate, logged-out deep-link token check, N-member latency.

```
FAMILY_E2E_DATABASE_URL=postgresql://user:pw@127.0.0.1:55432/fam_test \
  npx playwright test -c playwright.family.config.ts
```

The config applies migrations, starts `next dev --webpack` on `FAMILY_E2E_PORT` (default 3917) with throwaway
secrets, and sets `FINLYNQ_EMAIL_CAPTURE`: outgoing mail is appended to that JSONL file instead of sent
(`src/lib/email.ts`, ignored when `NODE_ENV=production`). The database name must end in `_test`.
Optional: `FAMILY_E2E_CHROMIUM` (path to a Chromium binary), `FAMILY_E2E_REUSE=1` (use a running server).
