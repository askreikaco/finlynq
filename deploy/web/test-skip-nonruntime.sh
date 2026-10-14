#!/usr/bin/env bash
# Harness for finlynq-deploy.skip-nonruntime.patch: applies it to the live-script copy given as $1
# (default: reference/finlynq-deploy.sh.live), points it at a scratch git repo + fake docker, runs scenarios.
#   bash deploy/web/test-skip-nonruntime.sh /path/to/finlynq-deploy.sh.live
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
LIVE=${1:-${FINLYNQ_DEPLOY_LIVE:-$HERE/reference/finlynq-deploy.sh.live}}
[ -f "$LIVE" ] || { echo "usage: $0 <copy of /usr/local/bin/finlynq-deploy.sh>" >&2; exit 2; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
chk() { local n=$1; shift; if "$@"; then pass=$((pass+1)); echo "PASS $n"; else fail=$((fail+1)); echo "FAIL $n"; fi; }

# 1. patch applies cleanly and parses
mkdir "$T/patchtest" && cp "$LIVE" "$T/patchtest/finlynq-deploy.sh"
chk "patch -p1 applies cleanly" bash -c "cd '$T/patchtest' && patch -p1 --dry-run -s < '$HERE/finlynq-deploy.skip-nonruntime.patch'"
( cd "$T/patchtest" && patch -p1 -s < "$HERE/finlynq-deploy.skip-nonruntime.patch" )
chk "bash -n patched script" bash -n "$T/patchtest/finlynq-deploy.sh"
mkdir -p "$T/g" && cp "$LIVE" "$T/g/finlynq-deploy.sh"
chk "git apply --check agrees" bash -c "cd '$T/g' && git init -q . && git apply --check -p1 '$HERE/finlynq-deploy.skip-nonruntime.patch'"

# 2. sandboxed copy of the patched script
SB=$T/sb; mkdir -p "$SB/opt" "$SB/bin" "$SB/log"
sed -e "s#^REPO=.*#REPO=$T/origin.git#" -e "s#^DIR=/opt/finlynq#DIR=$SB/opt#" \
    -e "s#/var/lock/finlynq-deploy.lock#$SB/lock#" -e "s#/var/log/#$SB/log/#g" \
    -e "s#/usr/local/bin/finlynq-backup.sh#$SB/bin/backup.sh#" -e "s#/var/lib/docker#/tmp#" \
    "$T/patchtest/finlynq-deploy.sh" >"$SB/deploy.sh"
printf '#!/bin/sh\necho BACKUP >>%s/docker.log\n' "$SB" >"$SB/bin/backup.sh"
cat >"$SB/bin/docker" <<DOCK
#!/usr/bin/env bash
echo "docker \$*" >>"$SB/docker.log"
case "\$*" in
  "buildx ls") echo "NAME/NODE DRIVER"; echo "finlynq-capped docker-container" ;;
  *"State.Health.Status"*) echo healthy ;;
  *"State.Status"*) echo running ;;
  *".Image"*) echo sha256:prev ;;
  *"run --rm"*) echo 001.sql ;;
esac
exit 0
DOCK
chmod +x "$SB/bin/docker" "$SB/bin/backup.sh"
export PATH=$SB/bin:$PATH

# 3. scratch origin repo, branch custom
git init -q --bare -b custom "$T/origin.git"
git clone -q "$T/origin.git" "$T/work" 2>/dev/null
cd "$T/work" && git config user.email t@t && git config user.name t && git checkout -q -b custom
mkdir -p src tests e2e docs _ai .github/workflows deploy/web
echo 1 >src/a.ts; echo 1 >tests/a.test.ts; echo 1 >README.md
git add -A && git commit -qm init && git push -q origin custom 2>/dev/null

builds() { grep -c 'buildx build' "$SB/docker.log" 2>/dev/null || true; }
run() { bash "$SB/deploy.sh" "$@" 2>&1; }
commit() { git add -A && git commit -qm "$1" && git push -q origin custom 2>/dev/null; }
state() { cat "$SB/opt/.deployed-sha" 2>/dev/null; }
head12() { git rev-parse --short=12 HEAD; }
: >"$SB/docker.log"

out=$(run); chk "first deploy (no state) builds" test "$(builds)" = 1
chk "state = head after build" test "$(state)" = "$(head12)"

out=$(run); chk "same sha: up to date, no build" bash -c "[ \"$(builds)\" = 1 ] && grep -q 'up to date' <<<\"$out\""

echo 2 >tests/a.test.ts; echo 2 >e2e/x.spec.ts; echo d >docs/d.txt; echo n >_ai/n.txt; echo 2 >README.md
echo y >.github/workflows/ci.yml; echo s >deploy/web/web-deploy.sh; echo sub >src/NOTES.md
commit "non-runtime only"
out=$(run); chk "non-runtime diff skipped (no new build)" test "$(builds)" = 1
chk "log line 'skip: non-runtime diff'" grep -q "skip: non-runtime diff ($(head12))" <<<"$out"
chk "state updated to head on skip" test "$(state)" = "$(head12)"

echo 3 >docs/more.md; commit "docs 2"; out=$(run)
chk "second docs-only commit skipped too" test "$(builds)" = 1

echo 3 >src/a.ts; echo 3 >docs/more.md; commit "mixed"; out=$(run)
chk "mixed runtime+docs builds" test "$(builds)" = 2
chk "state after build = head" test "$(state)" = "$(head12)"

echo 4 >docs/more.md; commit "docs 3"
out=$(run --force); chk "--force never skips" test "$(builds)" = 3

echo 5 >docs/more.md; commit "docs 4"
echo deadbeefdeadbeef >"$SB/opt/.deployed-sha"
out=$(run); chk "unknown old sha in clone: does not skip" test "$(builds)" = 4

git mv src/a.ts docs/a-moved.md; commit "rename runtime file into docs"
out=$(run); chk "rename src->docs is runtime change (no-renames)" test "$(builds)" = 5

echo 6 >package.json; commit "package.json"; out=$(run)
chk "package.json is runtime" test "$(builds)" = 6
echo 7 >next.config.ts; echo 7 >docs/q.md; commit "cfg"; out=$(run)
chk "Dockerfile/config-level file is runtime" test "$(builds)" = 7

git commit -q --allow-empty -m empty && git push -q origin custom; out=$(run)
chk "empty commit (no file diff) skipped" test "$(builds)" = 7
chk "empty commit state = head" test "$(state)" = "$(head12)"

echo "RESULT pass=$pass fail=$fail"; [ "$fail" -eq 0 ]
