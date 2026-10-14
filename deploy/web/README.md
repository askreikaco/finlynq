# deploy/web - static SPA rollout for money.reika.vn

Files: `web-deploy.sh` (publish/rollback), `sync-routes.mjs` + `gen-routes.sh` + `money-spa-routes.conf.template` + `spa-routes.txt` (nginx strangler, generated from ONE source), `spa-smoke.mjs` (browser smoke),
`money.reika.vn.conf.proposed.diff` (vhost, 1 line), `check-vhost-include.sh`, `finlynq-deploy.skip-nonruntime.patch` (P0-4),
`test-*.sh`, `reference/` (copies of the live vhost and deploy script the diffs are against).
Nothing here is installed by the repo; the owner approves the two droplet-file changes below.

## URL / path conventions
- Vite `base: '/web/'`. Hashed build files: URL `/web/assets/<hash>.js|css` -> `$WEB_ROOT/assets/` (shared by all releases, `public, max-age=31536000, immutable`, missing = 404, never falls to Next).
- Other non-hashed files under the base (`/web/theme-init.js`, `/web/version.json`) -> `$WEB_ROOT/current/` (`no-cache`).
- App routes (`/more`, `/settings`, ...) are NOT under `/web/`; listed in `spa-routes.txt`, answered with `current/index.html` (`no-cache`, `X-Served-By: web`).
- `/sw.js` -> `current/sw.js` only after `gen-routes.sh --enable-sw` (SPA service worker shipped). Until then Next serves `/sw.js`.
- `WEB_ROOT=/home/moneyreika/htdocs/money.reika.vn/web`, layout: `assets/ releases/<sha>/ current -> releases/<sha> .history .web-deploy.lock`. Run as `moneyreika`.
- Build must emit: `index.html version.json{"build":"<sha>"} sw.js assets/ theme-init.js` (+ any other non-hashed file). index.html references `/web/assets/...` and `/web/...`.

## Route list: ONE source (src/spa/routes.config.ts)
`src/spa/routes.config.ts` (`SPA_ROUTES`, Next file-convention paths, `[id]` for dynamic segments) is the only place a route is enabled. It drives: the SPA route table (`src/spa/routes.ts`), the in-page `isSpaPath` for the Link/router shims, the service-worker navigation allowlist, the vite dev/preview fallback and `routes.json`; all through `src/spa/route-table.ts`. `spa-routes.txt` is GENERATED from it:
```
node deploy/web/sync-routes.mjs           # rewrite spa-routes.txt (Node >= 22.18, runs the .ts directly)
node deploy/web/sync-routes.mjs --check   # exit 1 when stale (also run by test-gen-routes.sh and tests/spa/route-table.test.ts)
```
Never edit `spa-routes.txt` by hand. Add a route: line in `routes.config.ts` (+ client twin in `src/spa/pages/` when its page.tsx is a server component) -> `sync-routes.mjs` -> commit both -> deploy the SPA release -> `gen-routes.sh --apply`.

## Route semantics (spa-routes.txt, generated)
- Every generated line is EXACT: `=/accounts/[id] !groups !new` matches `/accounts/12` and `/accounts/12/` only (query ignored by nginx). Sub-paths (`/accounts/12/edit`) and sibling pages stay on Next unless listed themselves. `gen-routes.sh` still accepts hand-written prefix lines (`/more` = `/more` and everything below, segment boundary respected) for ad-hoc use.
- `[param]` = exactly one path segment (`[^/]+`). `!name` tokens = static sibling pages the param must NOT match (PCRE negative lookahead): `/accounts/groups` is its own Next page, not account "groups". `sync-routes.mjs` computes them from `src/app/(app)`; the SPA uses the same function (`exclusionsFor`) for `isSpaPath`, so a Link to `/accounts/groups` does a full page load into Next.
- Refused: `/`, `/api`, `/.well-known`, `/oauth`, `/web`, `/sw.js`, `/try-demo`, trailing slash, regex chars, spaces, `[param]` inside a segment (`/a/x[id]`), `!name` without a `[param]`.
- Generated regexes: `^/(a|b/[^/]+)/?$` (exact) and `^/(a|b)(/|$)` (prefix). Location blocks set their own `add_header`, so server-level `add_header` (vhost `Cache-Control no-transform`, anything in `global_settings`) is NOT inherited there: the blocks add `Cache-Control`, `X-Served-By`, `X-Content-Type-Options`, `Referrer-Policy`; CSP via env `SPA_CSP` (omitted if empty). Check for other needed headers in `/etc/nginx/global_settings` before enabling wave 1.
- Wave 0 behaviour change vs the old hand-written file: `/more/x` and `/settings/about/x` are no longer sent to the SPA (they never existed in Next either: 404 from Next instead of the SPA not-found state).
- Kill switches (`FAMILY_WEALTH_ENABLED`, `FINLYNQ_INSTANCE_ADMIN`): the Next middleware 404s `/family*` and `/admin/instance*`, but nginx serves SPA routes without reaching Next. The SPA repeats the check from `GET /api/config/flags` (`src/spa/guards.tsx`): a disabled route renders the not-found state, nothing renders until the flags answered. None of these routes is in the list yet; the guard is generic (any route under those paths).

## Install on the droplet (owner approves 1 and 3; nothing is run by Claude)
```
# 0. get the repo files (as root) e.g. /opt/finlynq/src/deploy/web  (= $R)
R=/opt/finlynq/src/deploy/web
# 1. web root + scripts
install -d -o moneyreika -g moneyreika /home/moneyreika/htdocs/money.reika.vn/web
install -m 755 -o root -g root $R/web-deploy.sh /usr/local/bin/finlynq-web-deploy.sh
# 2. nginx include, EMPTY routes first (no behaviour change)
: > /etc/nginx/money-spa-routes.conf   # gen-routes.sh with an empty list also works; comment-only file is valid
cp -a /etc/nginx/sites-enabled/money.reika.vn.conf /root/money.reika.vn.conf.bak-$(date +%F)
cd /etc/nginx/sites-enabled && patch -p1 --dry-run -d / < $R/money.reika.vn.conf.proposed.diff && patch -p1 -d / < $R/money.reika.vn.conf.proposed.diff
nginx -t && systemctl reload nginx
# 3. deploy-script patch (P0-4)
cp -a /usr/local/bin/finlynq-deploy.sh /usr/local/bin/finlynq-deploy.sh.bak-$(date +%F)
cd /usr/local/bin && patch -p1 --dry-run < $R/finlynq-deploy.skip-nonruntime.patch && patch -p1 < $R/finlynq-deploy.skip-nonruntime.patch && bash -n finlynq-deploy.sh
```
Note: `patch -p1 -d /` applies `a/etc/nginx/sites-enabled/money.reika.vn.conf` relative to `/`. If sites-enabled is a symlink to CloudPanel's real file, `patch` edits the symlink target only with `--follow-symlinks`; add it if needed.
Then verify `$R/check-vhost-include.sh` prints OK.

Go live for a wave (after the first `web-deploy.sh` has created `current`; routes before that would 404):
```
sudo -u moneyreika finlynq-web-deploy.sh /path/to/dist <sha>        # publish
$R/gen-routes.sh --apply            # root: backup, install, nginx -t, reload (restores on failure)
curl -sI https://money.reika.vn/more | grep -i x-served-by          # -> web
```
Service worker (once the SPA ships one): `gen-routes.sh --enable-sw --apply`; revert with `--disable-sw --apply`.

## CloudPanel vhost regeneration
CloudPanel may rewrite `/etc/nginx/sites-enabled/money.reika.vn.conf` (site edits, cert renewal, PHP/Node settings), dropping the include. Two options:
1. File: re-run the `patch` above (idempotent check: `check-vhost-include.sh`; run it from cron/after deploys, non-zero = include missing). Because `money-spa-routes.conf` is untouched, only the include line needs re-adding.
2. CloudPanel UI (durable): Sites -> money.reika.vn -> Vhost editor; paste the `include /etc/nginx/money-spa-routes.conf;` line inside the `server` block before `location / {`, after `location ~ ^/try-demo`. Verify with `check-vhost-include.sh` that the order survived.
Until the include is back, all routes silently fall back to Next (safe, just slow path).

## Kill switch / rollback
- All routes back to Next: `: > /etc/nginx/money-spa-routes.conf && nginx -t && systemctl reload nginx` (also removes the `/web/*` and `/sw.js` locations; Next SSR still has the pages until phase 3). Re-enable: `gen-routes.sh --apply`.
- One route back: delete its line from `spa-routes.txt`, `gen-routes.sh --apply`.
- Bad UI release: `sudo -u moneyreika finlynq-web-deploy.sh --rollback` (1 step, no reload; repeated call toggles between the last two releases).
- Revert vhost: `cp -a /root/money.reika.vn.conf.bak-<date> /etc/nginx/sites-enabled/money.reika.vn.conf && nginx -t && systemctl reload nginx`. Revert deploy script: copy the `.bak-<date>` back.

## Strangler procedure
Add route: line in `src/spa/routes.config.ts` -> `node deploy/web/sync-routes.mjs` -> deploy the build containing it -> `gen-routes.sh --apply` -> curl check -> commit the txt. Remove: delete line -> `--apply`. Order matters for adding: SPA release first, route second; for removing: route first.

## web-deploy.sh behaviour
`web-deploy.sh <build-dir> [<sha>]`: flock (exit 75 if busy; `LOCK_WAIT=N` to wait) -> rsync -a assets (no delete) and touch them -> stage release, write `assets.list` -> smoke (index.html refs all exist in assets/ or release, version.json parses and build == sha, no `..`) -> `ln -sfn` + `mv -Tf` -> prune (keep 10 newest releases + current; delete assets older than 30 d absent from every kept release's `assets.list`). Failed smoke removes the release and leaves `current` alone. Falls back to `cp -a`/tar when rsync is missing (tests only). Env: `WEB_ROOT WEB_BASE KEEP_RELEASES ASSET_DAYS LOG_FILE LOCK_WAIT`. No node restart, no docker.

## Speed budget
Target: `web-deploy.sh` <= 5 s (build excluded). Timed internally: every line has a timestamp, final line `ok sha=<sha> elapsed=<s>s`, `WARN: over 5s budget` if exceeded. Use `LOG_FILE=/home/moneyreika/logs/web-deploy.log`. Measured here (cp fallback, 300 files): ~0.3 s. Nginx reload is not part of a UI deploy (only route-list changes). Merge-to-live is dominated by the build (plan: <= 60 s).

## P0-4 skip image rebuild
Patch inserts, after the "up to date" check: if `$STATE` exists, not `--force`, the old sha exists in the clone and `git diff --no-renames --name-only $OLD $SHA` lists only `tests/** e2e/** docs/** _ai/** *.md .github/** deploy/web/**`, log `skip: non-runtime diff ($SHA)`, write `$STATE`, exit 0. Old sha missing/git error -> builds. `--no-renames` so a rename out of runtime paths counts as runtime. Test: `bash deploy/web/test-skip-nonruntime.sh` (fake docker, scratch git).

## Browser smoke (`spa-smoke.mjs`)
Opens every `SPA_ROUTES` entry (+ query-state variants: `?sel`, `?range`, `?q&sort&dir`, `?edit`) in the SPA origin and in the Next origin at 1440x900 and 390x844, light and dark; fails the SPA cell on console errors, page errors, failed requests or HTTP >= 400 that the Next page does not also have, on a different page size, or on a pixel diff above `--threshold` (default 0.5 %; Next vs Next baseline noise is ~0.43 % on /dashboard, a chart line). Also runs in-app navigation scenarios (no document reload, Back, `?q` sync, not-found). Writes `results.json`, `results.md` and next/spa/diff PNGs for failing cells.
Fixture (local only, never prod): throwaway Postgres on a `*_test` database, `next start` of a production build on port A, `PORT=A SPA_CSP="..." npx vite preview --port B` (static `dist-web` + `/api` proxied to A; `SPA_CSP` is sent on every response to prove the strict policy), then
`SMOKE_DATABASE_URL=postgres://.../x_test node --no-warnings deploy/web/spa-smoke.mjs --next http://localhost:A --spa http://localhost:B --out DIR`. Use `localhost` (not 127.0.0.1): the session cookie is `Secure` in production. Service workers are blocked during the run.

## Tests
`bash test-web-deploy.sh`, `bash test-gen-routes.sh`, `bash test-skip-nonruntime.sh`. `npx vitest run tests/spa` (route-table parity incl. the generated nginx regexes, guards, shims, feedback policy). Not run here: real nginx (`nginx -t`), real rsync (absent in sandbox).
