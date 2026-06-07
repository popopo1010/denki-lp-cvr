#!/usr/bin/env bash
# WP旧URLが静的LPへ301されるか確認
set -euo pipefail

BASE="${WP_REDIRECT_VERIFY_BASE:-https://denkilp.builders-job.com}"

check_redirect() {
  local path="$1"
  local expect="$2"
  local headers loc
  headers=$(curl -sI "${BASE}${path}")
  loc=$(echo "$headers" | tr -d '\r' | grep -i '^location:' | head -1 || true)
  if echo "$loc" | grep -qi "$expect"; then
    echo "✓ ${path} → ${expect}"
    return 0
  fi
  echo "✗ ${path} expected Location containing ${expect}, got: ${loc:-none}" >&2
  return 1
}

check_redirect "/denkikouji-kyujin-2/" "/denki-lp-cvr/denkikouji/"
check_redirect "/denkikouji-kyujin-2?utm_source=test" "/denki-lp-cvr/denkikouji/"
check_redirect "/sekokan/" "/denki-lp-cvr/sekoukanri/"

echo "All WP legacy redirect checks passed."
