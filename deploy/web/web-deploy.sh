#!/usr/bin/env bash
# Deploy a finished SPA build to the nginx-served web root. No node restart, no docker.
#
#   web-deploy.sh <build-dir> [<sha>]   publish build as release <sha> and switch `current`
#   web-deploy.sh --rollback            switch `current` to the previous release
#
# build-dir: index.html, version.json, sw.js, assets/ (hashed files), + other non-hashed files.
# sha: release id (default: "build" field of version.json). version.json build MUST equal it.
# Layout under $WEB_ROOT:
#   assets/            hashed files, shared by all releases, never --delete'd, pruned by age
#   releases/<sha>/    index.html, sw.js, version.json, theme-init.js, assets.list (build's asset names)
#   current            symlink -> releases/<sha> (atomic switch)
#   .history           one line per switch (used by --rollback)
# Run as the site user (e.g. moneyreika), never root.
# Env: WEB_ROOT (default /home/moneyreika/htdocs/money.reika.vn/web), WEB_BASE (default /web),
#      KEEP_RELEASES (10), ASSET_DAYS (30), LOG_FILE (also append log lines there),
#      LOCK_WAIT (seconds to wait for the lock, default 0 = fail fast, exit 75).
set -euo pipefail

WEB_ROOT=${WEB_ROOT:-/home/moneyreika/htdocs/money.reika.vn/web}
WEB_BASE=${WEB_BASE:-/web}
KEEP_RELEASES=${KEEP_RELEASES:-10}
ASSET_DAYS=${ASSET_DAYS:-30}
LOCK_WAIT=${LOCK_WAIT:-0}
LOG_FILE=${LOG_FILE:-}
BUDGET_S=5

now_ns() { date +%s%N; }
T0=$(now_ns)
elapsed() { awk -v a="$T0" -v b="$(now_ns)" 'BEGIN{printf "%.2f", (b-a)/1e9}'; }
log() {
  local line
  line="$(date '+%F %T') web-deploy: $*"
  echo "$line"
  if [ -n "$LOG_FILE" ]; then echo "$line" >>"$LOG_FILE" 2>/dev/null || true; fi
}
die() { log "ERROR: $* (elapsed $(elapsed)s)"; exit 1; }

# sync_dir SRC DST: copy contents of SRC into DST, no delete. rsync -a; cp -a fallback if rsync is absent.
sync_dir() {
  if command -v rsync >/dev/null 2>&1; then rsync -a "$1"/ "$2"/; else cp -a "$1"/. "$2"/; fi
}

valid_sha() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]]; }

switch_to() { # atomic symlink swap
  local sha=$1
  ln -sfn "releases/$sha" "$WEB_ROOT/current.tmp"
  mv -Tf "$WEB_ROOT/current.tmp" "$WEB_ROOT/current"
  echo "$sha" >>"$WEB_ROOT/.history"
}

current_sha() {
  local t
  t=$(readlink "$WEB_ROOT/current" 2>/dev/null || true)
  echo "${t##*/}"
}

json_build() { python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["build"])' "$1"; }

# smoke RELEASE_DIR SHA: file-level checks that mimic what nginx will serve
smoke() {
  local rel=$1 sha=$2 b ref path n=0
  [ -f "$rel/index.html" ] || die "smoke: index.html missing"
  [ -f "$rel/version.json" ] || die "smoke: version.json missing"
  b=$(json_build "$rel/version.json") || die "smoke: version.json does not parse"
  [ "$b" = "$sha" ] || die "smoke: version.json build '$b' != sha '$sha'"
  [ -f "$rel/sw.js" ] || log "WARN: sw.js missing in release (ok until the SPA service worker ships)"
  while IFS= read -r ref; do
    ref=${ref#*=}; ref=${ref#[\"\']}; ref=${ref%[\"\']}
    ref=${ref%%[?#]*}
    case "$ref" in ''|http:*|https:*|//*|data:*|mailto:*|javascript:*|blob:*) continue ;; esac
    case "$ref" in /*) ;; *) ref="$WEB_BASE/${ref#./}" ;; esac
    case "$ref" in *..*) die "smoke: path traversal in reference '$ref'" ;; esac
    n=$((n+1))
    case "$ref" in
      "$WEB_BASE"/assets/*) path="$WEB_ROOT/assets/${ref#"$WEB_BASE"/assets/}" ;;
      "$WEB_BASE"/*)        path="$rel/${ref#"$WEB_BASE"/}" ;;
      /*)                   path="$rel$ref"; [ -f "$path" ] || continue ;; # root path owned by Next/public: not ours to verify
    esac
    [ -f "$path" ] || die "smoke: index.html references missing file $ref"
  done < <(grep -oE "(src|href)=(\"[^\"]*\"|'[^']*')" "$rel/index.html" || true)
  [ "$n" -gt 0 ] || die "smoke: index.html references no files (empty build?)"
  log "smoke ok: $n references, build=$b"
}

prune() {
  local cur keep_list d s listed
  cur=$(current_sha)
  # newest KEEP_RELEASES by mtime, plus current (rollback may have moved it back)
  keep_list=$(cd "$WEB_ROOT/releases" && ls -1dt -- */ 2>/dev/null | sed 's#/$##' | head -n "$KEEP_RELEASES" || true)
  [ -n "$cur" ] && keep_list=$(printf '%s\n%s\n' "$keep_list" "$cur" | sort -u)
  for d in $(cd "$WEB_ROOT/releases" && ls -1d -- */ 2>/dev/null | sed 's#/$##'); do
    if ! grep -Fxq -- "$d" <<<"$keep_list"; then
      rm -rf -- "${WEB_ROOT:?}/releases/$d"
      log "pruned release $d"
    fi
  done
  # referenced = union of assets.list of kept releases; a release without a list keeps everything (fail safe)
  local ref_file
  ref_file=$(mktemp)
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    if [ -f "$WEB_ROOT/releases/$s/assets.list" ]; then cat "$WEB_ROOT/releases/$s/assets.list" >>"$ref_file"
    else log "WARN: release $s has no assets.list; skipping asset prune"; rm -f "$ref_file"; return 0; fi
  done <<<"$keep_list"
  sort -u -o "$ref_file" "$ref_file"
  local removed=0
  while IFS= read -r -d '' f; do
    listed=${f#"$WEB_ROOT/assets/"}
    if ! grep -Fxq -- "$listed" "$ref_file"; then rm -f -- "$f"; removed=$((removed+1)); fi
  done < <(find "$WEB_ROOT/assets" -type f -mtime "+$ASSET_DAYS" -print0)
  [ "$removed" -eq 0 ] || log "pruned $removed unreferenced assets older than ${ASSET_DAYS}d"
  rm -f "$ref_file"
}

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

MODE=deploy
case "${1:-}" in
  --rollback) MODE=rollback ;;
  -h|--help|'') usage ;;
esac

mkdir -p "$WEB_ROOT/assets" "$WEB_ROOT/releases"
exec 9>"$WEB_ROOT/.web-deploy.lock"
if ! flock -w "$LOCK_WAIT" 9; then
  log "another web-deploy is running; exiting"
  exit 75
fi

if [ "$MODE" = rollback ]; then
  cur=$(current_sha)
  [ -n "$cur" ] || die "rollback: no current release"
  prev=""
  if [ -f "$WEB_ROOT/.history" ]; then
    while IFS= read -r h; do
      if [ "$h" != "$cur" ] && [ -d "$WEB_ROOT/releases/$h" ]; then prev=$h; fi
    done < <(tac "$WEB_ROOT/.history")
  fi
  [ -n "$prev" ] || die "rollback: no previous release available"
  switch_to "$prev"
  log "rolled back $cur -> $prev (elapsed $(elapsed)s)"
  exit 0
fi

BUILD=${1%/}
[ -d "$BUILD" ] || die "build dir not found: $BUILD"
[ -f "$BUILD/index.html" ] || die "$BUILD/index.html missing"
[ -d "$BUILD/assets" ] || die "$BUILD/assets missing"
[ -f "$BUILD/version.json" ] || die "$BUILD/version.json missing"
SHA=${2:-$(json_build "$BUILD/version.json")}
valid_sha "$SHA" || die "invalid sha '$SHA'"
log "start sha=$SHA build=$BUILD root=$WEB_ROOT"

# (a) hashed assets, shared, never --delete
sync_dir "$BUILD/assets" "$WEB_ROOT/assets"
# refresh mtime of this build's assets so age-pruning counts from the last release using them
( cd "$BUILD/assets" && find . -type f -print0 | sed -z 's#^\./##' | (cd "$WEB_ROOT/assets" && xargs -0 -r touch -c --) )
log "assets synced"

# (b) release dir: everything non-hashed, staged then renamed into place
STAGE="$WEB_ROOT/releases/.stage-$SHA.$$"
rm -rf "$STAGE"; mkdir -p "$STAGE"
if command -v rsync >/dev/null 2>&1; then rsync -a --exclude=/assets/ "$BUILD"/ "$STAGE"/
else ( cd "$BUILD" && tar cf - --exclude=./assets . ) | ( cd "$STAGE" && tar xf - ); fi
( cd "$BUILD/assets" && find . -type f | sed 's#^\./##' | sort ) >"$STAGE/assets.list"
chmod -R a+rX "$STAGE"
REL="$WEB_ROOT/releases/$SHA"
if [ -e "$REL" ]; then mv -T "$REL" "$WEB_ROOT/releases/.old-$SHA.$$"; fi
mv -T "$STAGE" "$REL"
rm -rf "$WEB_ROOT/releases/.old-$SHA.$$"
touch "$REL"
log "release staged: releases/$SHA"

# (c) smoke test the new release before it can be served
if ! ( smoke "$REL" "$SHA" ); then
  rm -rf "$REL"
  log "ERROR: smoke failed; release removed, current unchanged (elapsed $(elapsed)s)"
  exit 1
fi

# (d) atomic switch
PREV=$(current_sha)
switch_to "$SHA"
log "switched current: ${PREV:-none} -> $SHA"

# (e) retention
prune

T=$(elapsed)
log "ok sha=$SHA elapsed=${T}s"
if awk -v t="$T" -v b="$BUDGET_S" 'BEGIN{exit !(t>b)}'; then log "WARN: over ${BUDGET_S}s budget (${T}s)"; fi
