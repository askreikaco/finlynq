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
IMG=finlynq-custom

log() { echo "$(date '+%F %T') $*"; }

exec 9>/var/lock/finlynq-deploy.lock
flock -n 9 || { log "another deploy is running"; exit 0; }

[ -d "$SRC/.git" ] || git clone -q -b custom "$REPO" "$SRC"
git -C "$SRC" fetch -q origin custom
git -C "$SRC" checkout -q custom
git -C "$SRC" reset -q --hard origin/custom
SHA=$(git -C "$SRC" rev-parse --short=12 HEAD)

if [ "${1:-}" != "--force" ] && [ -f "$STATE" ] && [ "$(cat "$STATE")" = "$SHA" ]; then
  log "up to date ($SHA)"
  exit 0
fi

log "building $SHA"
docker build -q -t "$IMG:$SHA" "$SRC" >/dev/null

# Rollback target: the image the app is running right now.
docker tag "$(docker inspect --format '{{.Image}}' finlynq-app)" "$IMG:prev"

/usr/local/bin/finlynq-backup.sh

healthy() {
  for _ in $(seq 1 36); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' finlynq-app 2>/dev/null)" = healthy ] && return 0
    sleep 5
  done
  return 1
}

docker tag "$IMG:$SHA" "$IMG:current"
(cd "$DIR" && docker compose up -d app)

if healthy; then
  echo "$SHA" > "$STATE"
  log "deployed $SHA"
else
  log "health check failed for $SHA, rolling back"
  docker tag "$IMG:prev" "$IMG:current"
  (cd "$DIR" && docker compose up -d app)
  if healthy; then log "rolled back"; else log "ROLLBACK UNHEALTHY"; fi
  exit 1
fi

# Keep the three newest build tags (plus current/prev); drop old build cache.
docker images "$IMG" --format '{{.CreatedAt}}|{{.Tag}}' \
  | grep -vE '\|(current|prev)$' | sort -r | tail -n +4 | cut -d'|' -f2 \
  | xargs -r -I{} docker rmi "$IMG:{}" >/dev/null 2>&1 || true
docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
