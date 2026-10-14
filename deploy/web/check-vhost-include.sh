#!/usr/bin/env bash
# Fails (exit 1) if the money.reika.vn vhost lacks the SPA include (CloudPanel may regenerate the vhost).
# Also checks that the include precedes `location / {` and that the included file exists.
#   check-vhost-include.sh [vhost-file]    default /etc/nginx/sites-enabled/money.reika.vn.conf
set -euo pipefail
V=${1:-/etc/nginx/sites-enabled/money.reika.vn.conf}
INC=/etc/nginx/money-spa-routes.conf
[ -f "$V" ] || { echo "FAIL: vhost not found: $V" >&2; exit 1; }
inc_line=$(grep -nE '^[[:space:]]*include[[:space:]]+/etc/nginx/money-spa-routes\.conf;' "$V" | head -1 | cut -d: -f1 || true)
[ -n "$inc_line" ] || { echo "FAIL: include $INC missing from $V (vhost regenerated? re-apply, see README)" >&2; exit 1; }
root_line=$(grep -nE '^[[:space:]]*location[[:space:]]+/[[:space:]]*\{' "$V" | head -1 | cut -d: -f1 || true)
if [ -n "$root_line" ] && [ "$inc_line" -gt "$root_line" ]; then
  echo "FAIL: include (line $inc_line) is after 'location /' (line $root_line); must be before" >&2; exit 1
fi
if [ -z "${CHECK_VHOST_SKIP_FILE:-}" ] && [ ! -f "$INC" ]; then
  echo "FAIL: $INC does not exist (nginx -t would fail); run gen-routes.sh --apply" >&2; exit 1
fi
echo "OK: include present at line $inc_line"
