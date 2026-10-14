#!/usr/bin/env bash
# Generate /etc/nginx/money-spa-routes.conf (+ empty /etc/nginx/money-spa-sw.conf) from spa-routes.txt.
#
#   gen-routes.sh [--routes FILE] [--out FILE] [--sw-out FILE] [--web-root DIR] [--base /web]
#                 [--enable-sw | --disable-sw] [--apply]
#
#   --apply       back up the old files, install, `nginx -t`; on failure restore, on success reload nginx
#                 (needs root). Without --apply only the files are written (use --out for a scratch path).
#   --enable-sw   write the /sw.js location into the sw include (only once the SPA service worker ships)
#   --disable-sw  write the sw include as an empty stub (default when the file does not exist yet)
# Env: SPA_CSP  optional Content-Security-Policy value added to SPA route responses (omitted when empty).
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROUTES=$HERE/spa-routes.txt
TEMPLATE=$HERE/money-spa-routes.conf.template
OUT=/etc/nginx/money-spa-routes.conf
SW_OUT=/etc/nginx/money-spa-sw.conf
WEB_ROOT=/home/moneyreika/htdocs/money.reika.vn/web
BASE=/web
SW=keep
APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --routes) ROUTES=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    --sw-out) SW_OUT=$2; shift 2 ;;
    --web-root) WEB_ROOT=$2; shift 2 ;;
    --base) BASE=$2; shift 2 ;;
    --template) TEMPLATE=$2; shift 2 ;;
    --enable-sw) SW=on; shift ;;
    --disable-sw) SW=off; shift ;;
    --apply) APPLY=1; shift ;;
    *) echo "unknown arg $1" >&2; exit 2 ;;
  esac
done

[ -f "$ROUTES" ] || { echo "routes file not found: $ROUTES" >&2; exit 1; }
[[ "$BASE" =~ ^/[A-Za-z0-9._-]+$ ]] || { echo "bad --base $BASE" >&2; exit 1; }
[[ "$WEB_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "bad --web-root" >&2; exit 1; }
SPA_CSP=${SPA_CSP:-}
case "$SPA_CSP" in *\"*) echo "SPA_CSP must not contain double quotes" >&2; exit 1 ;; esac

DENY_RE='^/(api|\.well-known|oauth|web|sw\.js|try-demo)(/|$)'
SEG='[A-Za-z0-9._~-]+'
prefixes=(); exacts=()
n=0
while IFS= read -r line || [ -n "$line" ]; do
  n=$((n+1))
  line=${line%%#*}
  line=$(echo "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')
  [ -n "$line" ] || continue
  kind=prefix; path=$line
  if [[ "$line" == =* ]]; then kind=exact; path=${line#=}; fi
  if ! [[ "$path" =~ ^(/$SEG)+$ ]]; then echo "spa-routes.txt:$n: invalid path '$line' (need /seg[/seg...], no trailing slash, no regex)" >&2; exit 1; fi
  if [[ "$path" =~ $DENY_RE ]]; then echo "spa-routes.txt:$n: '$path' is reserved for Next/nginx and cannot be an SPA route" >&2; exit 1; fi
  esc=${path//./\\.}
  esc=${esc:1}   # drop leading slash; the template regex adds ^/
  if [ "$kind" = prefix ]; then prefixes+=("$esc"); else exacts+=("$esc"); fi
done <"$ROUTES"

join_alt() { local IFS='|'; echo "$*"; }
headers='    add_header Cache-Control "no-cache";
    add_header X-Served-By web;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;'
[ -z "$SPA_CSP" ] || headers="$headers
    add_header Content-Security-Policy \"$SPA_CSP\";"

block() { # regex comment
  printf '\n# %s\nlocation ~ %s {\n    root %s/current;\n    try_files /index.html =404;\n%s\n}\n' "$2" "$1" "$WEB_ROOT" "$headers"
}
PREFIX_BLOCK=""; EXACT_BLOCK=""
if [ ${#prefixes[@]} -gt 0 ]; then
  mapfile -t prefixes < <(printf '%s\n' "${prefixes[@]}" | sort -u)
  PREFIX_BLOCK=$(block "^/($(join_alt "${prefixes[@]}"))(/|\$)" "prefix routes (path and everything below)")
fi
if [ ${#exacts[@]} -gt 0 ]; then
  mapfile -t exacts < <(printf '%s\n' "${exacts[@]}" | sort -u)
  EXACT_BLOCK=$(block "^/($(join_alt "${exacts[@]}"))/?\$" "exact routes (no sub-paths)")
fi

render() {
  local t
  t=$(cat "$TEMPLATE")
  t=${t//@BASE@/$BASE}
  t=${t//@WEB_ROOT@/$WEB_ROOT}
  t=${t//@SW_INCLUDE@/$SW_OUT}
  t=${t//@PREFIX_BLOCK@/$PREFIX_BLOCK}
  t=${t//@EXACT_BLOCK@/$EXACT_BLOCK}
  printf '%s\n' "$t"
}
sw_content() {
  if [ "$SW" = on ]; then
    cat <<SWEOF
# Enabled by gen-routes.sh --enable-sw: SPA service worker replaces Next's /sw.js.
location = /sw.js {
    alias $WEB_ROOT/current/sw.js;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Service-Worker-Allowed "/";
    add_header X-Served-By web;
}
SWEOF
  else
    echo "# EMPTY until the SPA service worker ships (gen-routes.sh --enable-sw). /sw.js stays on Next."
  fi
}

TMP=$(mktemp "${OUT}.XXXXXX"); trap 'rm -f "$TMP" "${TMP_SW:-}"' EXIT
render >"$TMP"
write_sw=0
if [ "$SW" != keep ] || [ ! -e "$SW_OUT" ]; then write_sw=1; fi
if [ "$write_sw" -eq 1 ]; then TMP_SW=$(mktemp "${SW_OUT}.XXXXXX"); sw_content >"$TMP_SW"; fi

if [ "$APPLY" -eq 1 ]; then
  ts=$(date +%Y%m%d-%H%M%S)
  for f in "$OUT" "$SW_OUT"; do [ -e "$f" ] && cp -a "$f" "$f.bak-$ts"; done
  chmod 644 "$TMP"; mv -f "$TMP" "$OUT"
  if [ "$write_sw" -eq 1 ]; then chmod 644 "$TMP_SW"; mv -f "$TMP_SW" "$SW_OUT"; fi
  if nginx -t; then
    systemctl reload nginx
    echo "applied and reloaded (backups: *.bak-$ts)"
  else
    echo "nginx -t FAILED, restoring" >&2
    for f in "$OUT" "$SW_OUT"; do if [ -e "$f.bak-$ts" ]; then mv -f "$f.bak-$ts" "$f"; else rm -f "$f"; fi; done
    exit 1
  fi
else
  mv -f "$TMP" "$OUT"
  if [ "$write_sw" -eq 1 ]; then mv -f "$TMP_SW" "$SW_OUT"; fi
  echo "wrote $OUT (sw include: $SW_OUT)"
fi
