#!/usr/bin/env bash
# Build money.reika.vn from askreikaco/finlynq@custom and roll it out.
#
#   finlynq-deploy.sh           deploy if origin/custom moved since the last deploy
#   finlynq-deploy.sh --force   rebuild and redeploy the current origin/custom
#
# Installed at /usr/local/bin/finlynq-deploy.sh and run nightly from
# /etc/cron.d/finlynq-deploy. Takes a DB backup before switching images and
# rolls back to the previous image if the new container never turns healthy.
# A rollback does not undo DB migrations the new image ran; restore the
# pre-deploy backup in /opt/finlynq/backups if the old code can't read the schema.
set -euo pipefail

REPO=https://github.com/askreikaco/finlynq.git
DIR=/opt/finlynq
SRC=$DIR/src
STATE=$DIR/.deployed-sha
FAILED_SHA=$DIR/.failed-sha
IMG=finlynq-custom

log() { echo "$(date '+%F %T') $*"; }

exec 9>/var/lock/finlynq-deploy.lock
flock -n 9 || { log "another deploy is running"; exit 0; }

[ -d "$SRC/.git" ] || git clone -q -b custom "$REPO" "$SRC"
git -C "$SRC" fetch -q origin custom
git -C "$SRC" checkout -q custom
git -C "$SRC" reset -q --hard origin/custom
SHA=$(git -C "$SRC" rev-parse --short=12 HEAD)

# Check if a previous deploy of this SHA failed; skip unless --force
if [ "${1:-}" != "--force" ] && [ -f "$FAILED_SHA" ] && [ "$(cat "$FAILED_SHA")" = "$SHA" ]; then
  log "skipping $SHA (previous deploy failed; use --force to retry)"
  exit 0
fi

if [ "${1:-}" != "--force" ] && [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$SHA" ]; then
  log "up to date ($SHA)"
  exit 0
fi

# Check disk usage; abort if >90%
DISK_PERCENT=$(df --output=pcent /var/lib/docker | tail -1 | tr -dc 0-9)
if [ "$DISK_PERCENT" -gt 90 ]; then
  log "disk usage ${DISK_PERCENT}% exceeds 90%; aborting deploy"
  exit 1
fi

log "building $SHA"
docker build --pull -q -t "$IMG:$SHA" "$SRC" >/dev/null

# Preserve the previous image for rollback (tag the currently running image as 'prev')
PREV=$(docker inspect --format '{{.Image}}' finlynq-app 2>/dev/null || true)
if [ -n "$PREV" ]; then
  docker tag "$PREV" "$IMG:prev"
fi

/usr/local/bin/finlynq-backup.sh

# Check if the new image has any new migration files compared to the previous image
if [ -n "$PREV" ]; then
  PREV_MIGRATIONS=$(docker run --rm "$IMG:prev" ls scripts/migrations 2>/dev/null | sort || true)
  NEW_MIGRATIONS=$(docker run --rm "$IMG:$SHA" ls scripts/migrations 2>/dev/null | sort || true)

  if [ "$NEW_MIGRATIONS" != "$PREV_MIGRATIONS" ]; then
    NEW_FILES=$(comm -13 <(echo "$PREV_MIGRATIONS") <(echo "$NEW_MIGRATIONS") || true)
    if [ -n "$NEW_FILES" ]; then
      log "schema-changing deploy detected; rollback requires DB restore"
      log "New migration files:"
      echo "$NEW_FILES" | sed 's/^/  /'
      SCHEMA_CHANGE=true
    else
      SCHEMA_CHANGE=false
    fi
  else
    SCHEMA_CHANGE=false
  fi
else
  # First deploy; no previous image to compare
  SCHEMA_CHANGE=false
fi

healthy() {
  for _ in $(seq 1 120); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' finlynq-app 2>/dev/null)" = healthy ]; then
      return 0
    fi
    # Also check if migrations are complete in the logs
    if docker logs finlynq-app 2>/dev/null | grep -q "\[entrypoint\] Migrations complete"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

docker tag "$IMG:$SHA" "$IMG:current"
(cd "$DIR" && docker compose up -d app)

if healthy; then
  rm -f "$FAILED_SHA"
  echo "$SHA" > "$STATE"
  log "deployed $SHA"
else
  log "health check failed for $SHA, rolling back"
  echo "$SHA" > "$FAILED_SHA"

  # Only auto-rollback if this is not a schema-changing deploy
  if [ "${SCHEMA_CHANGE:-false}" = true ]; then
    log "ERROR: schema-changing deploy failed; rollback requires DB restore"
    exit 1
  fi

  if [ -n "$PREV" ]; then
    docker tag "$IMG:prev" "$IMG:current"
    (cd "$DIR" && docker compose up -d app)
    if healthy; then
      log "rolled back"
    else
      log "ROLLBACK UNHEALTHY"
      exit 1
    fi
  else
    log "no previous image to rollback to"
    exit 1
  fi
  exit 1
fi

# Keep the three newest build tags (plus current/prev); drop old build cache.
docker images "$IMG" --format '{{.CreatedAt}}|{{.Tag}}' \
  | grep -vE '\|(current|prev)$' | sort -r | tail -n +4 | cut -d'|' -f2 \
  | xargs -r -I{} docker rmi "$IMG:{}" >/dev/null 2>&1 || true

# Prune unused images and builder cache
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f --filter until=48h >/dev/null 2>&1 || true
