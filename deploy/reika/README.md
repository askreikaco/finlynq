# money.reika.vn deployment (askreikaco fork)

Branches:

| branch | holds |
|---|---|
| `main` | exact mirror of `finlynq/finlynq@main` |
| `fix/*` | one change each, based on upstream; proposed upstream as PRs |
| `custom` | `main` + merged `fix/*` + this folder; what money.reika.vn runs |

Flow:

1. Weekly: `main` is synced from upstream, then merged into `custom` (GitHub merge API; a conflict stops here and is resolved by hand).
2. Nightly: `finlynq-deploy.sh` on the droplet builds `origin/custom` when it moved, backs up the DB, swaps the `app` container to `finlynq-custom:current`, and rolls back to `finlynq-custom:prev` if it never turns healthy.

Droplet files:

| path | purpose |
|---|---|
| `/usr/local/bin/finlynq-deploy.sh` | copy of `finlynq-deploy.sh` |
| `/etc/cron.d/finlynq-deploy` | nightly run, logs to `/var/log/finlynq-deploy.log` |
| `/opt/finlynq/src` | build checkout of `custom` |
| `/opt/finlynq/.deployed-sha` | last deployed commit |
| `/opt/finlynq/docker-compose.yml` | `app.image: finlynq-custom:current` |

Schema changes are allowed in `custom` (we ship our own features first; upstream PRs are optional). Name fork migrations `YYYYMMDD_reika_<topic>.sql` and make them additive and idempotent (`IF NOT EXISTS`) so upstream migrations keep applying cleanly.

## Operational notes

- **Never scale app to 2+ replicas**: in-memory rate-limit counters and DEK cache (per connection) are not shared across instances.
- **Deploys keep users signed in**: `/opt/finlynq/docker-compose.yml` pins `DEPLOY_GENERATION` (e.g. `"pinned-20261002"`) in the app environment, so `scripts/entrypoint.sh` respects it instead of stamping `date +%s` and JWTs survive a restart. The in-memory DEK cache still empties on restart, so users see the Unlock banner (passkey/password) once, not a sign-in. Open tabs get a "New version available, Update" bar (`<VersionGate>`, compares the bundle's `NEXT_PUBLIC_APP_BUILD` with `GET /api/version`). To force everyone to sign in again (e.g. after a security incident), change the pinned value and redeploy.
- **`/health` checks DB only**: `SELECT 1` via the postgres connection pool; does not verify the app itself is responsive.
