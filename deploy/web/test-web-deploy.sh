#!/usr/bin/env bash
# Tests for web-deploy.sh against a scratch WEB_ROOT. Run: bash deploy/web/test-web-deploy.sh
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
D=$HERE/web-deploy.sh
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
export WEB_ROOT=$T/web
pass=0; fail=0
ok() { pass=$((pass+1)); echo "PASS $1"; }
bad() { fail=$((fail+1)); echo "FAIL $1"; }
chk() { local n=$1; shift; if "$@"; then ok "$n"; else bad "$n"; fi; }

mkbuild() { # dir sha asset-names...
  local dir=$1 sha=$2; shift 2
  mkdir -p "$dir/assets"
  local tags=""
  for a in "$@"; do echo "/* $a $sha */" >"$dir/assets/$a"; tags="$tags<script type=\"module\" src=\"/web/assets/$a\"></script>"; done
  echo "<!doctype html><html><head><script src=\"/web/theme-init.js\"></script>$tags<link rel=\"stylesheet\" href=\"/web/assets/app-$sha.css\"></head><body></body></html>" >"$dir/index.html"
  echo "body{}" >"$dir/assets/app-$sha.css"
  echo "console.log(1)" >"$dir/theme-init.js"
  echo "// sw $sha" >"$dir/sw.js"
  echo "{\"build\":\"$sha\"}" >"$dir/version.json"
}
cur() { readlink "$WEB_ROOT/current"; }

mkbuild "$T/b1" aaa111 main-1.js chunk-shared.js
mkbuild "$T/b2" bbb222 main-2.js chunk-shared.js

# 1. first deploy
out=$(bash "$D" "$T/b1" aaa111 2>&1); rc=$?
chk "deploy1 exit 0" test $rc -eq 0
chk "current -> releases/aaa111" test "$(cur)" = releases/aaa111
chk "index.html served via current" test -f "$WEB_ROOT/current/index.html"
chk "assets in shared dir" test -f "$WEB_ROOT/assets/main-1.js"
chk "assets not in release dir" test ! -e "$WEB_ROOT/releases/aaa111/assets"
chk "log has timestamp+elapsed" grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]{8} web-deploy: ok sha=aaa111 elapsed=[0-9.]+s' <<<"$out"

# 2. second deploy: sha defaulted from version.json, assets of release 1 retained (no --delete)
bash "$D" "$T/b2" >/dev/null 2>&1
chk "deploy2 switched" test "$(cur)" = releases/bbb222
chk "old unique asset kept" test -f "$WEB_ROOT/assets/main-1.js"
chk "new asset present" test -f "$WEB_ROOT/assets/main-2.js"

# 3. no dangling/tmp symlink, atomic swap leaves no current.tmp
chk "no current.tmp left" test ! -e "$WEB_ROOT/current.tmp" -a ! -L "$WEB_ROOT/current.tmp"

# 4. atomicity: hammer reads of current/version.json while deploying alternately
( for i in $(seq 1 40); do
    python3 -I - "$WEB_ROOT/current/version.json" <<'PY' || echo BROKEN >>"$WEB_ROOT/.reader-errors"
import json,sys; json.load(open(sys.argv[1]))
PY
  done ) &
RPID=$!
for i in 1 2 3 4 5 6; do bash "$D" "$T/b1" aaa111 >/dev/null 2>&1; bash "$D" "$T/b2" bbb222 >/dev/null 2>&1; done
wait $RPID
chk "reader never saw broken current" test ! -e "$WEB_ROOT/.reader-errors"

# 5. rollback
bash "$D" "$T/b2" bbb222 >/dev/null 2>&1
bash "$D" --rollback >/dev/null 2>&1
chk "rollback -> aaa111" test "$(cur)" = releases/aaa111
bash "$D" --rollback >/dev/null 2>&1
chk "rollback again toggles back -> bbb222" test "$(cur)" = releases/bbb222

# 6. smoke failures: missing asset, version mismatch, invalid json; current unchanged
mkbuild "$T/b3" ccc333 main-3.js; rm "$T/b3/assets/main-3.js"
# index references main-3.js, but also the sync removed nothing: file must not exist in shared assets
out=$(bash "$D" "$T/b3" ccc333 2>&1); rc=$?
chk "missing asset -> fail" test $rc -eq 1
chk "missing asset: current unchanged" test "$(cur)" = releases/bbb222
chk "missing asset: release removed" test ! -e "$WEB_ROOT/releases/ccc333"
mkbuild "$T/b4" ddd444 main-4.js; echo '{"build":"zzz"}' >"$T/b4/version.json"
bash "$D" "$T/b4" ddd444 >/dev/null 2>&1; rc=$?
chk "version mismatch -> fail" test $rc -eq 1
echo 'not json' >"$T/b4/version.json"
bash "$D" "$T/b4" ddd444 >/dev/null 2>&1; rc=$?
chk "bad version.json -> fail" test $rc -eq 1
chk "still on bbb222" test "$(cur)" = releases/bbb222
bash "$D" "$T/b1" "../evil" >/dev/null 2>&1; rc=$?
chk "path traversal sha rejected" test $rc -eq 1

# 7. lock: hold the lock, second run exits 75; then lock wait succeeds
( exec 8>"$WEB_ROOT/.web-deploy.lock"; flock 8; sleep 3 ) &
sleep 0.5
bash "$D" "$T/b2" bbb222 >/dev/null 2>&1; rc=$?
chk "concurrent run exits 75" test $rc -eq 75
LOCK_WAIT=10 bash "$D" "$T/b2" bbb222 >/dev/null 2>&1; rc=$?
chk "LOCK_WAIT run succeeds after release" test $rc -eq 0
wait

# 8. pruning: 14 more releases, KEEP_RELEASES=10; shared asset in all, old unreferenced assets aged
rm -rf "$WEB_ROOT"; mkdir -p "$WEB_ROOT"
for i in $(seq 1 14); do
  s=$(printf 'r%02d' "$i"); mkbuild "$T/p$i" "$s" "uniq-$s.js" chunk-shared.js
  bash "$D" "$T/p$i" "$s" >/dev/null 2>&1
  touch -d "@$((1700000000 + i))" "$WEB_ROOT/releases/$s"   # deterministic recency order
done
bash "$D" "$T/p14" r14 >/dev/null 2>&1
n=$(ls -1 "$WEB_ROOT/releases" | wc -l)
chk "10 releases kept (got $n)" test "$n" -eq 10
chk "oldest release pruned" test ! -e "$WEB_ROOT/releases/r01"
chk "r05 kept" test -d "$WEB_ROOT/releases/r05"
# age all assets 40 days; then deploy again: referenced stay, unreferenced old go
find "$WEB_ROOT/assets" -type f -exec touch -d '40 days ago' {} +
mkbuild "$T/p15" r15 uniq-r15.js chunk-shared.js
# make the build's own files old too so only touch-refresh keeps them (tests refresh logic)
bash "$D" "$T/p15" r15 >/dev/null 2>&1
chk "unreferenced old asset (r01) pruned" test ! -e "$WEB_ROOT/assets/uniq-r01.js"
chk "referenced old asset (r06, kept release) retained" test -f "$WEB_ROOT/assets/uniq-r06.js"
chk "shared chunk retained" test -f "$WEB_ROOT/assets/chunk-shared.js"
chk "new release assets present" test -f "$WEB_ROOT/assets/uniq-r15.js"
# young unreferenced asset is kept (age < 30d)
echo x >"$WEB_ROOT/assets/young-orphan.js"
bash "$D" "$T/p15" r15 >/dev/null 2>&1
chk "young unreferenced asset kept" test -f "$WEB_ROOT/assets/young-orphan.js"
# rollback after prune lands on an existing release
bash "$D" --rollback >/dev/null 2>&1; rc=$?
chk "rollback after prune ok" test $rc -eq 0
chk "current exists after rollback" test -f "$WEB_ROOT/current/index.html"

# 9. speed
mkbuild "$T/big" speed1 main.js; for i in $(seq 1 300); do echo "x$i" >"$T/big/assets/c$i.js"; done
s=$(date +%s%N); bash "$D" "$T/big" speed1 >/dev/null 2>&1; e=$(( ($(date +%s%N)-s)/1000000 ))
echo "info: deploy of 300-file build took ${e} ms (rsync: $(command -v rsync >/dev/null && echo yes || echo 'no, cp -a fallback'))"
chk "deploy under 5 s" test "$e" -lt 5000

echo "RESULT pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
