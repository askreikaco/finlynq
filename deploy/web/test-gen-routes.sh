#!/usr/bin/env bash
# Tests for gen-routes.sh: regex prefix semantics (python re == PCRE for these patterns), rejects, sw include.
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
chk() { local n=$1; shift; if "$@"; then pass=$((pass+1)); echo "PASS $n"; else fail=$((fail+1)); echo "FAIL $n"; fi; }

cat >"$T/routes.txt" <<'R'
# c
/settings/about
/more
=/settings
/a.b
/dashboard   # trailing comment
R
"$HERE/gen-routes.sh" --routes "$T/routes.txt" --out "$T/r.conf" --sw-out "$T/sw.conf" >/dev/null
chk "generated" test -s "$T/r.conf"
chk "sw include stub has no location" bash -c "! grep -q location '$T/sw.conf'"
chk "braces balanced" python3 -I -c 'import sys;s=open(sys.argv[1]).read();sys.exit(0 if s.count("{")==s.count("}") else 1)' "$T/r.conf"

# which location (spa / next) would each path hit, per generated regexes (first match wins, as nginx regex order)
match() { python3 -I - "$T/r.conf" "$1" <<'PY'
import re,sys
conf=open(sys.argv[1]).read(); p=sys.argv[2]
for m in re.finditer(r'^location ~ (\S+) \{',conf,re.M):
    if re.search(m.group(1),p): print("spa"); sys.exit(0)
print("next")
PY
}
expect() { chk "$1 -> $2" test "$(match "$1")" = "$2"; }
expect /more spa;                 expect /more/ spa;               expect /more/x/y spa
expect /moreover next;            expect /mor next;                expect /more.js next
expect /settings spa;             expect /settings/ spa;           expect /settings/profile next
expect /settings/about spa;       expect /settings/about/x spa;    expect /settings/aboutx next
expect /settingsx next;           expect /a.b/c spa;               expect /aXb next
expect /dashboard/1/edit spa;     expect / next;                   expect /api/dashboard next
expect /x/more next;              expect /web/assets/x.js next;    expect /More next

for bad in '/api/x' '/api' '/.well-known/x' '/sw.js' '/web' '/oauth/authorize' '/try-demo' '/trailing/' 'noslash' '/a(b|c)' '/a b' '=/'; do
  printf '%s\n' "$bad" >"$T/bad.txt"
  chk "reject '$bad'" bash -c "! '$HERE/gen-routes.sh' --routes '$T/bad.txt' --out '$T/bad.conf' --sw-out '$T/bad-sw.conf' >/dev/null 2>&1"
done

printf '' >"$T/empty.txt"
"$HERE/gen-routes.sh" --routes "$T/empty.txt" --out "$T/e.conf" --sw-out "$T/sw.conf" >/dev/null
chk "empty list: no spa route locations" bash -c "! grep -q '^location ~' '$T/e.conf'"

"$HERE/gen-routes.sh" --routes "$T/routes.txt" --out "$T/r.conf" --sw-out "$T/sw.conf" --enable-sw >/dev/null
chk "enable-sw writes /sw.js location" grep -q 'location = /sw.js' "$T/sw.conf"
chk "sw alias to current/sw.js" grep -q 'alias .*/current/sw.js;' "$T/sw.conf"
"$HERE/gen-routes.sh" --routes "$T/routes.txt" --out "$T/r.conf" --sw-out "$T/sw.conf" >/dev/null
chk "default keeps existing sw include" grep -q 'location = /sw.js' "$T/sw.conf"
"$HERE/gen-routes.sh" --routes "$T/routes.txt" --out "$T/r.conf" --sw-out "$T/sw.conf" --disable-sw >/dev/null
chk "disable-sw empties it" bash -c "! grep -q location '$T/sw.conf'"
SPA_CSP="default-src 'self'; script-src 'self'" "$HERE/gen-routes.sh" --routes "$T/routes.txt" --out "$T/c.conf" --sw-out "$T/sw.conf" >/dev/null
chk "CSP header emitted when set" grep -q 'Content-Security-Policy' "$T/c.conf"
chk "CSP absent by default" bash -c "! grep -q Content-Security '$T/r.conf'"
chk "committed spa-routes.txt generates" "$HERE/gen-routes.sh" --out "$T/real.conf" --sw-out "$T/real-sw.conf"
echo "RESULT pass=$pass fail=$fail"; [ "$fail" -eq 0 ]
